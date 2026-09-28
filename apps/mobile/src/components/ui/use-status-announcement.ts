import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

/**
 * Speaks a status line on iOS each time its text changes, because VoiceOver ignores
 * `accessibilityLiveRegion`; Android keeps the live region on the line itself
 * (docs/product-decisions.md, "Refresh status is announced, not only shown").
 *
 * Nothing is spoken on mount, on a render that leaves the text as it was, on entering or
 * leaving `null` (no status line), or while the screen is not focused, so a tab behind
 * another never speaks and regaining focus replays nothing. Focus is read here from a ref:
 * as state on the screen it re-rendered the whole screen on every tab switch.
 */
export function useStatusAnnouncement(message: string | null): void {
  const previous = useRef(message);
  const focused = useRef(false);

  // Declared before the focus effect so that a message that moves in the very commit that
  // focus arrives is still judged against the focus the screen had before it.
  useEffect(() => {
    const before = previous.current;
    previous.current = message;
    if (before === null || message === null || before === message) return;
    if (focused.current && Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(message);
  }, [message]);
  useFocusEffect(useCallback(() => {
    focused.current = true;
    return () => { focused.current = false; };
  }, []));
}
