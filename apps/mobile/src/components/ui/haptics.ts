import { useEffect, useRef } from 'react';
import {
  AndroidHaptics,
  ImpactFeedbackStyle,
  NotificationFeedbackType,
  impactAsync,
  notificationAsync,
  performAndroidHapticsAsync,
  selectionAsync,
} from 'expo-haptics';
import { Platform } from 'react-native';

function perform(ios: () => Promise<void>, android: AndroidHaptics): void {
  try {
    const action = Platform.OS === 'ios'
      ? ios
      : Platform.OS === 'android'
        ? () => performAndroidHapticsAsync(android)
        : null;
    if (action) void action().catch(() => undefined);
  } catch {
    // Haptics are best-effort and must never interrupt the user's action.
  }
}

export const haptics = {
  impactLight(): void {
    // Android Gesture_Start matches a physical pull threshold crossing.
    perform(() => impactAsync(ImpactFeedbackStyle.Light), AndroidHaptics.Gesture_Start);
  },
  selection(): void {
    // Android Clock_Tick matches a discrete selection change.
    perform(selectionAsync, AndroidHaptics.Clock_Tick);
  },
  success(): void {
    // Android Confirm matches a successful outcome.
    perform(
      () => notificationAsync(NotificationFeedbackType.Success),
      AndroidHaptics.Confirm,
    );
  },
  error(): void {
    // Android Reject matches a failed outcome.
    perform(
      () => notificationAsync(NotificationFeedbackType.Error),
      AndroidHaptics.Reject,
    );
  },
  warning(): void {
    // Android Long_Press matches an irreversible confirmation warning.
    perform(
      () => notificationAsync(NotificationFeedbackType.Warning),
      AndroidHaptics.Long_Press,
    );
  },
};

export function useRefreshOutcomeHaptics(isRefreshing: boolean, failed: boolean): void {
  const wasRefreshing = useRef(isRefreshing);

  useEffect(() => {
    if (wasRefreshing.current && !isRefreshing) {
      haptics[failed ? 'error' : 'success']();
    }
    wasRefreshing.current = isRefreshing;
  }, [failed, isRefreshing]);
}
