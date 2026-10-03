// The device's account link (ADR 0041 sections 3, 6 and 7): the signed-in user, the last user
// this phone was linked to (kept after sign-out) and the last pull cursor. Pure state
// transitions; the caller stores the link and acts on what each outcome says.

export type AccountLink = Readonly<{
  userId: string | null;
  lastUserId: string | null;
  cursor: string | null;
}>;

export const unlinked: AccountLink = { userId: null, lastUserId: null, cursor: null };

export type SignInOutcome = Readonly<{
  link: AccountLink;
  /**
   * `resume` continues from the cursor for the account this phone was last linked to. Any other
   * account, the first or a different one, takes `first-link`: it pulls and merges from the
   * beginning, so this phone's Closet and History, unsynced changes included, join it.
   */
  sync: 'first-link' | 'resume';
}>;

export function signIn(link: AccountLink, userId: string): SignInOutcome {
  if (link.lastUserId === userId) return { link: { ...link, userId }, sync: 'resume' };
  return { link: { userId, lastUserId: userId, cursor: null }, sync: 'first-link' };
}

/** Signing out keeps everything on the phone, including the flags, the last user and the cursor. */
export function signOut(link: AccountLink): AccountLink {
  return { ...link, userId: null };
}

/** Deletion clears the link, the last linked user, the cursor and every pending flag. */
export function afterAccountDeletion(): Readonly<{ link: AccountLink; resetPendingFlags: true }> {
  return { link: unlinked, resetPendingFlags: true };
}
