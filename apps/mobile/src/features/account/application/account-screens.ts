// What the account screens show (ADR 0041 section 5) and what they ask for. The real port
// joins once the Supabase, Apple and Google work lands; until then an in-memory port drives
// every state, for the component tests and for the development scenarios below.

export type AccountProvider = 'apple' | 'google';

/** Restore progress: pieces of the Closet and days of History that are back. */
export type RestoreCounts = Readonly<{ piecesDone: number; piecesTotal: number; daysDone: number; daysTotal: number }>;

export type AccountSync =
  | Readonly<{ kind: 'upToDate' }>
  | Readonly<{ kind: 'syncing' }>
  | Readonly<{ kind: 'failed' }>
  | Readonly<{ kind: 'restoring'; counts: RestoreCounts }>;

export type AccountSession =
  | Readonly<{ kind: 'signedOut'; notice: 'signedOut' | 'deleted' | null }>
  | Readonly<{
    kind: 'signedIn';
    provider: AccountProvider;
    email: string;
    providers: readonly AccountProvider[];
    sync: AccountSync;
    /** Rows written on this phone that the account has not received yet. */
    pendingChanges: number;
    closetPieces: number;
    historyDays: number;
    lastSyncedAt: string;
  }>;

export type SignInStatus =
  | Readonly<{ kind: 'idle' }>
  | Readonly<{ kind: 'pending'; provider: AccountProvider }>
  | Readonly<{ kind: 'cancelled' }>
  | Readonly<{ kind: 'failed'; provider: AccountProvider }>;

/** What the sheet shows after sign-in or deletion, in place of the sign-in page. */
export type AccountResult =
  | Readonly<{ kind: 'signedIn'; provider: AccountProvider; email: string; pieces: number; days: number }>
  | Readonly<{ kind: 'restoring'; counts: RestoreCounts }>
  | Readonly<{ kind: 'restored'; pieces: number; days: number }>
  | Readonly<{ kind: 'deleted'; provider: AccountProvider }>;

/** Which screen presents the account sheet. Profile stays mounted under Settings, so each hosts its own. */
export type AccountSheetHost = 'profile' | 'settings';

export type AccountScreensSnapshot = Readonly<{
  online: boolean;
  cardDismissed: boolean;
  session: AccountSession;
  signIn: SignInStatus;
  deletion: 'idle' | 'deleting' | 'failed';
  sheet: AccountSheetHost | null;
  result: AccountResult | null;
}>;

export type AccountScreensPort = Readonly<{
  getSnapshot: () => AccountScreensSnapshot;
  subscribe: (listener: () => void) => () => void;
  dismissCard: () => void;
  openSignIn: (host: AccountSheetHost) => void;
  /** Closes the sheet; a sign-in still running is cancelled with it. */
  closeSheet: () => void;
  signIn: (provider: AccountProvider) => void;
  syncNow: () => void;
  addProvider: (provider: AccountProvider) => void;
  signOut: () => void;
  deleteAccount: () => void;
  /** The one-time Settings line after sign-out or deletion goes on the next visit. */
  clearNotice: () => void;
  /** Development only: replaces the whole snapshot with a named scenario. */
  load: (snapshot: AccountScreensSnapshot) => void;
}>;

export const signedOut: AccountScreensSnapshot = {
  online: true,
  cardDismissed: false,
  session: { kind: 'signedOut', notice: null },
  signIn: { kind: 'idle' },
  deletion: 'idle',
  sheet: null,
  result: null,
};

const restoreCounts: RestoreCounts = { piecesDone: 8, piecesTotal: 14, daysDone: 5, daysTotal: 9 };

const signedInSession = {
  kind: 'signedIn',
  provider: 'apple',
  email: 'q7m2x9kd4v@privaterelay.appleid.com',
  providers: ['apple'],
  sync: { kind: 'upToDate' },
  pendingChanges: 0,
  closetPieces: 14,
  historyDays: 9,
  lastSyncedAt: '2026-10-02T06:41:00.000Z',
} as const satisfies AccountSession;

const signedIn: AccountScreensSnapshot = { ...signedOut, session: signedInSession };

function withSession(patch: Partial<typeof signedInSession> | object): AccountScreensSnapshot {
  return { ...signedIn, session: { ...signedInSession, ...patch } as AccountSession };
}

