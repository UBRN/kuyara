// The device's account link (ADR 0041 sections 3, 6 and 7): the signed-in user, the last user
// this phone was linked to (kept after sign-out) and the last pull cursor. Pure state
// transitions; the caller stores the link and acts on what each outcome says.

export type AccountLink = Readonly<{
  userId: string | null;
  lastUserId: string | null;
  cursor: string | null;
}>;

export const unlinked: AccountLink = { userId: null, lastUserId: null, cursor: null };

export type DifferentAccountChoice = 'add' | 'dont-add';

export type SignInOutcome =
  /** A different account than last time: the sheet asks, stating how many changes are waiting. */
  | Readonly<{ kind: 'choose-for-previous-rows'; pendingCount: number }>
  | Readonly<{
    kind: 'linked';
    link: AccountLink;
    /** `first-link` pulls and merges from the beginning before uploading; `resume` continues from the cursor. */
    sync: 'first-link' | 'resume';
    /** `remove` deletes the previous account's Closet and History rows on the phone. */
    previousRows: 'keep' | 'remove';
  }>;

export function signIn(
  link: AccountLink,
  userId: string,
  pendingCount: number,
  choice: DifferentAccountChoice | null,
): SignInOutcome {
  if (link.lastUserId === userId) {
    return {
      kind: 'linked',
      link: { userId, lastUserId: userId, cursor: link.cursor },
      sync: 'resume',
      previousRows: 'keep',
    };
  }
  const fromTheBeginning: AccountLink = { userId, lastUserId: userId, cursor: null };
  if (link.lastUserId === null) {
    return { kind: 'linked', link: fromTheBeginning, sync: 'first-link', previousRows: 'keep' };
  }
  if (choice === null) return { kind: 'choose-for-previous-rows', pendingCount };
  return {
    kind: 'linked',
    link: fromTheBeginning,
    sync: 'first-link',
    previousRows: choice === 'add' ? 'keep' : 'remove',
  };
}

/** Signing out keeps everything on the phone, including the flags, the last user and the cursor. */
export function signOut(link: AccountLink): AccountLink {
  return { ...link, userId: null };
}

/** Deletion clears the link, the last linked user, the cursor and every pending flag. */
export function afterAccountDeletion(): Readonly<{ link: AccountLink; resetPendingFlags: true }> {
  return { link: unlinked, resetPendingFlags: true };
}
