import { router } from 'expo-router';
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

type NotificationApplicationProviderProps = PropsWithChildren<{
  notificationsOptIn: boolean;
  persistOptIn: (optIn: boolean) => Promise<void>;
  gateway?: NotificationGateway;
}>;

export function NotificationApplicationProvider(
  props: NotificationApplicationProviderProps,
) {
  const defaultGateway = useMemo(() => new ExpoNotificationGateway(), []);
  const gateway = props.gateway ?? defaultGateway;
  const controller = useMemo(
    () => new NotificationApplicationController(gateway, props.persistOptIn),
    [gateway, props.persistOptIn],
  );
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );

  useEffect(() => {
    void controller.refreshPermission();
  }, [controller]);

  useEffect(
    () => gateway.subscribeToResponses(() => router.navigate('/')),
    [gateway],
  );

  const value = useMemo<NotificationApplicationValue>(() => ({
    state,
    setOptIn: (optIn) => controller.setOptIn(optIn),
    sendTestNotification: (content) => controller.sendTestNotification(content),
    openApplicationSettings: () => gateway.openApplicationSettings(),
  }), [controller, gateway, state]);

  return (
    <NotificationApplicationContext value={value}>
      {props.children}
    </NotificationApplicationContext>
  );
}
