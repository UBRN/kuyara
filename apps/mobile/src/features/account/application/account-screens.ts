import {
  AccountProviderError,
  createAccountSessionManager,
  signedOut,
  type AuthSession,
} from '@/features/account/application/account-session';
import type { MergeCounts, ProfileSource } from '@/features/account/domain/account-merge';
import {
  SYNC_CONSENT_TEXT_VERSION,
  type SyncConsentAnswer,
  type SyncConsentState,
} from '@/features/account/domain/sync-consent';
import { systemDate } from '@/infrastructure/system-clock';

// What the account screens show (ADR 0041 section 5) and what they ask for. The session manager
// is the one state machine behind them; over ports that answer at once it drives the component
// tests and the development scenarios below.

/** The sign-in methods, in the order the screens list them. */
export const accountProviders = ['apple', 'google'] as const;
export type AccountProvider = (typeof accountProviders)[number];

export type AccountSync =
  | Readonly<{ kind: 'upToDate' }>
  | Readonly<{ kind: 'syncing' }>
  | Readonly<{ kind: 'failed' }>;

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

/**
 * What the welcome after sign-in says reached the account: the records with their counts, only the
 * name and gender (no sync consent), or nothing yet because the first pass failed or did not run.
 */
export type WelcomeAdded = 'records' | 'profile' | 'nothingYet';

/** What the sheet shows after sign-in or deletion, in place of the sign-in page. */
export type AccountResult =
  | Readonly<{ kind: 'signedIn'; provider: AccountProvider; email: string; pieces: number; days: number; added: WelcomeAdded }>
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

/**
 * Which screen presents the account sheet. Profile stays mounted under Settings, so each hosts
 * its own; outfit detail hosts one for its members-only row. `app` is the host mounted over the
 * whole app, for the deletion result that shows wherever the person is (ADR 0041 section 7).
 */
export type AccountSheetHost = 'profile' | 'settings' | 'detail' | 'app';

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
    result: { kind: 'signedIn', provider: 'apple', email: signedInSession.email, pieces: 14, days: 9, added: 'records' },
  },
  welcomeWithoutRecords: {
    ...withSession({ syncConsent: 'none', closetPieces: 0, historyDays: 0 }),
    sheet: 'profile',
    result: { kind: 'signedIn', provider: 'apple', email: signedInSession.email, pieces: 0, days: 0, added: 'profile' },
  },
  consentAfterSignIn: {
    ...withSession({ syncConsent: 'none', sync: { kind: 'syncing' }, closetPieces: 0, historyDays: 0 }),
    sheet: 'profile',
    signIn: { kind: 'pending', provider: 'apple' },
    consent: { prompt: 'signIn', status: 'idle' },
  },
  consentSaving: {
    ...withSession({ syncConsent: 'none', sync: { kind: 'syncing' }, closetPieces: 0, historyDays: 0 }),
    sheet: 'profile',
    signIn: { kind: 'pending', provider: 'apple' },
    consent: { prompt: 'signIn', status: 'saving' },
  },
  consentFailed: {
    ...withSession({ syncConsent: 'none', sync: { kind: 'syncing' }, closetPieces: 0, historyDays: 0 }),
    sheet: 'profile',
    signIn: { kind: 'pending', provider: 'apple' },
    consent: { prompt: 'signIn', status: 'failed' },
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
  recordsSaving: { ...signedIn, consent: { prompt: null, status: 'saving' } },
  withdrawFailed: { ...signedIn, consent: { prompt: null, status: 'failed' } },
  offline: { ...withSession({ pendingChanges: 3, lastSyncedAt: '2026-10-02T06:12:00.000Z' }), online: false },
  syncing: withSession({ sync: { kind: 'syncing' }, pendingChanges: 3, lastSyncedAt: '2026-10-02T06:12:00.000Z' }),
  syncFailed: withSession({ sync: { kind: 'failed' }, pendingChanges: 3, lastSyncedAt: '2026-10-02T06:12:00.000Z' }),
  signedOutNotice: { ...signedOut, cardDismissed: true, session: { kind: 'signedOut', notice: 'signedOut' } },
  deleting: { ...signedIn, deletion: 'deleting' },
  deleteFailed: { ...signedIn, deletion: 'failed' },
  deleteOffline: { ...signedIn, online: false },
  deleted: {
    ...signedOut,
    cardDismissed: true,
    session: { kind: 'signedOut', notice: 'deleted' },
    sheet: 'app',
    result: { kind: 'deleted', provider: 'apple', appleUnrevoked: false },
  },
  deletedAppleUnrevoked: {
    ...signedOut,
    cardDismissed: true,
    session: { kind: 'signedOut', notice: 'deleted' },
    sheet: 'app',
    result: { kind: 'deleted', provider: 'apple', appleUnrevoked: true },
  },
  deletedNotice: { ...signedOut, cardDismissed: true, session: { kind: 'signedOut', notice: 'deleted' } },
} as const satisfies Record<string, AccountScreensSnapshot>;

