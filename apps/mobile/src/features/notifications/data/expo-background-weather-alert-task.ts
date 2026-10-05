import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';

import { WeatherAlertScheduler } from '@/features/notifications/application/weather-alert-scheduler';
import { loadWeatherAlertDeliveryRepository } from '@/features/notifications/application/weather-alert-delivery-repository-loader';
import { runBackgroundWeatherAlertTask } from '@/features/notifications/data/background-weather-alert-task';
import { ExpoNotificationGateway } from '@/features/notifications/data/expo-notification-gateway';
import { getDeviceTimeZone } from '@/domain/intl-format';
import { loadProfileRepository } from '@/features/profile/application/profile-repository-loader';
import { createWeatherProvider } from '@/features/weather/application/weather-application-provider';
import { loadWeatherRepository } from '@/features/weather/application/weather-repository-loader';
import { systemNow as now } from '@/infrastructure/system-clock';
import { getDeviceHour12, getDeviceLocale, getDeviceTemperatureUnit } from '@/localization/device-locale';

export const backgroundWeatherAlertTaskName = 'kuyara-background-weather-alert-refresh';
export const backgroundWeatherAlertMinimumIntervalMinutes = 15;

const loadProfile = async () => (await loadProfileRepository()).getOrCreateProfile();

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
        getDeviceTimeZone,
      ).reschedule(input),
      getDeviceLocale,
      getDeviceHour12,
      getDeviceTemperatureUnit,
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
