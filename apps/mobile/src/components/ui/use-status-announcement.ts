import { useEffect, useRef } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

/**
 * Speaks a status line on iOS each time its text changes, because VoiceOver ignores
 * `accessibilityLiveRegion`; Android keeps the live region on the line itself
 * (docs/product-decisions.md, "Refresh status is announced, not only shown").
 *
 * Nothing is spoken on mount, on a render that leaves the text as it was, on entering or
 * leaving `null` (no status line), or while `enabled` is false. The screen passes its focus
 * as `enabled`, so a tab behind another never speaks, and regaining focus replays nothing.
 */
export function useStatusAnnouncement(message: string | null, enabled: boolean): void {
  const previous = useRef(message);

  useEffect(() => {
    const before = previous.current;
    previous.current = message;
    if (before === null || message === null || before === message) return;
    if (enabled && Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(message);
  }, [enabled, message]);
}
