import {
  noConsentPrompt,
  signedOut,
  type AccountProvider,
  type AccountResult,
  type AccountScreensPort,
  type AccountScreensSnapshot,
  type AccountSession,
  type AccountSheetHost,
} from '@/features/account/application/account-screens';
import type { AccountDeletionPort } from '@/features/account/application/account-delete';
import type { FirstLinkOutcome } from '@/features/account/application/account-sync';
import {
  SYNC_CONSENT_TEXT_VERSION,
  syncConsentState,
  type SyncConsentRecord,
  type SyncConsentState,
} from '@/features/account/domain/sync-consent';

export type AuthSession = Readonly<{
  userId: string;
  provider: AccountProvider;
  email: string;
  providers: readonly AccountProvider[];
}>;

/** What Apple reports for the signed-in Apple identity (`getCredentialStateAsync`). */
export type AppleCredentialState = 'authorized' | 'revoked' | 'notFound' | 'transferred';

/**
 * `currentSession` and `refreshSession` answer null only when the auth service has said the
 * session is gone (the refresh token was refused or revoked, the user no longer exists) or none
 * was stored. While the service cannot be reached they answer the stored session, and they
 * throw only when even that cannot be read: being offline never ends a session.
 */
export type AccountAuthPort = Readonly<{
  currentSession: () => Promise<AuthSession | null>;
  signIn: (provider: AccountProvider) => Promise<AuthSession | null>;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<AuthSession | null>;
  addProvider: (provider: AccountProvider) => Promise<AuthSession>;
  reauthorizeDeletion: () => Promise<Readonly<{ accessToken: string; appleAuthorizationCode?: string }> | null>;
  /** Apple's credential state for the session's Apple identity; throws when Apple cannot answer. */
  appleCredentialState: () => Promise<AppleCredentialState>;
}>;

/**
 * How a sign-in, a link or a re-authorization with a provider failed, closed: the person
 * cancelled, the provider cannot be used in this build, the identity already belongs to another
 * account (the identity-taken alert), or anything else. It carries no provider message or token.
 */
export class AccountProviderError extends Error {
  readonly code: 'cancelled' | 'unavailable' | 'identityTaken' | 'failed';

  constructor(code: AccountProviderError['code']) {
    super(`Account provider: ${code}.`);
    this.name = 'AccountProviderError';
    this.code = code;
  }
}

/** One answer to record: the consent text version shown and the instant of the answer. */
export type SyncConsentAnswerInput = Readonly<{ textVersion: string; answeredAt: string }>;

/**
 * The account's sync consent records (ADR 0041 section 10), which the data layer implements over
 * `sync_consent_records`. Each method maps to one remote operation.
 */
export type SyncConsentPort = Readonly<{
  /**
   * Every answer the account holds (`text_version`, `answer`, `answered_at`, `recorded_at`), in
   * server arrival order.
   */
  records: (userId: string) => Promise<readonly SyncConsentRecord[]>;
  /** Inserts one row: `text_version`, `answer` 'given', `answered_at`. */
  give: (userId: string, answer: SyncConsentAnswerInput) => Promise<void>;
  /**
   * `public.withdraw_sync_consent(p_text_version, p_answered_at)`: records the withdrawal and
   * deletes the account's copies of the six kinds of records in one transaction.
   */
  withdraw: (answer: SyncConsentAnswerInput) => Promise<void>;
}>;

export type AccountSyncTrigger = 'signIn' | 'restore' | 'foreground' | 'manual' | 'localWrite' | 'signOut';

/** What a sync pass reports: the counts the Account screen shows and the consent it synced under. */
export type AccountSyncSummary = Readonly<{
  pendingChanges: number;
  closetPieces: number;
  historyDays: number;
  syncConsent: SyncConsentState;
  /** Set when the pass was a first link: what the merge moved each way, for the result sheet. */
  firstLink: FirstLinkOutcome | null;
}>;

