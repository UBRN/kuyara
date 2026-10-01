import { useRouter, type Href } from 'expo-router';
import { useRef } from 'react';

/** Long enough for the stack's own transition to cover the screen that was pressed. */
export const PUSH_WINDOW_MS = 600;

export type SingleTap = Readonly<{
  /** `router.push`, dropped inside the window that follows an earlier tap. */
  push: (href: Href) => void;
  /**
   * A `Link`'s `onPress`: the link navigates by itself after it, so a press inside the window
   * cancels that navigation instead.
   */
  linkPress: (event: Readonly<{ preventDefault: () => void }>) => void;
}>;

/**
 * One tap opens one screen. A stack push always appends, so a quick double tap on a card, a
 * tile or a bar button used to stack the same screen twice (two outfit details, two blank
 * add forms) and Back showed it again. Every push and link press made through one instance
 * shares one window: a second tap inside it, on the same control or another, opens nothing;
 * a later one, after the transition, goes through as usual.
 */
export function useSingleTap(): SingleTap {
  const router = useRouter();
  const lastAt = useRef(Number.NEGATIVE_INFINITY);
  const once = () => {
    const now = Date.now();
    if (now - lastAt.current < PUSH_WINDOW_MS) return false;
    lastAt.current = now;
    return true;
  };
  return {
    push: (href) => {
      if (once()) router.push(href);
    },
    linkPress: (event) => {
      if (!once()) event.preventDefault();
    },
  };
}

/** `useSingleTap` for a screen whose taps all push. */
export function useSinglePush(): (href: Href) => void {
  return useSingleTap().push;
}
