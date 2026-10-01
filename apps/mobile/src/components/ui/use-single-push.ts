import { useRouter, type Href } from 'expo-router';
import { useRef } from 'react';

/** Long enough for the stack's own transition to cover the screen that was pressed. */
export const PUSH_WINDOW_MS = 600;

/** True for the first call, then false for calls inside the window that follows it. */
function useOncePerWindow(): () => boolean {
  const lastAt = useRef(Number.NEGATIVE_INFINITY);
  return () => {
    const now = Date.now();
    if (now - lastAt.current < PUSH_WINDOW_MS) return false;
    lastAt.current = now;
    return true;
  };
}

/**
 * `router.push` that opens a screen once per tap sequence. A stack push always appends, so a
 * quick double tap on a card, a tile or a bar button used to stack the same screen twice
 * (two outfit details, two blank add forms) and Back showed it again. A second push inside
 * the window is dropped; a later one, after the transition, goes through as usual.
 */
export function useSinglePush(): (href: Href) => void {
  const router = useRouter();
  const once = useOncePerWindow();
  return (href) => {
    if (once()) router.push(href);
  };
}

/**
 * The same guard for a `Link`, which navigates by itself after its `onPress`: a second
 * press inside the window cancels that navigation. One handler shared by several links
 * also drops a quick press on a second link, as one `useSinglePush` does for its taps.
 */
export function useSingleLinkPress(): (event: Readonly<{ preventDefault: () => void }>) => void {
  const once = useOncePerWindow();
  return (event) => {
    if (!once()) event.preventDefault();
  };
}
