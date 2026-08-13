import * as Crypto from 'expo-crypto';
import { AppState, Platform, type AppStateStatus } from 'react-native';
import { type PropsWithChildren, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';

import { WeatherApplicationController } from '@/features/weather/application/weather-application-controller';
import {
  WeatherApplicationContext,
  type WeatherApplicationValue,
} from '@/features/weather/application/weather-application-context';
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

export function WeatherApplicationProvider({
  children,
  localProfileId,
}: PropsWithChildren<{ localProfileId: string }>) {
  const provider = useMemo(() => createWeatherProvider(), []);
  const controller = useMemo(() => new WeatherApplicationController(localProfileId, {
    loadRepository, provider, deviceLocation, now,
  }), [localProfileId, provider]);
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
  }), [controller, state]);

  return <WeatherApplicationContext value={value}>{children}</WeatherApplicationContext>;
}
