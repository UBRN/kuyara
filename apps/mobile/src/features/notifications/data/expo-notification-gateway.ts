import * as Notifications from 'expo-notifications';
import { Linking } from 'react-native';

import type {
  NotificationGateway,
  NotificationPermissionState,
  TestNotificationContent,
} from '@/features/notifications/data/notification-gateway';

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

  async scheduleTestNotification(content: TestNotificationContent): Promise<boolean> {
    try {
      await Notifications.scheduleNotificationAsync({
        content,
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: 2,
          repeats: false,
        },
      });
      return true;
    } catch {
      return false;
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
