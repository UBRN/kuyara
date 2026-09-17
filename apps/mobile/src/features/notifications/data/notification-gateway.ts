export type NotificationPermissionState =
  | Readonly<{ kind: 'undetermined' }>
  | Readonly<{ kind: 'granted' }>
  | Readonly<{ kind: 'denied'; canRequestAgain: boolean }>;

/**
 * The two kinds kuyara schedules (ADR 0004). The gateway reads the kind back off the
 * notification's own identifier, which is the only thing a tapped response carries.
 */
export type NotificationKind = 'weather_alert' | 'morning_briefing';

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
  subscribeToResponses(listener: (kind: NotificationKind) => void): () => void;
}
