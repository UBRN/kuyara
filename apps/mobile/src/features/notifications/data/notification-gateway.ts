export type NotificationPermissionState =
  | Readonly<{ kind: 'undetermined' }>
  | Readonly<{ kind: 'granted' }>
  | Readonly<{ kind: 'denied'; canRequestAgain: boolean }>;

export interface NotificationGateway {
  getPermissionState(): Promise<NotificationPermissionState>;
  requestPermission(): Promise<NotificationPermissionState>;
  openApplicationSettings(): Promise<void>;
  /** Returns an unsubscribe function. Fires when the user taps a notification. */
  subscribeToResponses(listener: () => void): () => void;
}
