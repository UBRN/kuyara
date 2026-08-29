export type NotificationPermissionState =
  | Readonly<{ kind: 'undetermined' }>
  | Readonly<{ kind: 'granted' }>
  | Readonly<{ kind: 'denied'; canRequestAgain: boolean }>;

export type TestNotificationContent = Readonly<{ title: string; body: string }>;

export interface NotificationGateway {
  getPermissionState(): Promise<NotificationPermissionState>;
  requestPermission(): Promise<NotificationPermissionState>;
  openApplicationSettings(): Promise<void>;
  /** Resolves true when the notification was scheduled, false on any failure. */
  scheduleTestNotification(content: TestNotificationContent): Promise<boolean>;
  /** Returns an unsubscribe function. Fires when the user taps a notification. */
  subscribeToResponses(listener: () => void): () => void;
}
