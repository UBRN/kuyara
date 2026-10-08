import type { AccountSessionManager } from '@/features/account/application/account-session';

/** A local edit uploads this long after the last write, so a burst of writes is one pass. */
export const localWriteDelayMs = 2000;

export type AccountLifecyclePorts = Readonly<{
  manager: AccountSessionManager;
  /** The app's foreground state; `'active'` is the foreground. */
  onAppStateChange: (listener: (state: string) => void) => () => void;
  /** Whether the app is in the foreground now, at connect: no change event reports that. */
  isActive: () => boolean;
  /** Fires after any committed write to the device database. */
  onDatabaseWrite: (listener: () => void) => () => void;
  /** Whether a row waits to upload: the profile, and the record tables under the consent. */
  hasPending: (records: boolean) => Promise<boolean>;
  /** Fires when the person revokes kuyara's Sign in with Apple while the app runs (ADR 0041 section 2). */
  onAppleRevoked: (listener: () => void) => () => void;
  /** Fires after the auth client refreshed the session's access token. */
  onTokenRefreshed: (listener: () => void) => () => void;
  /** The session's token refresh, which runs only in the foreground (ADR 0041 section 9). */
  autoRefresh: Readonly<{ start: () => void; stop: () => void }>;
  /** The persisted sign-in card dismissal of the device account link. */
  card: Readonly<{ dismissed: () => Promise<boolean>; dismiss: () => Promise<void> }>;
  /** Whether the device is online now, and each change after (ADR 0041 sections 5 and 7). */
  network: Readonly<{
    current: () => Promise<boolean>;
    onChange: (listener: (online: boolean) => void) => () => void;
  }>;
  schedule: (task: () => void, delayMs: number) => () => void;
}>;

/**
 * Runs the account session for the app's lifetime (ADR 0041 sections 2, 4 and 9): it starts once,
 * syncs again in the foreground with the token refresh running only there, syncs shortly after a
 * local write that left a row waiting, never per keystroke, and hands Apple's revocation notice to
 * the manager, which ends a session whose Apple credential this phone holds the way signing out does. It keeps the session's online state with the device's
 * connection, so the offline lines show and deletion waits for a connection. Returns the disconnect.
 */
export function connectAccountLifecycle(ports: AccountLifecyclePorts): () => void {
  const { autoRefresh, card, hasPending, manager, schedule } = ports;
  let cancelLocalWrite: (() => void) | null = null;

  const scheduleLocalWrite = () => {
    cancelLocalWrite?.();
    cancelLocalWrite = schedule(() => {
      cancelLocalWrite = null;
      void syncLocalWrite();
    }, localWriteDelayMs);
  };
  const syncLocalWrite = async () => {
    const { session } = manager.getSnapshot();
    if (session.kind !== 'signedIn') return;
    try {
      // During a pass the manager runs this one after it, so a row the pass read too early still goes.
      if (await hasPending(session.syncConsent === 'given')) await manager.localWrite();
    } catch {
      // The row stays pending; the next write, foreground or "Sync now" sends it.
    }
  };

  let cardPersisted = false;
  const unsubscribeCard = manager.subscribe(() => {
    if (!manager.getSnapshot().cardDismissed || cardPersisted) return;
    cardPersisted = true;
    card.dismiss().catch(() => {
      // Not stored: the card shows again at the next launch, the only cost.
    });
  });
  card.dismissed().then((dismissed) => {
    if (!dismissed) return;
    cardPersisted = true;
    manager.dismissCard();
  }, () => {
    // Unread: the card follows this launch's state alone.
  });

  // A change that arrives first is newer than the launch read, which then changes nothing.
  let networkChanged = false;
  const unsubscribeNetwork = ports.network.onChange((online) => {
    networkChanged = true;
    manager.setOnline(online);
  });
  ports.network.current().then((online) => {
    if (!networkChanged) manager.setOnline(online);
  }, () => {
    // Unread: the session keeps its state until the first change event.
  });

  const unsubscribeWrites = ports.onDatabaseWrite(scheduleLocalWrite);
  // The manager ends the session only when this phone holds the Apple credential of the account.
  const unsubscribeRevoked = ports.onAppleRevoked(() => { void manager.appleRevoked(); });
  // A pass that found no access token runs once the refresh brings one.
  const unsubscribeRefreshed = ports.onTokenRefreshed(() => manager.tokenRefreshed());
  // Connecting in the foreground is the common case, and no change event follows it.
  if (ports.isActive()) autoRefresh.start();
  // Control Center, Notification Center and system alerts only make the app inactive, so closing
  // them is no return to the foreground and runs no sync.
  let fromBackground = !ports.isActive();
  const unsubscribeAppState = ports.onAppStateChange((state) => {
    if (state !== 'active') {
      if (state === 'background') fromBackground = true;
      autoRefresh.stop();
      return;
    }
    autoRefresh.start();
    if (!fromBackground) return;
    fromBackground = false;
    void manager.foreground();
  });
  void manager.start();

  return () => {
    cancelLocalWrite?.();
    unsubscribeWrites();
    unsubscribeNetwork();
    unsubscribeAppState();
    unsubscribeRevoked();
    unsubscribeRefreshed();
    unsubscribeCard();
    autoRefresh.stop();
  };
}
