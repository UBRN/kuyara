import { router } from 'expo-router';
import { AppState } from 'react-native';
import {
  type PropsWithChildren,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from 'react';

import { NotificationApplicationController } from '@/features/notifications/application/notification-application-controller';
import {
  NotificationApplicationContext,
  type NotificationApplicationValue,
} from '@/features/notifications/application/notification-context';
import { ExpoNotificationGateway } from '@/features/notifications/data/expo-notification-gateway';
import type { NotificationGateway } from '@/features/notifications/data/notification-gateway';
import { WeatherAlertScheduler, type WeatherAlertScheduling } from '@/features/notifications/application/weather-alert-scheduler';
import { LocalWeatherAlertDeliveryRepository } from '@/features/notifications/data/weather-alert-delivery-repository';
import { SqliteWeatherAlertDeliveryLocalDataSource } from '@/features/notifications/data/sqlite-weather-alert-delivery-local-data-source';
import { openKuyaraDatabase } from '@/infrastructure/sqlite/expo-sqlite-database';
import { migrateDatabase } from '@/infrastructure/sqlite/migrations';

type NotificationApplicationProviderProps = PropsWithChildren<{
  notificationsOptIn: boolean;
  persistOptIn: (optIn: boolean) => Promise<void>;
  gateway?: NotificationGateway;
  weatherAlertScheduler?: WeatherAlertScheduling;
}>;

async function loadWeatherAlertDeliveryRepository() {
  const database = await openKuyaraDatabase();
  await migrateDatabase(database);
  return new LocalWeatherAlertDeliveryRepository(
    new SqliteWeatherAlertDeliveryLocalDataSource(database),
  );
}

export function NotificationApplicationProvider(
  props: NotificationApplicationProviderProps,
) {
  const defaultGateway = useMemo(() => new ExpoNotificationGateway(), []);
  const gateway = props.gateway ?? defaultGateway;
  const controller = useMemo(
    () => new NotificationApplicationController(gateway, props.persistOptIn),
    [gateway, props.persistOptIn],
  );
  const defaultWeatherAlertScheduler = useMemo(
    () => new WeatherAlertScheduler(
      gateway,
      loadWeatherAlertDeliveryRepository(),
      () => new Date().toISOString(),
    ),
    [gateway],
  );
  const weatherAlertScheduler = props.weatherAlertScheduler ?? defaultWeatherAlertScheduler;
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );

  useEffect(() => {
    void controller.refreshPermission();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void controller.refreshPermission();
    });
    return () => subscription.remove();
  }, [controller]);

  useEffect(
    () => gateway.subscribeToResponses(() => router.navigate('/')),
    [gateway],
  );

  const value = useMemo<NotificationApplicationValue>(() => ({
    state,
    setOptIn: (optIn) => controller.setOptIn(optIn),
    openApplicationSettings: () => gateway.openApplicationSettings(),
    weatherAlertScheduler,
  }), [controller, gateway, state, weatherAlertScheduler]);

  return (
    <NotificationApplicationContext value={value}>
      {props.children}
    </NotificationApplicationContext>
  );
}
