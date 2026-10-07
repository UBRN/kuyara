import type {
  AccountProvider,
  AccountResult,
  AccountScreensPort,
  AccountScreensSnapshot,
  AccountSession,
  AccountSheetHost,
  ConsentStatus,
  WelcomeAdded,
} from '@/features/account/application/account-screens';
import type { AccountDeletionPort } from '@/features/account/application/account-delete';
import type { FirstLinkOutcome } from '@/features/account/application/account-sync';
import {
  SYNC_CONSENT_TEXT_VERSION,
  syncConsentState,
  type SyncConsentRecord,
  type SyncConsentState,
} from '@/features/account/domain/sync-consent';

export const noConsentPrompt: ConsentStatus = { prompt: null, status: 'idle' };

/** Where every session starts: signed out, online, no sheet and no question. */
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
  /** Whether a first link of this phone with the account has finished (`hasLinkedTo`). */
  hasLinked: (userId: string) => Promise<boolean>;
  run: (userId: string) => Promise<AccountSyncSummary>;
}>;

/**
 * A device-local mark that the consent question after sign-in is open, kept until it is answered
 * either way, so a launch can tell that the app was closed over it (ADR 0041 section 5).
 */
export type ConsentQuestionPort = Readonly<{
  wasOpen: () => Promise<boolean>;
  setOpen: (open: boolean) => Promise<void>;
}>;

/**
 * A device-local mark of the account this phone holds an Apple credential for: it signed in with
 * Apple, or added Apple, for that user. Apple's credential state and its revocation notice apply
 * to that account alone (ADR 0041 section 2).
 */
export type AppleCredentialMarkPort = Readonly<{
  userId: () => Promise<string | null>;
  set: (userId: string | null) => Promise<void>;
}>;

export type AccountSessionManager = AccountScreensPort & Readonly<{
  start: () => Promise<void>;
  foreground: () => Promise<void>;
  localWrite: () => Promise<void>;
  setOnline: (online: boolean) => void;
  /** Apple reported kuyara's Sign in with Apple revoked while the app runs. */
  appleRevoked: () => Promise<void>;
}>;

/**
 * The sheet after a sign-in (ADR 0041 sections 3, 4 and 5), from the first link's merge counts.
 * Without the consent only the name and gender went. When the account held nothing this phone
 * lacked, the welcome states what the phone added; when the phone added nothing, the account's
 * records came back to it (a new phone restoring); when both gave, the merge result. A sign-in
 * that resumed the account the records already joined has no first link and states the totals.
 * A pass that did not run or failed (`summary` null) claims nothing reached the account yet:
 * the next pass sends it, and the Account screen shows the failed sync.
 */
export function signInResult(
  provider: AccountProvider,
  email: string,
  summary: Pick<AccountSyncSummary, 'closetPieces' | 'historyDays' | 'syncConsent' | 'firstLink'> | null,
): AccountResult {
  const welcome = (pieces: number, days: number, added: WelcomeAdded): AccountResult =>
    ({ kind: 'signedIn', provider, email, pieces, days, added });
  if (summary === null) return welcome(0, 0, 'nothingYet');
  if (summary.syncConsent !== 'given') return welcome(0, 0, 'profile');
  if (summary.firstLink === null) return welcome(summary.closetPieces, summary.historyDays, 'records');
  const { counts, profileFrom } = summary.firstLink;
  if (counts.piecesReceived + counts.historyDaysReceived === 0) {
    return welcome(counts.piecesAdded, counts.historyDaysAdded, 'records');
  }
  if (counts.piecesAdded + counts.historyDaysAdded === 0) {
    return { kind: 'restored', pieces: counts.piecesReceived, days: counts.historyDaysReceived, profileFrom };
  }
  return { kind: 'merged', counts, profileFrom };
}

