import type { MergeCounts, ProfileSource } from '@/features/account/domain/account-merge';
import type { SyncConsentState } from '@/features/account/domain/sync-consent';
import { systemDate } from '@/infrastructure/system-clock';

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
    /** The account's sync consent; null until a read of it has succeeded. */
    syncConsent: SyncConsentState | null;
  }>;

export type SignInStatus =
  | Readonly<{ kind: 'idle' }>
  | Readonly<{ kind: 'pending'; provider: AccountProvider }>
  | Readonly<{ kind: 'cancelled' }>
  | Readonly<{ kind: 'failed'; provider: AccountProvider }>;

/** What the sheet shows after sign-in or deletion, in place of the sign-in page. */
export type AccountResult =
  | Readonly<{ kind: 'signedIn'; provider: AccountProvider; email: string; pieces: number; days: number; records: boolean }>
  | Readonly<{ kind: 'restoring'; counts: RestoreCounts }>
  | Readonly<{ kind: 'restored'; pieces: number; days: number; profileFrom: ProfileSource }>
  /** A phone and an account that both held records merged them (ADR 0041 sections 4 and 6). */
  | Readonly<{ kind: 'merged'; counts: MergeCounts; profileFrom: ProfileSource }>
  /** `appleUnrevoked`: Apple's sign-in could not be disconnected, so the person removes it themselves. */
  | Readonly<{ kind: 'deleted'; provider: AccountProvider; appleUnrevoked: boolean }>;

/**
 * The sync consent sheet (ADR 0041 sections 5 and 10): `prompt` names where it is asked, after
 * sign-in in the account sheet or later from the Account screen; `status` is the last attempt
 * to record an answer or a withdrawal.
 */
export type ConsentStatus = Readonly<{
  prompt: 'signIn' | 'account' | null;
  status: 'idle' | 'saving' | 'failed';
}>;

export const noConsentPrompt: ConsentStatus = { prompt: null, status: 'idle' };

/**
 * Which screen presents the account sheet. Profile stays mounted under Settings, so each hosts
 * its own; outfit detail hosts one for its members-only row.
 */
export type AccountSheetHost = 'profile' | 'settings' | 'detail';

export type AddProviderOutcome = 'linked' | 'identityTaken' | 'unchanged';

export type AccountScreensSnapshot = Readonly<{
  online: boolean;
  cardDismissed: boolean;
  session: AccountSession;
  signIn: SignInStatus;
  deletion: 'idle' | 'deleting' | 'failed';
  sheet: AccountSheetHost | null;
  result: AccountResult | null;
  consent: ConsentStatus;
}>;