export type AccountSessionSyncPort = Readonly<{
  run: (userId: string, trigger: AccountSyncTrigger) => Promise<AccountSyncSummary>;
}>;

export type AccountSessionManager = AccountScreensPort & Readonly<{
  start: () => Promise<void>;
  foreground: () => Promise<void>;
  localWrite: () => Promise<void>;
  setOnline: (online: boolean) => void;
}>;

/**
 * The sheet after a sign-in (ADR 0041 sections 3, 4 and 5), from the first link's merge counts.
 * Without the consent only the name and gender went. When the account held nothing this phone
 * lacked, the welcome states what the phone added; when the phone added nothing, the account's
 * records came back to it (a new phone restoring); when both gave, the merge result. A sign-in
 * that resumed the account the records already joined has no first link and states the totals.
 */
export function signInResult(
  provider: AccountProvider,
  email: string,
  summary: Pick<AccountSyncSummary, 'closetPieces' | 'historyDays' | 'syncConsent' | 'firstLink'>,
): AccountResult {
  const welcome = (pieces: number, days: number, records: boolean): AccountResult =>
    ({ kind: 'signedIn', provider, email, pieces, days, records });
  if (summary.syncConsent !== 'given') return welcome(0, 0, false);
  if (summary.firstLink === null) return welcome(summary.closetPieces, summary.historyDays, true);
  const { counts, profileFrom } = summary.firstLink;
  if (counts.piecesReceived + counts.historyDaysReceived === 0) {
    return welcome(counts.piecesAdded, counts.historyDaysAdded, true);
  }
  if (counts.piecesAdded + counts.historyDaysAdded === 0) {
    return { kind: 'restored', pieces: counts.piecesReceived, days: counts.historyDaysReceived, profileFrom };
  }
  return { kind: 'merged', counts, profileFrom };
}

