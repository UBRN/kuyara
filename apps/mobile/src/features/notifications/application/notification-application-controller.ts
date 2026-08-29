import type {
  NotificationGateway,
  NotificationPermissionState,
  TestNotificationContent,
} from '@/features/notifications/data/notification-gateway';

export type NotificationApplicationState = Readonly<{
  permission: NotificationPermissionState;
  isBusy: boolean;
}>;

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

  async setOptIn(optIn: boolean): Promise<'enabled' | 'blocked' | 'disabled'> {
    this.setState({ ...this.state, isBusy: true });
    try {
      if (!optIn) {
        await this.persistOptIn(false);
        await this.refreshPermission();
        return 'disabled';
      }

      let permission = await this.gateway.getPermissionState();
      this.setState({ ...this.state, permission });
      if (permission.kind === 'undetermined') {
        permission = await this.gateway.requestPermission();
        this.setState({ ...this.state, permission });
      }

      if (permission.kind !== 'granted') {
        return 'blocked';
      }

      await this.persistOptIn(true);
      return 'enabled';
    } finally {
      this.setState({ ...this.state, isBusy: false });
    }
  }

  sendTestNotification(content: TestNotificationContent): Promise<boolean> {
    return this.gateway.scheduleTestNotification(content);
  }

  private setState(state: NotificationApplicationState): void {
    this.state = state;
    for (const listener of this.listeners) {
      listener();
    }
  }
}