export type AccountScreensPort = Readonly<{
  getSnapshot: () => AccountScreensSnapshot;
  subscribe: (listener: () => void) => () => void;
  dismissCard: () => void;
  openSignIn: (host: AccountSheetHost) => void;
  /**
   * Closes the sheet; a sign-in still running is cancelled with it. Over the consent question
   * after sign-in it declines, as Continue unticked does, and the sheet shows that result.
   */
  closeSheet: () => void;
  signIn: (provider: AccountProvider) => void;
  syncNow: () => void;
  /** Links a second sign-in method; `identityTaken` means another account already holds it. */
  addProvider: (provider: AccountProvider) => Promise<AddProviderOutcome>;
  signOut: () => void;
  deleteAccount: () => void;
  /** Opens the consent sheet from the Account screen while the account's answer is not `given`. */
  openConsent: () => void;
  /** Continue on the consent sheet: ticked records `given`; unticked records nothing. */
  answerConsent: (given: boolean) => void;
  /** The sheet went away without Continue: after sign-in that declines, from Account it changes nothing. */
  closeConsent: () => void;
  /** After the system confirmation: records the withdrawal and stops sync for the account. */
  withdrawConsent: () => void;
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
  consent: noConsentPrompt,
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
  syncConsent: 'given',
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
    result: { kind: 'signedIn', provider: 'apple', email: signedInSession.email, pieces: 14, days: 9, records: true },
  },
  welcomeWithoutRecords: {
    ...withSession({ syncConsent: 'none', closetPieces: 0, historyDays: 0 }),
    sheet: 'profile',
    result: { kind: 'signedIn', provider: 'apple', email: signedInSession.email, pieces: 0, days: 0, records: false },
  },
  consentAfterSignIn: {
    ...withSession({ syncConsent: 'none', sync: { kind: 'syncing' }, closetPieces: 0, historyDays: 0 }),
    sheet: 'profile',
    signIn: { kind: 'pending', provider: 'apple' },
    consent: { prompt: 'signIn', status: 'idle' },
  },
  consentFailed: {
    ...withSession({ syncConsent: 'none', sync: { kind: 'syncing' }, closetPieces: 0, historyDays: 0 }),
    sheet: 'profile',
    signIn: { kind: 'pending', provider: 'apple' },
    consent: { prompt: 'signIn', status: 'failed' },
  },
  restoring: {
    ...withSession({ sync: { kind: 'restoring', counts: restoreCounts } }),
    sheet: 'profile',
    result: { kind: 'restoring', counts: restoreCounts },
  },
  restored: { ...signedIn, sheet: 'profile', result: { kind: 'restored', pieces: 14, days: 9, profileFrom: 'account' } },
  merged: {
    ...signedIn,
    sheet: 'profile',
    result: { kind: 'merged', counts: { piecesAdded: 3, historyDaysAdded: 2, piecesReceived: 11, historyDaysReceived: 7 }, profileFrom: 'account' },
  },
  upToDate: signedIn,
  recordsNotSynced: withSession({ syncConsent: 'none', closetPieces: 0, historyDays: 0 }),
  recordsWithdrawn: withSession({ syncConsent: 'withdrawn', closetPieces: 0, historyDays: 0 }),
  consentFromAccount: {
    ...withSession({ syncConsent: 'none', closetPieces: 0, historyDays: 0 }),
    consent: { prompt: 'account', status: 'idle' },
  },
  withdrawFailed: { ...signedIn, consent: { prompt: null, status: 'failed' } },
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
    result: { kind: 'deleted', provider: 'apple', appleUnrevoked: false },
  },
  deletedAppleUnrevoked: {
    ...signedOut,
    cardDismissed: true,
    session: { kind: 'signedOut', notice: 'deleted' },
    sheet: 'settings',
    result: { kind: 'deleted', provider: 'apple', appleUnrevoked: true },
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
  now: () => Date = systemDate,
): AccountScreensPort {
  let snapshot = initial;
  const listeners = new Set<() => void>();
  const set = (next: AccountScreensSnapshot) => {
    snapshot = next;
    listeners.forEach((listener) => listener());
  };
  const update = (patch: Partial<AccountScreensSnapshot>) => set({ ...snapshot, ...patch });
  const session = () => (snapshot.session.kind === 'signedIn' ? snapshot.session : null);

  const port: AccountScreensPort = {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    dismissCard: () => update({ cardDismissed: true }),
    openSignIn: (host) => update({ sheet: host, signIn: { kind: 'idle' }, result: null }),
    closeSheet: () => {
      // Closing over the consent question after sign-in declines it and shows that result.
      if (snapshot.consent.prompt === 'signIn') port.answerConsent(false);
      else update({ sheet: null, signIn: { kind: 'idle' }, result: null });
    },
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
        result: { kind: 'signedIn', provider, email, pieces: signedInSession.closetPieces, days: signedInSession.historyDays, records: true },
      });
    },
    syncNow: () => {
      const current = session();
      if (!current || !snapshot.online) return;
      update({ session: { ...current, sync: { kind: 'upToDate' }, pendingChanges: 0, lastSyncedAt: now().toISOString() } });
    },
    addProvider: async (provider) => {
      const current = session();
      if (!current || current.providers.includes(provider)) return 'unchanged';
      update({ session: { ...current, providers: [...current.providers, provider] } });
      return 'linked';
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
        result: { kind: 'deleted', provider: current.provider, appleUnrevoked: false },
      });
    },
    openConsent: () => {
      const current = session();
      if (current && current.syncConsent !== 'given') update({ consent: { prompt: 'account', status: 'idle' } });
    },
    answerConsent: (given) => {
      const current = session();
      const { prompt } = snapshot.consent;
      if (!current || prompt === null) return;
      const syncConsent = given ? 'given' : current.syncConsent;
      set({
        ...snapshot,
        consent: noConsentPrompt,
        session: { ...current, syncConsent },
        ...(prompt === 'signIn' ? {
          signIn: { kind: 'idle' },
          result: {
            kind: 'signedIn', provider: current.provider, email: current.email,
            pieces: given ? current.closetPieces : 0, days: given ? current.historyDays : 0, records: given,
          },
        } : null),
      });
    },
    closeConsent: () => {
      if (snapshot.consent.prompt === 'signIn') port.answerConsent(false);
      else update({ consent: noConsentPrompt });
    },
    withdrawConsent: () => {
      const current = session();
      if (current) update({ session: { ...current, syncConsent: 'withdrawn', closetPieces: 0, historyDays: 0 } });
    },
    clearNotice: () => {
      if (snapshot.session.kind === 'signedOut' && snapshot.session.notice !== null) {
        update({ session: { kind: 'signedOut', notice: null } });
      }
    },
    load: set,
  };
  return port;
}

/**
 * The port while accounts cannot run although the screens are on: the Supabase settings are
 * missing or invalid, or the live session could not be composed. It stays signed out and every
 * sign-in fails closed, so the in-memory port's pretend account can never stand in for a real one.
 */
export function createClosedAccountScreens(now: () => Date = systemDate): AccountScreensPort {
  const port = createInMemoryAccountScreens(signedOut, now);
  return {
    ...port,
    signIn: (provider) => port.load({ ...port.getSnapshot(), signIn: { kind: 'failed', provider } }),
  };
}