export function createAccountSessionManager({
  appleMark, auth, consent, consentQuestion, deletion, now, scenarioUserId, sync,
}: Readonly<{
  auth: AccountAuthPort;
  sync: AccountSessionSyncPort;
  deletion: AccountDeletionPort;
  consent: SyncConsentPort;
  consentQuestion: ConsentQuestionPort;
  appleMark: AppleCredentialMarkPort;
  now: () => Date;
  /**
   * Development scenarios only: the account a loaded signed-in frame stands for, so every action
   * continues from that frame. Without it `load` replaces only what the screens show.
   */
  scenarioUserId?: string;
}>): AccountSessionManager {
  let snapshot: AccountScreensSnapshot = signedOut;
  let identity: AuthSession | null = null;
  let signInRequest = 0;
  /** The sign-in request whose provider exchange is still running and may yet store a session. */
  let exchanging: number | null = null;
  /** An abandoned exchange stored a session nothing adopted; the next sign-in to settle ends it. */
  let orphaned = false;
  /**
   * A sign-in whose first sync waits for the consent question to be settled (ADR 0041 section 5):
   * from the sign-in until the answer is read, or the sheet that asks it closes, no pass runs,
   * whatever asks for one.
   */
  let awaitingConsent: AccountProvider | null = null;
  /** Restored sessions still checking for a question left open: no pass runs meanwhile. */
  let consentChecks = 0;
  /** The sheet that was closed over the consent question; it comes back with the result. */
  let resultHost: AccountSheetHost | null = null;
  /** The last launch could not read the stored session; the next foreground tries again. */
  let sessionUnread = false;
  /** The pass in flight, and the one pass that follows it for every request made meanwhile. */
  let running: Promise<AccountSyncSummary | null> | null = null;
  let trailing: Promise<AccountSyncSummary | null> | null = null;
  /** The deletion in flight: no pass starts meanwhile, and a session end waits for it. */
  let deleting: Promise<void> | null = null;
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
  /** Whether `session` is still the signed-in account: the auth service hands out a new object on every refresh. */
  const isCurrent = (session: AuthSession) => identity?.userId === session.userId;
  const answer = () => ({ textVersion: SYNC_CONSENT_TEXT_VERSION, answeredAt: now().toISOString() });
  const showIdentity = (session: AuthSession): AccountSession => ({
    kind: 'signedIn', provider: session.provider, email: session.email, providers: session.providers,
    sync: { kind: 'syncing' }, pendingChanges: 0, closetPieces: 0, historyDays: 0, lastSyncedAt: now().toISOString(),
    syncConsent: null,
  });
  /** One pass; answers its summary, or null when it did not run or failed. */
  const pass = async (): Promise<AccountSyncSummary | null> => {
    const session = identity;
    // Nothing uploads before the consent question after sign-in is settled.
    // Nor while the account is deleted: a late pass would rewrite the link the deletion resets.
    if (!session || !snapshot.online || awaitingConsent !== null || consentChecks > 0 || !signedIn() || deleting !== null) {
      return null;
    }
    updateSession({ sync: { kind: 'syncing' } });
    try {
      const summary = await sync.run(session.userId);
      if (!isCurrent(session)) return null;
      const { firstLink: _firstLink, ...counts } = summary;
      updateSession({ ...counts, sync: { kind: 'upToDate' }, lastSyncedAt: now().toISOString() });
      return summary;
    } catch {
      if (isCurrent(session)) updateSession({ sync: { kind: 'failed' } });
      return null;
    }
  };
  /**
   * One pass at a time: a request while a pass runs gets the one pass that starts after it, so a
   * consent answer, a foreground, "Sync now", a local write and sign-out never overlap, and each
   * caller awaits a pass that read the phone after its own change.
   */
  const runSync = (): Promise<AccountSyncSummary | null> => {
    if (running === null) {
      running = pass().finally(() => { running = null; });
      return running;
    }
    trailing ??= running.then(() => {
      trailing = null;
      return runSync();
    });
    return trailing;
  };
  /** Settles once no pass runs or follows: each that starts meanwhile is awaited too. */
  const passesSettled = async () => {
    while (running !== null) await running;
  };
  const markQuestion = async (open: boolean) => {
    try {
      await consentQuestion.setOpen(open);
    } catch {
      // A mark that cannot be written changes nothing else; at worst a launch asks once more or not.
    }
  };
  const markApple = async (userId: string | null) => {
    try {
      await appleMark.set(userId);
    } catch {
      // Unwritten: at worst Apple is asked about a session it has no say in, or not asked once.
    }
  };
  const holdsApple = async (session: AuthSession) => (await appleMark.userId().catch(() => null)) === session.userId;
  /**
   * What every end of a session on this phone clears: the session, a sign-in waiting for its
   * consent question and the question with its sheet, the question's mark and the Apple mark.
   */
  const forgetSession = async () => {
    identity = null;
    awaitingConsent = null;
    resultHost = null;
    await markQuestion(false);
    await markApple(null);
    const asking = snapshot.consent.prompt === 'signIn';
    update({ consent: noConsentPrompt, signIn: { kind: 'idle' }, ...(asking ? { sheet: null, result: null } : {}) });
  };
  /**
   * ADR 0041 section 5, for a session the app restores: the app was closed while the consent
   * question after sign-in was open (its mark is still set), the account still holds no answer
   * (or it cannot be read) and this phone has not linked to it. The question comes back, on the
   * sheet open or else the app-wide one, and as at sign-in no pass runs until it is answered.
   * No pass runs while this is checked either. A mark the account or the link has settled since
   * is cleared. Answers whether it asks.
   */
  const askConsentAgain = async (session: AuthSession): Promise<boolean> => {
    if (awaitingConsent !== null) return false;
    consentChecks += 1;
    try {
      if (!await consentQuestion.wasOpen().catch(() => false)) return false;
      let linked: boolean;
      try {
        linked = await sync.hasLinked(session.userId);
      } catch {
        return false; // The pass then fails on the same read.
      }
      const syncConsent = linked ? null : await readConsent(session.userId);
      if (!isCurrent(session)) return true;
      if (linked || syncConsent === 'given' || syncConsent === 'withdrawn') {
        await markQuestion(false);
        return false;
      }
      awaitingConsent = session.provider;
      updateSession({ syncConsent });
      update({ sheet: snapshot.sheet ?? 'app', signIn: { kind: 'idle' }, result: null, consent: { prompt: 'signIn', status: 'idle' } });
      return true;
    } finally {
      consentChecks -= 1;
    }
  };
  const restore = async (session: AuthSession | null) => {
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
    if (await askConsentAgain(session)) return;
    await runSync();
  };
  /**
   * Section 6: pending changes upload first when there is a connection; the phone keeps everything.
   * It never fails: ending a session always leaves the phone signed out.
   */
  const endSession = async () => {
    // A deletion settles first, so its reset is never written over; a deleted account has ended.
    await deleting;
    if (identity === null) return;
    if (snapshot.online) await runSync();
    try {
      await auth.signOut();
    } catch {
      // The screens end the session anyway; the next launch reads what the storage kept.
    }
    await forgetSession();
    update({ session: { kind: 'signedOut', notice: 'signedOut' }, cardDismissed: true });
  };
  /**
   * ADR 0041 section 2, at launch and at every foreground: an Apple ID that revoked kuyara, or no
   * longer exists, ends the session the way signing out does. Only a session whose Apple
   * credential this phone holds asks Apple, and a check that fails changes nothing. Answers
   * whether the caller must stop: the session was ended, or `current` says the account changed
   * while Apple was asked.
   */
  const endIfAppleRevoked = async (session: AuthSession, current: () => boolean = () => true): Promise<boolean> => {
    if (!await holdsApple(session)) return !current();
    let state: AppleCredentialState | null = null;
    try { state = await auth.appleCredentialState(); } catch { /* Offline or Apple unreachable. */ }
    if (!current()) return true;
    if (state !== 'revoked' && state !== 'notFound') return false;
    identity = session;
    update({ session: showIdentity(session) });
    await endSession();
    return true;
  };
  const finishSignIn = async (provider: AccountProvider) => {
    const session = identity;
    if (!session) return;
    const summary = await runSync();
    const host = resultHost;
    resultHost = null;
    if (!isCurrent(session) || !signedIn()) return;
    update({ signIn: { kind: 'idle' }, sheet: snapshot.sheet ?? host, result: signInResult(provider, session.email, summary) });
  };
  const readConsent = async (userId: string): Promise<SyncConsentState | null> => {
    try { return syncConsentState(await consent.records(userId)); } catch { return null; }
  };
  /** Ends the session an abandoned exchange stored, once no newer exchange can be storing its own. */
  const dropOrphan = async () => {
    if (!orphaned || identity !== null) return;
    orphaned = false;
    try { await auth.signOut(); } catch { /* The next launch reads what the storage kept. */ }
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
      // A second tap while one runs would start a second provider flow and drop the first.
      if (snapshot.signIn.kind === 'pending') return;
      if (!snapshot.online) { update({ signIn: { kind: 'failed', provider } }); return; }
      const request = ++signInRequest;
      update({ signIn: { kind: 'pending', provider } });
      exchanging = request;
      try {
        let session: AuthSession | null;
        try {
          session = await auth.signIn(provider);
        } finally {
          if (exchanging === request) exchanging = null;
        }
        if (request !== signInRequest) {
          // Closed or replaced: the session this exchange stored is not adopted. While a newer
          // exchange runs it may store its own, so that one settles this session instead.
          if (session !== null && identity === null) {
            if (exchanging === null) await auth.signOut();
            else orphaned = true;
          }
          return;
        }
        if (session === null) {
          await dropOrphan();
          update({ signIn: { kind: 'cancelled' } });
          return;
        }
        // This exchange stored its own session over any abandoned one.
        orphaned = false;
        identity = session;
        awaitingConsent = provider;
        update({ session: showIdentity(session) });
        if (provider === 'apple') await markApple(session.userId);
        const syncConsent = await readConsent(session.userId);
        if (!isCurrent(session)) return;
        updateSession({ syncConsent });
        // Without an answer, or with one that could not be read, the question is asked, and the
        // first link waits for the sheet. A withdrawn account is not asked again here.
        if ((syncConsent === 'none' || syncConsent === null) && snapshot.sheet !== null) {
          // Marked before it shows, so an answer always clears a mark already written.
          const host = snapshot.sheet;
          await markQuestion(true);
          if (!isCurrent(session)) return;
          update({ consent: { prompt: 'signIn', status: 'idle' } });
          if (request !== signInRequest || snapshot.sheet === null) {
            // The sheet closed while the mark was written: as closing over the question, it declines.
            resultHost = host;
            await manager.answerConsent(false);
          }
          return;
        }
        awaitingConsent = null;
        await finishSignIn(provider);
      } catch {
        if (request === signInRequest) {
          await dropOrphan();
          update({ signIn: { kind: 'failed', provider } });
        }
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
      let saved = false;
      if (given) {
        update({ consent: { prompt, status: 'saving' } });
        try {
          await consent.give(session.userId, answer());
          saved = true;
        } catch {
          if (!isCurrent(session)) return;
          // The sheet closed over the question while the answer was saved: closing declines
          // (section 5), so a save that failed continues as the decline instead of waiting on a
          // question no one sees.
          if (prompt !== 'signIn' || snapshot.sheet !== null) {
            update({ consent: { prompt, status: 'failed' } });
            return;
          }
        }
        if (!isCurrent(session)) return;
        if (saved) updateSession({ syncConsent: 'given' });
      }
      if (prompt === 'signIn') await markQuestion(false);
      update({ consent: noConsentPrompt });
      if (prompt === 'signIn' && awaitingConsent !== null) {
        const provider = awaitingConsent;
        awaitingConsent = null;
        await finishSignIn(provider);
      } else if (saved) {
        await runSync();
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
        if (isCurrent(session)) update({ consent: { prompt: null, status: 'failed' } });
        return;
      }
      if (!isCurrent(session)) return;
      update({ consent: noConsentPrompt });
      updateSession({ syncConsent: 'withdrawn', closetPieces: 0, historyDays: 0 });
      await runSync();
    },
    syncNow: () => { void runSync(); },
    async addProvider(provider) {
      if (!identity || identity.providers.includes(provider)) return 'unchanged';
      try {
        identity = await auth.addProvider(provider);
        updateSession({ providers: identity.providers });
        if (provider === 'apple') await markApple(identity.userId);
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
      const run = async () => {
        try {
          const credentials = await auth.reauthorizeDeletion();
          if (credentials === null) { update({ deletion: 'idle' }); return; }
          // A pass that started before the deletion finishes before the phone's link is reset.
          await passesSettled();
          const result = await deletion.deleteAccount(credentials);
          if (result.kind === 'failed') { update({ deletion: 'failed' }); return; }
          await forgetSession();
          // Section 7: the person may have gone anywhere meanwhile, so the result shows app-wide.
          update({ deletion: 'idle', session: { kind: 'signedOut', notice: 'deleted' }, cardDismissed: true,
            sheet: 'app', result: { kind: 'deleted', provider, appleUnrevoked: result.appleUnrevoked } });
        } catch { update({ deletion: 'failed' }); }
      };
      deleting = run().finally(() => { deleting = null; });
      await deleting;
    },
    clearNotice: () => {
      if (snapshot.session.kind === 'signedOut' && snapshot.session.notice !== null)
        update({ session: { kind: 'signedOut', notice: null } });
    },
    load: (next) => {
      if (scenarioUserId !== undefined) {
        const shown = next.session.kind === 'signedIn' ? next.session : null;
        identity = shown && { userId: scenarioUserId, provider: shown.provider, email: shown.email, providers: shown.providers };
        awaitingConsent = identity !== null && next.consent.prompt === 'signIn' ? identity.provider : null;
        resultHost = null;
      }
      set(next);
    },
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
      if (session && await endIfAppleRevoked(session)) return;
      await restore(session);
    },
    async foreground() {
      if (sessionUnread) { await manager.start(); return; }
      const before = identity;
      if (!before) return;
      // A sign-out, a deletion or the revocation observer may end the session while a call is
      // awaited: nothing after that call brings the old session back.
      const unchanged = () => identity === before;
      let session: AuthSession | null;
      try {
        session = await auth.refreshSession();
      } catch {
        // Unknown, not ended: the session stays as it is until the auth service can answer.
        return;
      }
      if (!unchanged()) return;
      if (session !== null) {
        // After the refresh, so a revoked account uploads with a fresh token, and before
        // `restore`, so it does not run a sync pass that ending it then repeats.
        if (await endIfAppleRevoked(session, unchanged)) return;
        await restore(session);
        return;
      }
      // The auth service said the session is gone: it ends the way signing out does.
      try { await auth.signOut(); } catch { /* The screen still leaves the ended session. */ }
      await forgetSession();
      await restore(null);
    },
    async localWrite() { await runSync(); },
    setOnline: (online) => {
      const reconnected = online && !snapshot.online;
      update({ online });
      // Offline, a pass does not run; the one the session waited for runs once the connection is back.
      if (reconnected && identity !== null) void runSync();
    },
    async appleRevoked() {
      const session = identity;
      if (session && await holdsApple(session) && isCurrent(session)) await endSession();
    },
  };
  return manager;
}
