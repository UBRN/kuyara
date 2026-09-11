export type NotificationPermissionState =
  | Readonly<{ kind: 'undetermined' }>
  | Readonly<{ kind: 'granted' }>
  | Readonly<{ kind: 'denied'; canRequestAgain: boolean }>;

export interface NotificationGateway {
  getPermissionState(): Promise<NotificationPermissionState>;
  requestPermission(): Promise<NotificationPermissionState>;
  openApplicationSettings(): Promise<void>;
  /** Resolves false when any pending kuyara alert could not be cancelled. */
  cancelScheduledWeatherAlerts(): Promise<boolean>;
  /** Resolves false when the alert was not handed to the OS. */
  scheduleWeatherAlert(request: Readonly<{
    identifier: string;
    fireAt: string;
    title: string;
    body: string;
  }>): Promise<boolean>;
  /** Returns an unsubscribe function. Fires when the user taps a notification. */
  subscribeToResponses(listener: () => void): () => void;
}
