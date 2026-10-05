// The account's sync consent (ADR 0041 section 10). The consent belongs to the account, not to
// a phone: the account keeps every answer, given or withdrawn, with the version of the text
// shown and the time, and its latest answer decides whether the six kinds of records sync.

/**
 * The version of the consent text the sheet shows. `sync-consent-text.test.mjs` pins a hash of
 * both languages' text to it, so a changed word cannot ship under an old version.
 */
export const SYNC_CONSENT_TEXT_VERSION = '2026-10-06';

export type SyncConsentAnswer = 'given' | 'withdrawn';

/**
 * One answer the account holds; `answeredAt` is the instant the person answered (the phone's
 * clock) and `recordedAt` its arrival at the server, canonical (`canonicalServerInstant`).
 */
export type SyncConsentRecord = Readonly<{
  answer: SyncConsentAnswer;
  textVersion: string;
  answeredAt: string;
  recordedAt: string;
}>;

/** The account's consent: its latest answer, or `none` while it holds no answer. */
export type SyncConsentState = SyncConsentAnswer | 'none';

/**
 * The latest answer wins. The records arrive in the order the server received them, so a phone
 * clock never decides which answer is the latest (ADR 0041 red lines).
 */
export function syncConsentState(recordsInArrivalOrder: readonly SyncConsentRecord[]): SyncConsentState {
  return recordsInArrivalOrder.at(-1)?.answer ?? 'none';
}

/**
 * The arrival of the consent the records sync under: the latest answer's `recordedAt` when it is
 * `given`, else null: the record a first link saves as the one the records joined under.
 */
export function givenConsentRecordedAt(recordsInArrivalOrder: readonly SyncConsentRecord[]): string | null {
  const latest = recordsInArrivalOrder.at(-1);
  return latest?.answer === 'given' ? latest.recordedAt : null;
}

/**
 * The arrival of the latest `withdrawn` answer, or null when the account holds none. A withdrawal
 * deletes the account's copies, so records that joined before it must link again; a redundant
 * `given` with no withdrawal after the joining one changes nothing the phone holds.
 */
export function latestWithdrawnRecordedAt(recordsInArrivalOrder: readonly SyncConsentRecord[]): string | null {
  return recordsInArrivalOrder.findLast((record) => record.answer === 'withdrawn')?.recordedAt ?? null;
}
