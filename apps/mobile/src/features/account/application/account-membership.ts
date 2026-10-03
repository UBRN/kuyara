import { useContext, useSyncExternalStore } from 'react';

import type { AccountScreensSnapshot } from '@/features/account/application/account-screens';
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
