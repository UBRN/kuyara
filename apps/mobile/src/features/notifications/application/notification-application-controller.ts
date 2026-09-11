import type {
  NotificationGateway,
  NotificationPermissionState,
} from '@/features/notifications/data/notification-gateway';

export type NotificationApplicationState = Readonly<{
  permission: NotificationPermissionState;
  isBusy: boolean;
}>;

// Taxonomy 5.13: `notification_permission_resolved`'s `outcome`, with `canRequestAgain`
// only meaningful (and only present) when the OS permission blocked the opt-in.
export type NotificationOptInOutcome =
  | Readonly<{ outcome: 'enabled' }>
  | Readonly<{ outcome: 'disabled' }>
  | Readonly<{ outcome: 'blocked'; canRequestAgain: boolean }>;

/**
 * Notifications are only really on when the user opted in and the OS still allows them.
 * Settings shows this, not the stored preference alone, and it is the same condition the
 * alert scheduler plans under.
 */
export function notificationsAreActive(
  optedIn: boolean,
  permission: NotificationPermissionState,
): boolean {
  return optedIn && permission.kind === 'granted';
}

type Listener = () => void;

export class NotificationApplicationController {
  private state: NotificationApplicationState = {
    permission: { kind: 'undetermined' },
    isBusy: false,
  };
  private readonly listeners = new Set<Listener>();
  private readonly gateway: NotificationGateway;
  private readonly persistOptIn: (optIn: boolean) => Promise<void>;

  constructor(
    gateway: NotificationGateway,
    persistOptIn: (optIn: boolean) => Promise<void>,
  ) {
    this.gateway = gateway;
    this.persistOptIn = persistOptIn;
  }

  getSnapshot = (): NotificationApplicationState => this.state;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  async refreshPermission(): Promise<void> {
    const permission = await this.gateway.getPermissionState();
    this.setState({ ...this.state, permission });
  }

  async setOptIn(optIn: boolean): Promise<NotificationOptInOutcome> {
    this.setState({ ...this.state, isBusy: true });
    try {
      if (!optIn) {
        await this.persistOptIn(false);
        await this.refreshPermission();
        return { outcome: 'disabled' };
      }

      let permission = await this.gateway.getPermissionState();
      this.setState({ ...this.state, permission });
      if (permission.kind === 'undetermined') {
        permission = await this.gateway.requestPermission();
        this.setState({ ...this.state, permission });
      }

      if (permission.kind !== 'granted') {
        return {
          outcome: 'blocked',
          canRequestAgain: permission.kind === 'denied' ? permission.canRequestAgain : true,
        };
      }

      await this.persistOptIn(true);
      return { outcome: 'enabled' };
    } finally {
      this.setState({ ...this.state, isBusy: false });
    }
  }

  private setState(state: NotificationApplicationState): void {
    this.state = state;
    for (const listener of this.listeners) {
      listener();
    }
  }
}
