import { renderHook } from '@testing-library/react-native';
import * as ExpoHaptics from 'expo-haptics';
import { Platform } from 'react-native';

import { haptics, useRefreshOutcomeHaptics } from '@/components/ui/haptics';

jest.mock('expo-haptics', () => ({
  AndroidHaptics: {
    Clock_Tick: 'clock-tick',
    Confirm: 'confirm',
    Gesture_Start: 'gesture-start',
    Long_Press: 'long-press',
    Reject: 'reject',
  },
  ImpactFeedbackStyle: { Light: 'light' },
  NotificationFeedbackType: {
    Error: 'error',
    Success: 'success',
    Warning: 'warning',
  },
  impactAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  performAndroidHapticsAsync: jest.fn(() => Promise.resolve()),
  selectionAsync: jest.fn(() => Promise.resolve()),
}));

// Focus is decided when a hook instance mounts, so a test can mount one focused screen and one
// that sits behind it, the way two mounted tabs do.
const mockFocus = { current: true };
jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual<typeof import('react')>('react');
  return {
    useFocusEffect: (callback: () => void | (() => void)) =>
      useEffect(() => (mockFocus.current ? callback() : undefined), [callback]),
  };
});

const originalPlatform = Platform.OS;
const impactAsync = jest.mocked(ExpoHaptics.impactAsync);
const notificationAsync = jest.mocked(ExpoHaptics.notificationAsync);
const performAndroidHapticsAsync = jest.mocked(ExpoHaptics.performAndroidHapticsAsync);
const selectionAsync = jest.mocked(ExpoHaptics.selectionAsync);

function setPlatform(os: typeof Platform.OS) {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: os });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFocus.current = true;
  impactAsync.mockResolvedValue();
  notificationAsync.mockResolvedValue();
  performAndroidHapticsAsync.mockResolvedValue();
  selectionAsync.mockResolvedValue();
});

afterAll(() => setPlatform(originalPlatform));

test('routes every semantic token to the matching iOS haptic', () => {
  setPlatform('ios');

  haptics.impactLight();
  haptics.selection();
  haptics.success();
  haptics.error();
  haptics.warning();

  expect(impactAsync).toHaveBeenCalledWith(ExpoHaptics.ImpactFeedbackStyle.Light);
  expect(selectionAsync).toHaveBeenCalledTimes(1);
  expect(notificationAsync.mock.calls).toEqual([
    [ExpoHaptics.NotificationFeedbackType.Success],
    [ExpoHaptics.NotificationFeedbackType.Error],
    [ExpoHaptics.NotificationFeedbackType.Warning],
  ]);
  expect(performAndroidHapticsAsync).not.toHaveBeenCalled();
});

test('routes every semantic token to the matching Android haptic', () => {
  setPlatform('android');

  haptics.impactLight();
  haptics.selection();
  haptics.success();
  haptics.error();
  haptics.warning();

  expect(performAndroidHapticsAsync.mock.calls).toEqual([
    [ExpoHaptics.AndroidHaptics.Gesture_Start],
    [ExpoHaptics.AndroidHaptics.Clock_Tick],
    [ExpoHaptics.AndroidHaptics.Confirm],
    [ExpoHaptics.AndroidHaptics.Reject],
    [ExpoHaptics.AndroidHaptics.Long_Press],
  ]);
  expect(impactAsync).not.toHaveBeenCalled();
  expect(notificationAsync).not.toHaveBeenCalled();
  expect(selectionAsync).not.toHaveBeenCalled();
});

test('swallows rejected native haptic promises', async () => {
  setPlatform('ios');
  selectionAsync.mockRejectedValueOnce(new Error('haptics unavailable'));

  expect(() => haptics.selection()).not.toThrow();
  await Promise.resolve();
});

test.each([
  [false, 'success'],
  [true, 'error'],
] as const)('reports one %s refresh outcome only after refreshing becomes idle', async (
  failed,
  token,
) => {
  const outcome = jest.spyOn(haptics, token).mockImplementation(() => undefined);
  const hook = await renderHook(
    (props: { failed: boolean; isRefreshing: boolean }) =>
      useRefreshOutcomeHaptics(props.isRefreshing, props.failed),
    { initialProps: { failed, isRefreshing: false } },
  );

  expect(outcome).not.toHaveBeenCalled();
  await hook.rerender({ failed, isRefreshing: true });
  expect(outcome).not.toHaveBeenCalled();
  await hook.rerender({ failed, isRefreshing: false });
  await hook.rerender({ failed, isRefreshing: false });

  expect(outcome).toHaveBeenCalledTimes(1);
});

test('only the focused screen reports the outcome of a shared refresh', async () => {
  const success = jest.spyOn(haptics, 'success').mockImplementation(() => undefined);
  const focusedScreen = await renderHook(
    (props: { isRefreshing: boolean }) => useRefreshOutcomeHaptics(props.isRefreshing, false),
    { initialProps: { isRefreshing: false } },
  );
  mockFocus.current = false;
  const hiddenScreen = await renderHook(
    (props: { isRefreshing: boolean }) => useRefreshOutcomeHaptics(props.isRefreshing, false),
    { initialProps: { isRefreshing: false } },
  );

  for (const isRefreshing of [true, false]) {
    await focusedScreen.rerender({ isRefreshing });
    await hiddenScreen.rerender({ isRefreshing });
  }

  expect(success).toHaveBeenCalledTimes(1);
});
