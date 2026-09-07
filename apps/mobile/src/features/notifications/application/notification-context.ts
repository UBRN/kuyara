import { createContext, use } from 'react';

import type { NotificationApplicationState } from '@/features/notifications/application/notification-application-controller';

export type NotificationApplicationValue = Readonly<{
  state: NotificationApplicationState;
  setOptIn: (optIn: boolean) => Promise<'enabled' | 'blocked' | 'disabled'>;
  openApplicationSettings: () => Promise<void>;
}>;

export const NotificationApplicationContext =
  createContext<NotificationApplicationValue | null>(null);

export function useNotificationApplication(): NotificationApplicationValue {
  const application = use(NotificationApplicationContext);
  if (!application) {
    throw new Error(
      'useNotificationApplication must be used within NotificationApplicationProvider',
    );
  }
  return application;
}
