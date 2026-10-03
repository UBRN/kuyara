import {
  signedOut,
  type AccountProvider,
  type AccountScreensPort,
  type AccountScreensSnapshot,
  type AccountSession,
  type AccountSheetHost,
} from '@/features/account/application/account-screens';
import type { AccountDeletionPort } from '@/features/account/application/account-delete';

export type AuthSession = Readonly<{
  userId: string;
  provider: AccountProvider;
  email: string;
  providers: readonly AccountProvider[];
}>;

export type AccountAuthPort = Readonly<{
  currentSession: () => Promise<AuthSession | null>;
  signIn: (provider: AccountProvider) => Promise<AuthSession | null>;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<AuthSession | null>;
  addProvider: (provider: AccountProvider) => Promise<AuthSession>;
  reauthorizeDeletion: () => Promise<Readonly<{ accessToken: string; appleAuthorizationCode?: string }> | null>;
}>;

export type AccountSyncTrigger = 'signIn' | 'restore' | 'foreground' | 'manual' | 'localWrite' | 'signOut';
export type AccountSessionSyncPort = Readonly<{
  run: (userId: string, trigger: AccountSyncTrigger) => Promise<Readonly<{
    pendingChanges: number;
    closetPieces: number;
    historyDays: number;
  }>>;
}>;

export type AccountSessionManager = AccountScreensPort & Readonly<{
  start: () => Promise<void>;
  foreground: () => Promise<void>;
  localWrite: () => Promise<void>;
  setOnline: (online: boolean) => void;
}>;

export function createAccountSessionManager({ auth, sync, deletion, now }: Readonly<{
  auth: AccountAuthPort;
  sync: AccountSessionSyncPort;
  deletion: AccountDeletionPort;
  now: () => Date;
}>): AccountSessionManager {
  let snapshot: AccountScreensSnapshot = signedOut;
  let identity: AuthSession | null = null;
  let signInRequest = 0;
  const listeners = new Set<() => void>();
  const set = (next: AccountScreensSnapshot) => {
    snapshot = next;
    listeners.forEach((listener) => listener());
  };
  const update = (patch: Partial<AccountScreensSnapshot>) => set({ ...snapshot, ...patch });
  const signedIn = () => snapshot.session.kind === 'signedIn' ? snapshot.session : null;
  const showIdentity = (session: AuthSession): AccountSession => ({
    kind: 'signedIn', provider: session.provider, email: session.email, providers: session.providers,
    sync: { kind: 'syncing' }, pendingChanges: 0, closetPieces: 0, historyDays: 0, lastSyncedAt: now().toISOString(),
  });
  const runSync = async (trigger: AccountSyncTrigger) => {
    if (!identity || !snapshot.online) return;
    const userId = identity.userId;
    const current = signedIn();
    if (!current) return;
    update({ session: { ...current, sync: { kind: 'syncing' } } });
    try {
      const counts = await sync.run(userId, trigger);
      const latest = signedIn();
      if (identity?.userId !== userId || !latest) return;
      update({ session: { ...latest, ...counts, sync: { kind: 'upToDate' }, lastSyncedAt: now().toISOString() } });
    } catch {
      const latest = signedIn();
      if (identity?.userId === userId && latest) update({ session: { ...latest, sync: { kind: 'failed' } } });
    }
  };
  const restore = async (trigger: AccountSyncTrigger, session: AuthSession | null) => {
    identity = session;
    if (session === null) {
      update({ session: { kind: 'signedOut', notice: null } });
      return;
    }
    update({ session: showIdentity(session) });
    await runSync(trigger);
  };

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    dismissCard: () => update({ cardDismissed: true }),
    openSignIn: (host: AccountSheetHost) => update({ sheet: host, signIn: { kind: 'idle' }, result: null }),
    closeSheet: () => { signInRequest += 1; update({ sheet: null, signIn: { kind: 'idle' }, result: null }); },
    async signIn(provider) {
      if (!snapshot.online) { update({ signIn: { kind: 'failed', provider } }); return; }
      const request = ++signInRequest;
      update({ signIn: { kind: 'pending', provider } });
      try {
        const session = await auth.signIn(provider);
        if (request !== signInRequest) {
          if (session !== null && signInRequest === request + 1 && identity === null) await auth.signOut();
          return;
        }
        if (session === null) { update({ signIn: { kind: 'cancelled' } }); return; }
        identity = session;
        update({ session: showIdentity(session), signIn: { kind: 'idle' } });
        await runSync('signIn');
        const account = signedIn();
        if (account) update({ result: { kind: 'signedIn', provider, email: session.email, pieces: account.closetPieces, days: account.historyDays } });
      } catch {
        if (request === signInRequest) update({ signIn: { kind: 'failed', provider } });
      }
    },
    syncNow: () => { void runSync('manual'); },
    async addProvider(provider) {
      if (!identity || identity.providers.includes(provider)) return;
      try {
        identity = await auth.addProvider(provider);
        const current = signedIn();
        if (current) update({ session: { ...current, providers: identity.providers } });
      } catch { /* Linking failure leaves the current session unchanged. */ }
    },
    async signOut() {
      if (!identity) return;
      if (snapshot.online) await runSync('signOut');
      await auth.signOut();
      identity = null;
      update({ session: { kind: 'signedOut', notice: 'signedOut' }, cardDismissed: true });
    },
    async deleteAccount() {
      if (!identity || !snapshot.online || snapshot.deletion === 'deleting') return;
      const provider = identity.provider;
      update({ deletion: 'deleting' });
      try {
        const credentials = await auth.reauthorizeDeletion();
        if (credentials === null) { update({ deletion: 'idle' }); return; }
        const result = await deletion.deleteAccount(credentials);
        if (result.kind === 'failed') { update({ deletion: 'failed' }); return; }
        identity = null;
        update({ deletion: 'idle', session: { kind: 'signedOut', notice: 'deleted' }, cardDismissed: true,
          sheet: 'settings', result: { kind: 'deleted', provider } });
      } catch { update({ deletion: 'failed' }); }
    },
    clearNotice: () => {
      if (snapshot.session.kind === 'signedOut' && snapshot.session.notice !== null)
        update({ session: { kind: 'signedOut', notice: null } });
    },
    load: set,
    async start() {
      try { await restore('restore', await auth.currentSession()); }
      catch { await restore('restore', null); }
    },
    async foreground() {
      if (!identity) return;
      try {
        const session = await auth.refreshSession();
        if (session !== null) { await restore('foreground', session); return; }
      } catch { /* Expired or invalid sessions are cleared below. */ }
      try { await auth.signOut(); } catch { /* The screen still leaves the expired session. */ }
      await restore('foreground', null);
    },
    localWrite: () => runSync('localWrite'),
    setOnline: (online) => update({ online }),
  };
}
