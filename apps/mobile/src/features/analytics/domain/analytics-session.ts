// A session is one app process. The count advances once per launch and is durable, so the
// consent question can be asked from the second session onwards: the first session belongs
// to the first recommendation and is never interrupted by the sheet. See ADR 0033 section 6.
const firstAskingSession = 2;

/**
 * The 1-based index of the session a launch starts, given the recorded count of the launches
 * before it. An absent, unreadable or nonsensical record is read as no earlier session.
 */
export function nextSessionIndex(recordedCount: string | null): number {
  const parsed = recordedCount === null ? Number.NaN : Number.parseInt(recordedCount, 10);
  return (Number.isInteger(parsed) && parsed > 0 ? parsed : 0) + 1;
}

export function sessionMayAskForConsent(sessionIndex: number): boolean {
  return sessionIndex >= firstAskingSession;
}
