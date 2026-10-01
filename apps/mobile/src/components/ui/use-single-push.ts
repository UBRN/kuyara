import { useRouter, type Href } from 'expo-router';
import { useRef } from 'react';

/** Long enough for the stack's own transition to cover the screen that was pressed. */
export const PUSH_WINDOW_MS = 600;

/**
 * `router.push` that opens a screen once per tap sequence. A stack push always appends, so a
 * quick double tap on a card, a tile or a bar button used to stack the same screen twice
 * (two outfit details, two blank add forms) and Back showed it again. A second push inside
 * the window is dropped; a later one, after the transition, goes through as usual.
 */
export function useSinglePush(): (href: Href) => void {
  const router = useRouter();
  const lastPushAt = useRef(Number.NEGATIVE_INFINITY);
  return (href) => {
    const now = Date.now();
    if (now - lastPushAt.current < PUSH_WINDOW_MS) return;
    lastPushAt.current = now;
    router.push(href);
  };
}
