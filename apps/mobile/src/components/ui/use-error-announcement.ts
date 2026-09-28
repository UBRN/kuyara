import { useEffect } from 'react';
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
 */
export function useErrorAnnouncement(message: string | null): void {
  useEffect(() => {
    if (message !== null && Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(message);
  }, [message]);
}
