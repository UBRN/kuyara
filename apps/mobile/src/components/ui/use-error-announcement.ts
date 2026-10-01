import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

/**
 * Speaks an error line on iOS the moment it appears or changes, because VoiceOver ignores
 * both `accessibilityLiveRegion` and the `alert` role (docs/product-decisions.md, "Refresh
 * status is announced, not only shown"); Android keeps its own live region on the line.
 *
 * Pass the text while the error is showing and `null` while it is not. Unlike
 * `useStatusAnnouncement` this speaks on mount too: an error line is only ever mounted (or
 * given text) as the result of something the person just did, and it has no screen focus to
 * wait for because it lives inside the sheet or form that reports it.
 *
 * `skipInitial` is for a line that can already be showing when its screen opens (a failure
 * persisted earlier, spoken when it happened): it speaks only a line that appears, or
 * reappears after it went, while the screen is up. Pass `undefined` while the screen cannot
 * tell yet (still loading): the first value that is not `undefined` is then the one the
 * screen opened on, so a stored failure that arrives with the loaded list is not spoken either.
 */
export function useErrorAnnouncement(
  message: string | null | undefined,
  options: Readonly<{ skipInitial?: boolean }> = {},
): void {
  const { skipInitial = false } = options;
  const settled = useRef(message !== undefined);
  const showing = useRef(message != null);
  useEffect(() => {
    if (message === undefined) return;
    const opening = !settled.current;
    settled.current = true;
    const raised = !showing.current;
    showing.current = message !== null;
    if (message === null || Platform.OS !== 'ios' || (skipInitial && (opening || !raised))) return;
    AccessibilityInfo.announceForAccessibility(message);
  }, [message, skipInitial]);
}
