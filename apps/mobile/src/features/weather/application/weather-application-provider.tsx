import * as Crypto from 'expo-crypto';
import { AppState, type AppStateStatus } from 'react-native';
import { type PropsWithChildren, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';

import { WeatherApplicationController } from '@/features/weather/application/weather-application-controller';
import {
  WeatherApplicationContext,
  type WeatherApplicationValue,
} from '@/features/weather/application/weather-application-context';
import { DeterministicFakeWeatherProvider } from '@/features/weather/data/deterministic-fake-weather-provider';
import { ExpoDeviceLocationGateway } from '@/features/weather/data/expo-device-location-gateway';
import { LocalWeatherRepository } from '@/features/weather/data/weather-repository';
import { SqliteWeatherLocalDataSource } from '@/features/weather/data/sqlite-weather-local-data-source';
import { openKuyaraDatabase } from '@/infrastructure/sqlite/expo-sqlite-database';
import { migrateDatabase } from '@/infrastructure/sqlite/migrations';

const now = () => new Date().toISOString();
const provider = new DeterministicFakeWeatherProvider({ now });
const deviceLocation = new ExpoDeviceLocationGateway();

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
  const controller = useMemo(() => new WeatherApplicationController(localProfileId, {
    loadRepository, provider, deviceLocation, now,
  }), [localProfileId]);
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
