import { AppState, type AppStateStatus } from 'react-native';
import { type PropsWithChildren, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';

import { WeatherApplicationController } from '@/features/weather/application/weather-application-controller';
import {
  WeatherApplicationContext,
  PlaceSearchApplicationContext,
  type PlaceSearchApplicationValue,
  type WeatherApplicationValue,
} from '@/features/weather/application/weather-application-context';
import { usePerformanceTelemetry } from '@/features/analytics/application/use-performance-telemetry';
import { useProductAnalytics } from '@/features/analytics/application/use-product-analytics';
import { resolveAppWorkerBaseUrl } from '@/config/app-worker-base-url';
import { WorkerBaseUrlConfigurationError } from '@/config/worker-base-url';
import { ExpoDeviceLocationGateway } from '@/features/weather/data/expo-device-location-gateway';
import type { WeatherProvider } from '@/features/weather/data/weather-provider';
import { PlaceSearchError } from '@/features/weather/domain/place-search-error';
import { WeatherProviderError } from '@/features/weather/domain/weather-provider-error';
import { loadWeatherRepository } from '@/features/weather/application/weather-repository-loader';
import { WorkerWeatherProvider } from '@/features/weather/data/worker-weather-provider';
import { WorkerPlaceSearchDataSource } from '@/features/weather/data/worker-place-search-data-source';
import type { SearchPlaces } from '@/features/weather/application/place-search-controller';
import { systemNow as now } from '@/infrastructure/system-clock';
const deviceLocation = new ExpoDeviceLocationGateway();

export function createWeatherProvider(): WeatherProvider {
  try {
    return new WorkerWeatherProvider({
      baseUrl: resolveAppWorkerBaseUrl(),
    });
  } catch (error) {
    if (!(error instanceof WorkerBaseUrlConfigurationError)) throw error;
    return {
      fetchSnapshot: () => Promise.reject(new WeatherProviderError('service')),
    };
  }
}

function createPlaceSearch(): SearchPlaces {
  try {
    const source = new WorkerPlaceSearchDataSource({
      baseUrl: resolveAppWorkerBaseUrl(),
    });
    return (request) => source.search(request);
  } catch (error) {
    if (!(error instanceof WorkerBaseUrlConfigurationError)) throw error;
    return () => Promise.reject(new PlaceSearchError('unavailable'));
  }
}

export function WeatherApplicationProvider({
  children,
  localProfileId,
}: PropsWithChildren<{ localProfileId: string }>) {
  const provider = useMemo(() => createWeatherProvider(), []);
  const searchPlaces = useMemo(() => createPlaceSearch(), []);
  const { analytics } = useProductAnalytics();
  const telemetry = usePerformanceTelemetry();
  const controller = useMemo(() => new WeatherApplicationController(localProfileId, {
    loadRepository: loadWeatherRepository, provider, deviceLocation, now,
    captureAnalyticsEvent: (name, properties, options) => analytics.capture(name, properties, options),
    telemetry,
  }), [analytics, localProfileId, provider, telemetry]);
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const appState = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    void controller.initialize();
    const subscription = AppState.addEventListener('change', (next) => {
      const wasInactive = appState.current !== 'active';
      appState.current = next;
      if (wasInactive && next === 'active') void controller.onForeground();
    });
    return () => subscription.remove();
  }, [controller]);

  const value = useMemo<WeatherApplicationValue>(() => ({
    state,
    retry: () => controller.retry(),
    dismissLocationFlow: () => controller.dismissLocationFlow(),
    beginDeviceLocationSelection: () => controller.beginDeviceLocationSelection(),
    confirmDeviceLocationRequest: () => controller.confirmDeviceLocationRequest(),
    openApplicationSettings: () => controller.openApplicationSettings(),
    selectManualLocation: (id) => controller.selectManualLocation(id),
    refresh: () => controller.refresh(),
    revalidateFreshness: controller.revalidateFreshness,
    getSnapshot: controller.getSnapshot,
  }), [controller, state]);

  const placeSearchValue = useMemo<PlaceSearchApplicationValue>(() => ({
    searchPlaces,
    selectPlaceSearchResult: (place) => controller.selectPlaceSearchResult(place),
  }), [controller, searchPlaces]);

  return (
    <WeatherApplicationContext value={value}>
      <PlaceSearchApplicationContext value={placeSearchValue}>{children}</PlaceSearchApplicationContext>
    </WeatherApplicationContext>
  );
}
