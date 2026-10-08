// A session is one app process the person has seen. It is counted once, when the launch is
// first seen (`domain/launch-visibility.ts`): before the first render for a foreground launch,
// on the first return to the foreground for one iOS started in the background, and never for
// a background launch nobody opens. ADR 0033 section 6 reads the count.
import { useSyncExternalStore } from 'react';

import type { LaunchVisibility } from '@/features/analytics/domain/launch-visibility';

export type LaunchSession = Readonly<{
  /** The 1-based session index, or null while nobody has seen this launch. */
  current: () => number | null;
  subscribe: (listener: () => void) => () => void;
}>;

export function createLaunchSession(
  visibility: Pick<LaunchVisibility, 'onSeen'>,
  countSession: () => number,
): LaunchSession {
  let index: number | null = null;
  const listeners = new Set<() => void>();
  visibility.onSeen(() => {
    index = countSession();
    for (const listener of [...listeners]) listener();
  });
  return {
    current: () => index,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function useLaunchSessionIndex(session: LaunchSession): number | null {
  return useSyncExternalStore(session.subscribe, session.current, session.current);
}
