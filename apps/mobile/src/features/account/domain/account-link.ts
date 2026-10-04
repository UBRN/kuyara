// The device's account link (ADR 0041 sections 3, 6 and 7): the signed-in user, the last user
// this phone was linked to (kept after sign-out), the account this phone's Closet and History
// joined under the sync consent with the consent record they joined under, and the last pull
// cursor. Pure state transitions; the caller stores the link and acts on what each outcome says.

export type AccountLink = Readonly<{
  /** The account this phone is linked to now; signing out clears it. */
  userId: string | null;
  /** The account this phone was last linked to, kept after sign-out; any first link sets it. */
  lastUserId: string | null;
  /** The account this phone's Closet and History joined under the sync consent, kept after sign-out. */
  recordsUserId: string | null;
  /**
   * The server arrival (`recorded_at`, canonical) of the `given` consent record the records
   * joined under. A newer `given` record means the consent was withdrawn, which deleted the
   * account's copies, and given again since, so the records join again with a first link.
   */
  recordsConsentRecordedAt: string | null;
  cursor: string | null;
}>;

export const unlinked: AccountLink = {
  userId: null, lastUserId: null, recordsUserId: null, recordsConsentRecordedAt: null, cursor: null,
};

/** Signing out keeps everything on the phone, including the flags, the last user and the cursor. */
export function signOut(link: AccountLink): AccountLink {
  return { ...link, userId: null };
}

/** Deletion clears the link, the last linked user, the cursor and every pending flag. */
export function afterAccountDeletion(): Readonly<{ link: AccountLink; resetPendingFlags: true }> {
  return { link: unlinked, resetPendingFlags: true };
}

/**
 * Which pass a sync runs for the signed-in `userId`. With the consent, a phone whose records
 * have not joined this account under its current consent takes a first link, which pulls and
 * merges everything: a new account, a consent given later on any phone, or a consent withdrawn
 * and given again while this phone was away (`withdrawnAt`, the latest `withdrawn` record's
 * arrival, is newer than the `given` record the records joined under; a redundant later `given`
 * with no withdrawal after the joining one resumes, so the phone's pending edits are not
 * overwritten). Without it only the profile crosses: the account
 * this phone was last linked to resumes silently, so a name or gender edit made while signed out
 * uploads (section 6); any other account takes a first link.
 */
export function syncPassFor(
  link: AccountLink,
  userId: string,
  syncConsent: boolean,
  withdrawnAt: string | null,
): 'first-link' | 'sync' {
  if (!syncConsent) return link.lastUserId === userId ? 'sync' : 'first-link';
  const joinedAt = link.recordsConsentRecordedAt;
  const joined = link.recordsUserId === userId && joinedAt !== null && (withdrawnAt === null || withdrawnAt <= joinedAt);
  return joined ? 'sync' : 'first-link';
}

/** The link a first link saves with the account's cursor, in the same transaction as its rows. */
export function linkAfterFirstLink(
  link: AccountLink,
  userId: string,
  syncConsent: boolean,
  cursor: string | null,
  givenAt: string | null,
): AccountLink {
  return {
    userId,
    lastUserId: userId,
    recordsUserId: syncConsent ? userId : link.recordsUserId,
    recordsConsentRecordedAt: syncConsent ? givenAt : link.recordsConsentRecordedAt,
    cursor,
  };
}

/**
 * The link at the start of a pass: linked to `userId` now. Without the consent the account holds
 * none of this phone's records (it was never given, or a withdrawal on any phone deleted the
 * account's copies), so they no longer count as joined and the next consent links them again
 * from the start. Returns `link` itself when nothing changes, so the caller saves only a change.
 */
export function linkAtPass(link: AccountLink, userId: string, syncConsent: boolean): AccountLink {
  const left = !syncConsent && link.recordsUserId === userId;
  if (link.userId === userId && !left) return link;
  return left ? { ...link, userId, recordsUserId: null, recordsConsentRecordedAt: null } : { ...link, userId };
}
