import { router, useNavigationContainerRef } from 'expo-router';
import { useCallback } from 'react';

export type TabRootHref = '/' | '/profile';

const TAB_STACK: Readonly<Record<TabRootHref, string>> = { '/': '(today)', '/profile': '(profile)' };

type StackState = Readonly<{ routes: readonly Readonly<{ name: string; state?: StackState }>[] }>;

function stackDepth(state: StackState | undefined, name: string): number {
  for (const route of state?.routes ?? []) {
    if (route.name === name) return route.state?.routes.length ?? 0;
    const depth = stackDepth(route.state, name);
    if (depth > 0) return depth;
  }
  return 0;
}

/**
 * Opens a primary tab at its root. Navigating to a tab root pushes a second root over a
 * screen its stack still holds (Today over an open outfit, Profile over History), so a stack
 * deeper than its root is also popped to it, in the same tick. A bare stack is only
 * navigated: popping it has nothing to pop and is an unhandled action.
 */
export function useOpenTabRoot(): (href: TabRootHref) => void {
  const container = useNavigationContainerRef();
  return useCallback((href: TabRootHref) => {
    const deeper = container.isReady() && stackDepth(container.getRootState(), TAB_STACK[href]) > 1;
    router.navigate(href);
    if (deeper) router.dismissAll();
  }, [container]);
}
