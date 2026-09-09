import * as Notifications from 'expo-notifications';
import { Linking, Platform } from 'react-native';

import type {
  NotificationGateway,
  NotificationPermissionState,
} from '@/features/notifications/data/notification-gateway';
import { getDeviceLocale } from '@/localization/device-locale';
import { getMessages } from '@/localization/messages';

const weatherAlertIdentifierPrefix = 'weather-alert:';
const weatherAlertChannelId = 'weather-alerts';

try {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
} catch {
  // SDK failures stay inside this adapter.
}

function mapPermission(
  permission: Notifications.NotificationPermissionsStatus,
): NotificationPermissionState {
  if (permission.granted) {
    return { kind: 'granted' };
  }
  if (permission.status === 'undetermined') {
    return { kind: 'undetermined' };
  }
  return { kind: 'denied', canRequestAgain: permission.canAskAgain };
}

const failedPermission = (): NotificationPermissionState => ({
  kind: 'denied',
  canRequestAgain: false,
});

export class ExpoNotificationGateway implements NotificationGateway {
  private weatherAlertChannelReady = false;

  getPermissionState(): Promise<NotificationPermissionState> {
    return Notifications.getPermissionsAsync().then(mapPermission).catch(failedPermission);
  }

  requestPermission(): Promise<NotificationPermissionState> {
    return Notifications.requestPermissionsAsync().then(mapPermission).catch(failedPermission);
  }

  async openApplicationSettings(): Promise<void> {
    try {
      await Linking.openSettings();
    } catch {
      return;
    }
  }

  async cancelScheduledWeatherAlerts(): Promise<void> {
    try {
      const requests = await Notifications.getAllScheduledNotificationsAsync();
      for (const request of requests) {
        if (!request.identifier.startsWith(weatherAlertIdentifierPrefix)) continue;
        try {
          await Notifications.cancelScheduledNotificationAsync(request.identifier);
        } catch {
          continue;
        }
      }
    } catch {
      return;
    }
  }

  async scheduleWeatherAlert(request: Readonly<{
    identifier: string;
    fireAt: string;
    title: string;
    body: string;
  }>): Promise<void> {
    try {
      if (Platform.OS === 'android' && !this.weatherAlertChannelReady) {
        await Notifications.setNotificationChannelAsync(weatherAlertChannelId, {
          name: getMessages(getDeviceLocale()).notifications.title,
          importance: Notifications.AndroidImportance.DEFAULT,
          sound: null,
        });
        this.weatherAlertChannelReady = true;
      }

      await Notifications.scheduleNotificationAsync({
        identifier: `${weatherAlertIdentifierPrefix}${request.identifier}`,
        content: { title: request.title, body: request.body },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: new Date(request.fireAt),
          ...(Platform.OS === 'android' ? { channelId: weatherAlertChannelId } : {}),
        },
      });
    } catch {
      return;
    }
  }

  subscribeToResponses(listener: () => void): () => void {
    try {
      const subscription = Notifications.addNotificationResponseReceivedListener(listener);
      return () => {
        try {
          subscription.remove();
        } catch {
          return;
        }
      };
    } catch {
      return () => undefined;
    }
  }
}