export function createAccountSessionManager({ auth, consent, deletion, now, sync }: Readonly<{
  auth: AccountAuthPort;
  sync: AccountSessionSyncPort;
  deletion: AccountDeletionPort;
  consent: SyncConsentPort;
  now: () => Date;
}>): AccountSessionManager {
  let snapshot: AccountScreensSnapshot = signedOut;
  let identity: AuthSession | null = null;
  let signInRequest = 0;
  /**
   * A sign-in whose first sync waits for the consent sheet to close (ADR 0041 section 5): no
   * pass runs while it is set, whatever asks for one.
   */
  let awaitingConsent: AccountProvider | null = null;
  /** The sheet that was closed over the consent question; it comes back with the result. */
  let resultHost: AccountSheetHost | null = null;
  /** The last launch could not read the stored session; the next foreground tries again. */
  let sessionUnread = false;
  const listeners = new Set<() => void>();
  const set = (next: AccountScreensSnapshot) => {
    snapshot = next;
    listeners.forEach((listener) => listener());
  };
  const update = (patch: Partial<AccountScreensSnapshot>) => set({ ...snapshot, ...patch });
  const signedIn = () => snapshot.session.kind === 'signedIn' ? snapshot.session : null;
  const updateSession = (patch: Partial<Extract<AccountSession, { kind: 'signedIn' }>>) => {
    const current = signedIn();
    if (current) update({ session: { ...current, ...patch } });
  };
  const answer = () => ({ textVersion: SYNC_CONSENT_TEXT_VERSION, answeredAt: now().toISOString() });
  const showIdentity = (session: AuthSession): AccountSession => ({
    kind: 'signedIn', provider: session.provider, email: session.email, providers: session.providers,
    sync: { kind: 'syncing' }, pendingChanges: 0, closetPieces: 0, historyDays: 0, lastSyncedAt: now().toISOString(),
    syncConsent: null,
  });
  /** One pass; answers its summary, or null when it did not run or failed. */
  const runSync = async (trigger: AccountSyncTrigger): Promise<AccountSyncSummary | null> => {
    // Nothing uploads before the person answers the consent question after sign-in.
    if (!identity || !snapshot.online || awaitingConsent !== null) return null;
    const userId = identity.userId;
    if (!signedIn()) return null;
    updateSession({ sync: { kind: 'syncing' } });
    try {
      const summary = await sync.run(userId, trigger);
      if (identity?.userId !== userId) return null;
      const { firstLink: _firstLink, ...counts } = summary;
      updateSession({ ...counts, sync: { kind: 'upToDate' }, lastSyncedAt: now().toISOString() });
      return summary;
    } catch {
      if (identity?.userId === userId) updateSession({ sync: { kind: 'failed' } });
      return null;
    }
  };
  const restore = async (trigger: AccountSyncTrigger, session: AuthSession | null) => {
    const previous = identity;
    identity = session;
    if (session === null) {
      update({ session: { kind: 'signedOut', notice: null } });
      return;
    }
    // The same account keeps what the screen shows, the consent answer and the counts included.
    const shown = signedIn();
    update({ session: shown && previous?.userId === session.userId
      ? { ...shown, provider: session.provider, email: session.email, providers: session.providers }
      : showIdentity(session) });
    await runSync(trigger);
  };
  /** Section 6: pending changes upload first when there is a connection; the phone keeps everything. */
  const endSession = async () => {
    if (snapshot.online) await runSync('signOut');
    await auth.signOut();
    identity = null;
    awaitingConsent = null;
    resultHost = null;
    update({ session: { kind: 'signedOut', notice: 'signedOut' }, cardDismissed: true, consent: noConsentPrompt });
  };
  const finishSignIn = async (provider: AccountProvider) => {
    const session = identity;
    if (!session) return;
    const summary = await runSync('signIn');
    const account = signedIn();
    const host = resultHost;
    resultHost = null;
    if (identity !== session || !account) return;
    update({
      signIn: { kind: 'idle' },
      sheet: snapshot.sheet ?? host,
      result: signInResult(provider, session.email, summary ?? { ...account, syncConsent: account.syncConsent ?? 'none', firstLink: null }),
    });
  };
  const readConsent = async (userId: string): Promise<SyncConsentState | null> => {
    try { return syncConsentState(await consent.records(userId)); } catch { return null; }
  };

  const manager: AccountSessionManager = {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    dismissCard: () => update({ cardDismissed: true }),
    openSignIn: (host: AccountSheetHost) => update({ sheet: host, signIn: { kind: 'idle' }, result: null }),
    closeSheet: () => {
      signInRequest += 1;
      // Closing the sheet over the consent question continues unticked: sign-in completes without
      // the records, and the sheet comes back with the result that says so.
      const declining = snapshot.consent.prompt === 'signIn';
      if (declining) resultHost = snapshot.sheet;
      update({ sheet: null, signIn: { kind: 'idle' }, result: null });
      if (declining) void manager.answerConsent(false);
    },
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
        update({ session: showIdentity(session) });
        const syncConsent = await readConsent(session.userId);
        if (identity !== session) return;
        updateSession({ syncConsent });
        // Nothing uploads before the person answers, so the first link waits for the sheet.
        if (syncConsent === 'none' && snapshot.sheet !== null) {
          awaitingConsent = provider;
          update({ consent: { prompt: 'signIn', status: 'idle' } });
          return;
        }
        await finishSignIn(provider);
      } catch {
        if (request === signInRequest) update({ signIn: { kind: 'failed', provider } });
      }
    },
    openConsent: () => {
      const account = signedIn();
      if (account && account.syncConsent !== 'given' && snapshot.consent.status !== 'saving')
        update({ consent: { prompt: 'account', status: 'idle' } });
    },
    async answerConsent(given) {
      const { prompt, status } = snapshot.consent;
      const session = identity;
      if (prompt === null || status === 'saving' || !session) return;
      if (given) {
        update({ consent: { prompt, status: 'saving' } });
        try {
          await consent.give(session.userId, answer());
        } catch {
          if (identity === session) update({ consent: { prompt, status: 'failed' } });
          return;
        }
        if (identity !== session) return;
        updateSession({ syncConsent: 'given' });
      }
      update({ consent: noConsentPrompt });
      if (prompt === 'signIn' && awaitingConsent !== null) {
        const provider = awaitingConsent;
        awaitingConsent = null;
        await finishSignIn(provider);
      } else if (given) {
        await runSync('manual');
      }
    },
    closeConsent: () => {
      if (snapshot.consent.prompt === 'signIn') void manager.answerConsent(false);
      else if (snapshot.consent.status !== 'saving') update({ consent: noConsentPrompt });
    },
    async withdrawConsent() {
      const session = identity;
      if (!session || snapshot.consent.status === 'saving') return;
      update({ consent: { prompt: null, status: 'saving' } });
      try {
        await consent.withdraw(answer());
      } catch {
        if (identity === session) update({ consent: { prompt: null, status: 'failed' } });
        return;
      }
      if (identity !== session) return;
      update({ consent: noConsentPrompt });
      updateSession({ syncConsent: 'withdrawn', closetPieces: 0, historyDays: 0 });
      await runSync('manual');
    },
    syncNow: () => { void runSync('manual'); },
    async addProvider(provider) {
      if (!identity || identity.providers.includes(provider)) return 'unchanged';
      try {
        identity = await auth.addProvider(provider);
        updateSession({ providers: identity.providers });
        return 'linked';
      } catch (error) {
        // ADR 0041 section 1: an identity another account owns gets the system alert; any other
        // failure leaves the current session unchanged without a word.
        return error instanceof AccountProviderError && error.code === 'identityTaken' ? 'identityTaken' : 'unchanged';
      }
    },
    async signOut() {
      if (identity) await endSession();
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
          sheet: 'settings', consent: noConsentPrompt,
          result: { kind: 'deleted', provider, appleUnrevoked: result.appleUnrevoked } });
      } catch { update({ deletion: 'failed' }); }
    },
    clearNotice: () => {
      if (snapshot.session.kind === 'signedOut' && snapshot.session.notice !== null)
        update({ session: { kind: 'signedOut', notice: null } });
    },
    load: set,
    async start() {
      let session: AuthSession | null;
      try {
        session = await auth.currentSession();
        sessionUnread = false;
      } catch {
        // The stored session could not be read at all: shown signed out, but nothing is ended,
        // and the next foreground reads it again.
        sessionUnread = true;
        return;
      }
      if (session?.provider === 'apple') {
        // ADR 0041 section 2: an Apple ID that revoked kuyara, or no longer exists, ends the
        // session at launch the way signing out does. A check that fails changes nothing.
        let state: AppleCredentialState | null = null;
        try { state = await auth.appleCredentialState(); } catch { /* Offline or Apple unreachable. */ }
        if (state === 'revoked' || state === 'notFound') {
          identity = session;
          update({ session: showIdentity(session) });
          try { await endSession(); } catch { identity = null; update({ session: { kind: 'signedOut', notice: 'signedOut' } }); }
          return;
        }
      }
      await restore('restore', session);
    },
    async foreground() {
      if (sessionUnread) { await manager.start(); return; }
      if (!identity) return;
      let session: AuthSession | null;
      try {
        session = await auth.refreshSession();
      } catch {
        // Unknown, not ended: the session stays as it is until the auth service can answer.
        return;
      }
      if (session !== null) { await restore('foreground', session); return; }
      // The auth service said the session is gone: it ends the way signing out does.
      try { await auth.signOut(); } catch { /* The screen still leaves the ended session. */ }
      await restore('foreground', null);
    },
    async localWrite() { await runSync('localWrite'); },
    setOnline: (online) => update({ online }),
  };
  return manager;
}
