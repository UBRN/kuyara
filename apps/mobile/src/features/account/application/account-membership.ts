import { useContext, useSyncExternalStore } from 'react';

import type {
  AccountScreensPort,
  AccountScreensSnapshot,
  AccountSheetHost,
} from '@/features/account/application/account-screens';
import { AccountScreensContext } from '@/features/account/application/account-screens-context';

/**
 * Whether the person has an account: a signed-in session on the account screens port. The one
 * place that answers it, as a plain boolean, so a feature that is for members reads it
 * without touching the identity (no email, provider or counts leave this module).
 */
export function selectIsMember(snapshot: AccountScreensSnapshot): boolean {
  return snapshot.session.kind === 'signedIn';
}

/** `selectIsMember` for a component: it re-renders only when the answer changes. */
export function useIsMember(): boolean {
  const port = useContext(AccountScreensContext);
  return useSyncExternalStore(port.subscribe, () => selectIsMember(port.getSnapshot()));
}

/**
 * Opens "Complete your profile" on a host's sheet: the one account action a members-only
 * feature takes, without reading the session or anything else about the account.
 */
export function useOpenSignIn(): (host: AccountSheetHost) => void {
  return useContext(AccountScreensContext).openSignIn;
}

type MemberAccess = Readonly<{
  port: Pick<AccountScreensPort, 'getSnapshot'>;
  /** The signed-in session's current access token; it may refresh it first. */
  accessToken: () => Promise<string | null>;
}>;

let live: MemberAccess | null = null;

/**
 * The live account session, registered by its composition for the code outside React that a
 * member's allowance reaches (ADR 0041 section 13). Returns the unregister.
 */
export function provideMemberAccess(access: MemberAccess): () => void {
  live = access;
  return () => {
    if (live === access) live = null;
  };
}

/** `selectIsMember` at the moment of a call, for the re-ask allowance; false without accounts. */
export function isMemberNow(): boolean {
  return live !== null && selectIsMember(live.port.getSnapshot());
}

/**
 * A signed-in member's access token for the Worker's member allowance, sent only as a bearer
 * header; null when signed out, without accounts or when it cannot be read, so no request ever
 * carries a token for someone who is not signed in.
 */
export async function memberAccessToken(): Promise<string | null> {
  const access = live;
  if (access === null || !selectIsMember(access.port.getSnapshot())) return null;
  try {
    return await access.accessToken();
  } catch {
    return null;
  }
}