export type AccountScenarioName = keyof typeof accountScenarios;

export function isAccountScenarioName(value: unknown): value is AccountScenarioName {
  return typeof value === 'string' && Object.hasOwn(accountScenarios, value);
}

/** The account every scenario session stands for. */
const scenarioUserId = 'scenario';

/**
 * The session manager over ports that answer at once, as a working connection would. The
 * account's consent is the answer on screen (`given` until one is read), and every sync reports
 * the scenario counts. A loaded scenario's account is the session's, so every action continues
 * from the frame. `now` is the clock edge.
 */
function createScenarioAccountScreens(
  initial: AccountScreensSnapshot,
  now: () => Date,
  signIn: (provider: AccountProvider) => Promise<AuthSession | null>,
): AccountScreensPort {
  const shown = () => {
    const { session } = manager.getSnapshot();
    return session.kind === 'signedIn' ? session : null;
  };
  const sessionOf = (session: Extract<AccountSession, { kind: 'signedIn' }> | null): AuthSession | null =>
    session && { userId: scenarioUserId, provider: session.provider, email: session.email, providers: session.providers };
  const answer = (): SyncConsentState => shown()?.syncConsent ?? 'given';
  const record = (state: SyncConsentAnswer) =>
    ({ answer: state, textVersion: SYNC_CONSENT_TEXT_VERSION, answeredAt: now().toISOString(), recordedAt: now().toISOString() });
  const manager = createAccountSessionManager({
    auth: {
      currentSession: async () => sessionOf(shown()),
      signIn,
      signOut: async () => {},
      refreshSession: async () => sessionOf(shown()),
      addProvider: async (provider) => {
        const session = sessionOf(shown());
        if (session === null) throw new AccountProviderError('failed');
        return { ...session, providers: [...session.providers, provider] };
      },
      reauthorizeDeletion: async () => ({ accessToken: scenarioUserId }),
      appleCredentialState: async () => 'authorized',
    },
    consent: {
      records: async () => {
        const state = answer();
        return state === 'none' ? [] : [record(state)];
      },
      give: async () => {},
      withdraw: async () => {},
    },
    sync: {
      // A scenario frame stands for a phone already linked to its account.
      hasLinked: async () => true,
      run: async () => {
        const syncConsent = answer();
        const records = syncConsent === 'given';
        return {
          pendingChanges: 0,
          closetPieces: records ? signedInSession.closetPieces : 0,
          historyDays: records ? signedInSession.historyDays : 0,
          syncConsent,
          firstLink: null,
        };
      },
    },
    deletion: { deleteAccount: async () => ({ kind: 'deleted', appleUnrevoked: false }) },
    // A scenario frame is never a launch after the app closed over the question.
    consentQuestion: { wasOpen: async () => false, setOpen: async () => {} },
    // A scenario's Apple credential is always authorized, so no mark is kept.
    appleMark: { userId: async () => null, set: async () => {} },
    now,
    scenarioUserId,
  });
  manager.load(initial);
  return manager;
}

/** The in-memory port: every request finishes at once with the outcome a working connection would give. */
export function createInMemoryAccountScreens(
  initial: AccountScreensSnapshot = signedOut,
  now: () => Date = systemDate,
): AccountScreensPort {
  return createScenarioAccountScreens(initial, now, async (provider) => ({
    userId: scenarioUserId,
    provider,
    email: provider === 'apple' ? signedInSession.email : 'ada@example.com',
    providers: [provider],
  }));
}

/**
 * The port while accounts cannot run although the screens are on: the Supabase settings are
 * missing or invalid, or the live session could not be composed. It stays signed out and every
 * sign-in fails closed, so a pretend account can never stand in for a real one.
 */
export function createClosedAccountScreens(now: () => Date = systemDate): AccountScreensPort {
  return createScenarioAccountScreens(signedOut, now, async () => { throw new AccountProviderError('unavailable'); });
}
