import * as Crypto from 'expo-crypto';
import { AppState, Platform, type AppStateStatus } from 'react-native';
import { type PropsWithChildren, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';

import { WeatherApplicationController } from '@/features/weather/application/weather-application-controller';
import {
  WeatherApplicationContext,
  PlaceSearchApplicationContext,
  type PlaceSearchApplicationValue,
  type WeatherApplicationValue,
} from '@/features/weather/application/weather-application-context';
import type { FailureCategory } from '@/domain/failure-category';
import { useProductAnalytics } from '@/features/analytics/application/use-product-analytics';
import { failureCategoryProperty } from '@/features/analytics/domain/analytics-mappers';
import {
  resolveWorkerBaseUrl,
  WorkerBaseUrlConfigurationError,
} from '@/config/worker-base-url';
import { ExpoDeviceLocationGateway } from '@/features/weather/data/expo-device-location-gateway';
import {
  WeatherProviderError,
  type WeatherProvider,
} from '@/features/weather/data/weather-provider';
import { LocalWeatherRepository } from '@/features/weather/data/weather-repository';
import { SqliteWeatherLocalDataSource } from '@/features/weather/data/sqlite-weather-local-data-source';
import { WorkerWeatherProvider } from '@/features/weather/data/worker-weather-provider';
import { PlaceSearchError, WorkerPlaceSearchDataSource } from '@/features/weather/data/worker-place-search-data-source';
import type { SearchPlaces } from '@/features/weather/application/place-search-controller';
import { openKuyaraDatabase } from '@/infrastructure/sqlite/expo-sqlite-database';
import { migrateDatabase } from '@/infrastructure/sqlite/migrations';

const now = () => new Date().toISOString();
const deviceLocation = new ExpoDeviceLocationGateway();

export function createWeatherProvider(): WeatherProvider {
  try {
    return new WorkerWeatherProvider({
      baseUrl: resolveWorkerBaseUrl({
        configuredUrl: process.env.EXPO_PUBLIC_KUYARA_WORKER_BASE_URL,
        isDevelopment: __DEV__,
        platform: Platform.OS === 'android' ? 'android' : Platform.OS === 'web' ? 'web' : 'ios',
      }),
    });
  } catch (error) {
    if (!(error instanceof WorkerBaseUrlConfigurationError)) throw error;
    return {
      fetchSnapshot: () => Promise.reject(new WeatherProviderError('service')),
    };
  }
}

async function loadRepository() {
  const database = await openKuyaraDatabase();
  await migrateDatabase(database);
  return new LocalWeatherRepository(new SqliteWeatherLocalDataSource(database), {
    createId: () => Crypto.randomUUID(),
    now,
  });
}

export function createPlaceSearch(): SearchPlaces {
  try {
    const source = new WorkerPlaceSearchDataSource({
      baseUrl: resolveWorkerBaseUrl({
        configuredUrl: process.env.EXPO_PUBLIC_KUYARA_WORKER_BASE_URL,
        isDevelopment: __DEV__,
        platform: Platform.OS === 'android' ? 'android' : Platform.OS === 'web' ? 'web' : 'ios',
      }),
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
  const { analytics, errorEpisodes } = useProductAnalytics();
  const controller = useMemo(() => new WeatherApplicationController(localProfileId, {
    loadRepository, provider, deviceLocation, now,
    captureAnalyticsEvent: (name, properties, options) => analytics.capture(name, properties, options),
  }), [analytics, localProfileId, provider]);
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const appState = useRef<AppStateStatus>(AppState.currentState);
  const shownFailureRef = useRef<FailureCategory | null>(null);

  useEffect(() => {
    void controller.initialize();
    const subscription = AppState.addEventListener('change', (next) => {
      const wasInactive = appState.current !== 'active';
      appState.current = next;
      if (wasInactive && next === 'active') void controller.onForeground();
    });
    return () => subscription.remove();
  }, [controller]);

  // Taxonomy 5.10: `error_shown`/`error_recovered` for the `weather` surface. Gated on the
  // failure category's own value (not the whole state object) so an unrelated re-render,
  // such as `isRefreshing` toggling on, does not double-count an ongoing failure.
  const currentFailure = state.status === 'ready' ? state.refreshFailure : null;
  useEffect(() => {
    if (currentFailure) {
      shownFailureRef.current = currentFailure;
      errorEpisodes.failed({
        surface: 'weather',
        failureCategory: failureCategoryProperty(currentFailure),
      });
    } else if (shownFailureRef.current) {
      errorEpisodes.recovered({
        surface: 'weather',
        failureCategory: failureCategoryProperty(shownFailureRef.current),
      });
      shownFailureRef.current = null;
    }
  }, [currentFailure, errorEpisodes]);

  const value = useMemo<WeatherApplicationValue>(() => ({
    state,
    retry: () => controller.retry(),
    dismissLocationFlow: () => controller.dismissLocationFlow(),
    beginDeviceLocationSelection: () => controller.beginDeviceLocationSelection(),
    confirmDeviceLocationRequest: () => controller.confirmDeviceLocationRequest(),
    openApplicationSettings: () => controller.openApplicationSettings(),
    selectManualLocation: (id) => controller.selectManualLocation(id),
    refresh: () => controller.refresh(),
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