/** The approved frames by name, for the development harness and the tests. */
export const accountScenarios = {
  signedOut,
  signIn: { ...signedOut, sheet: 'profile' },
  signInPending: { ...signedOut, sheet: 'profile', signIn: { kind: 'pending', provider: 'apple' } },
  signInCancelled: { ...signedOut, sheet: 'profile', signIn: { kind: 'cancelled' } },
  signInOffline: { ...signedOut, online: false, sheet: 'profile' },
  signInFailed: { ...signedOut, sheet: 'profile', signIn: { kind: 'failed', provider: 'apple' } },
  welcome: {
    ...signedIn,
    sheet: 'profile',
    result: { kind: 'signedIn', provider: 'apple', email: signedInSession.email, pieces: 14, days: 9 },
  },
  restoring: {
    ...withSession({ sync: { kind: 'restoring', counts: restoreCounts } }),
    sheet: 'profile',
    result: { kind: 'restoring', counts: restoreCounts },
  },
  restored: { ...signedIn, sheet: 'profile', result: { kind: 'restored', pieces: 14, days: 9 } },
  upToDate: signedIn,
  offline: { ...withSession({ pendingChanges: 3, lastSyncedAt: '2026-10-02T06:12:00.000Z' }), online: false },
  syncing: withSession({ sync: { kind: 'syncing' }, pendingChanges: 3, lastSyncedAt: '2026-10-02T06:12:00.000Z' }),
  syncFailed: withSession({ sync: { kind: 'failed' }, pendingChanges: 3, lastSyncedAt: '2026-10-02T06:12:00.000Z' }),
  accountRestoring: withSession({ sync: { kind: 'restoring', counts: restoreCounts } }),
  restorePaused: { ...withSession({ sync: { kind: 'restoring', counts: restoreCounts } }), online: false },
  signedOutNotice: { ...signedOut, cardDismissed: true, session: { kind: 'signedOut', notice: 'signedOut' } },
  deleting: { ...signedIn, deletion: 'deleting' },
  deleteFailed: { ...signedIn, deletion: 'failed' },
  deleteOffline: { ...signedIn, online: false },
  deleted: {
    ...signedOut,
    cardDismissed: true,
    session: { kind: 'signedOut', notice: 'deleted' },
    sheet: 'settings',
    result: { kind: 'deleted', provider: 'apple' },
  },
  deletedNotice: { ...signedOut, cardDismissed: true, session: { kind: 'signedOut', notice: 'deleted' } },
} as const satisfies Record<string, AccountScreensSnapshot>;

export type AccountScenarioName = keyof typeof accountScenarios;

export function isAccountScenarioName(value: unknown): value is AccountScenarioName {
  return typeof value === 'string' && Object.hasOwn(accountScenarios, value);
}

/**
 * The in-memory port. Every request finishes at once with the outcome a working connection
 * would give; a scenario stands in for the states a request passes through. `now` is the
 * clock edge for the last-synced time.
 */
export function createInMemoryAccountScreens(
  initial: AccountScreensSnapshot = signedOut,
  now: () => Date = () => new Date(),
): AccountScreensPort {
  let snapshot = initial;
  const listeners = new Set<() => void>();
  const set = (next: AccountScreensSnapshot) => {
    snapshot = next;
    listeners.forEach((listener) => listener());
  };
  const update = (patch: Partial<AccountScreensSnapshot>) => set({ ...snapshot, ...patch });
  const session = () => (snapshot.session.kind === 'signedIn' ? snapshot.session : null);

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dismissCard: () => update({ cardDismissed: true }),
    openSignIn: (host) => update({ sheet: host, signIn: { kind: 'idle' }, result: null }),
    closeSheet: () => update({ sheet: null, signIn: { kind: 'idle' }, result: null }),
    signIn: (provider) => {
      if (!snapshot.online) {
        update({ signIn: { kind: 'failed', provider } });
        return;
      }
      const email = provider === 'apple' ? signedInSession.email : 'ada@example.com';
      set({
        ...snapshot,
        signIn: { kind: 'idle' },
        session: { ...signedInSession, provider, email, providers: [provider], lastSyncedAt: now().toISOString() },
        result: { kind: 'signedIn', provider, email, pieces: signedInSession.closetPieces, days: signedInSession.historyDays },
      });
    },
    syncNow: () => {
      const current = session();
      if (!current || !snapshot.online) return;
      update({ session: { ...current, sync: { kind: 'upToDate' }, pendingChanges: 0, lastSyncedAt: now().toISOString() } });
    },
    addProvider: (provider) => {
      const current = session();
      if (!current || current.providers.includes(provider)) return;
      update({ session: { ...current, providers: [...current.providers, provider] } });
    },
    signOut: () => update({ session: { kind: 'signedOut', notice: 'signedOut' }, cardDismissed: true }),
    deleteAccount: () => {
      const current = session();
      if (!current || !snapshot.online) return;
      set({
        ...snapshot,
        deletion: 'idle',
        session: { kind: 'signedOut', notice: 'deleted' },
        cardDismissed: true,
        sheet: 'settings',
        result: { kind: 'deleted', provider: current.provider },
      });
    },
    clearNotice: () => {
      if (snapshot.session.kind === 'signedOut' && snapshot.session.notice !== null) {
        update({ session: { kind: 'signedOut', notice: null } });
      }
    },
    load: set,
  };
}
