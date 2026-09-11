import * as BackgroundTask from 'expo-background-task';
import * as Crypto from 'expo-crypto';
import * as TaskManager from 'expo-task-manager';

import { WeatherAlertScheduler } from '@/features/notifications/application/weather-alert-scheduler';
import { runBackgroundWeatherAlertTask } from '@/features/notifications/data/background-weather-alert-task';
import { ExpoNotificationGateway } from '@/features/notifications/data/expo-notification-gateway';
import { SqliteWeatherAlertDeliveryLocalDataSource } from '@/features/notifications/data/sqlite-weather-alert-delivery-local-data-source';
import { LocalWeatherAlertDeliveryRepository } from '@/features/notifications/data/weather-alert-delivery-repository';
import { LocalProfileRepository } from '@/features/profile/data/profile-repository';
import { SqliteProfileLocalDataSource } from '@/features/profile/data/sqlite-profile-local-data-source';
import { createWeatherProvider } from '@/features/weather/application/weather-application-provider';
import { LocalWeatherRepository } from '@/features/weather/data/weather-repository';
import { SqliteWeatherLocalDataSource } from '@/features/weather/data/sqlite-weather-local-data-source';
import { openKuyaraDatabase } from '@/infrastructure/sqlite/expo-sqlite-database';
import { migrateDatabase } from '@/infrastructure/sqlite/migrations';
import { getDeviceLocale } from '@/localization/device-locale';

export const backgroundWeatherAlertTaskName = 'kuyara-background-weather-alert-refresh';
export const backgroundWeatherAlertMinimumIntervalMinutes = 15;

const now = () => new Date().toISOString();

async function loadProfile() {
  const database = await openKuyaraDatabase();
  await migrateDatabase(database);
  const dataSource = new SqliteProfileLocalDataSource(database, {
    createId: () => Crypto.randomUUID(),
    now,
  });
  return new LocalProfileRepository(dataSource).getOrCreateProfile();
}

async function loadWeatherRepository() {
  const database = await openKuyaraDatabase();
  await migrateDatabase(database);
  return new LocalWeatherRepository(new SqliteWeatherLocalDataSource(database), {
    createId: () => Crypto.randomUUID(),
    now,
  });
}

async function loadWeatherAlertDeliveryRepository() {
  const database = await openKuyaraDatabase();
  await migrateDatabase(database);
  return new LocalWeatherAlertDeliveryRepository(
    new SqliteWeatherAlertDeliveryLocalDataSource(database),
  );
}

TaskManager.defineTask(backgroundWeatherAlertTaskName, async ({ error }) => {
  if (error) return BackgroundTask.BackgroundTaskResult.Failed;

  try {
    const gateway = new ExpoNotificationGateway();
    const outcome = await runBackgroundWeatherAlertTask({
      loadProfile,
      loadWeatherRepository,
      provider: createWeatherProvider(),
      getNotificationPermission: () => gateway.getPermissionState(),
      reschedule: (input) => new WeatherAlertScheduler(
        gateway,
        loadWeatherAlertDeliveryRepository(),
        now,
      ).reschedule(input),
      getDeviceLocale,
      now,
    });
    return outcome === 'success'
      ? BackgroundTask.BackgroundTaskResult.Success
      : BackgroundTask.BackgroundTaskResult.Failed;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

export async function unregisterBackgroundWeatherAlertTask(): Promise<void> {
  try {
    if (!await TaskManager.isTaskRegisteredAsync(backgroundWeatherAlertTaskName)) return;
    await BackgroundTask.unregisterTaskAsync(backgroundWeatherAlertTaskName);
  } catch {
    // SDK and platform availability failures stay inside this adapter.
  }
}

export async function registerBackgroundWeatherAlertTask(): Promise<void> {
  try {
    const [taskManagerAvailable, status] = await Promise.all([
      TaskManager.isAvailableAsync(),
      BackgroundTask.getStatusAsync(),
    ]);
    if (!taskManagerAvailable || status !== BackgroundTask.BackgroundTaskStatus.Available) return;
    if (await TaskManager.isTaskRegisteredAsync(backgroundWeatherAlertTaskName)) return;

    await BackgroundTask.registerTaskAsync(backgroundWeatherAlertTaskName, {
      // This is only a minimum delay; the OS decides when to run and may ignore it.
      minimumInterval: backgroundWeatherAlertMinimumIntervalMinutes,
    });
  } catch {
    // SDK and platform availability failures stay inside this adapter.
  }
}
