// The outfit detail board's gestures (Phase 7) run through gesture-handler's own Jest mocks.
import 'react-native-gesture-handler/jestSetup';

jest.mock('react-native-worklets', () =>
  jest.requireActual('react-native-worklets/src/mock'),
);

jest.mock('expo-localization', () => {
  const locales = [{ temperatureUnit: 'celsius' }];
  return { getLocales: () => locales, useLocales: () => locales };
});

jest.mock('react-native-reanimated', () => {
  const reanimated = jest.requireActual('react-native-reanimated/mock');

  return {
    ...reanimated,
    // The mock's `makeMutable` returns the bare value; the swap board keeps per-piece shared
    // values outside hooks, so the test double builds the same proxy `useSharedValue` does.
    makeMutable: (value: unknown) => reanimated.useSharedValue(value),
    interpolate: (
      value: number,
      inputRange: readonly [number, number],
      outputRange: readonly [number, number],
    ) => {
      const [inputStart, inputEnd] = inputRange;
      const [outputStart, outputEnd] = outputRange;
      const clampedValue = Math.min(inputEnd, Math.max(inputStart, value));
      const progress = (clampedValue - inputStart) / (inputEnd - inputStart);

      return outputStart + progress * (outputEnd - outputStart);
    },
  };
});

// On a device `Link.AppleZoom` wraps its child in a native zoom source view; Jest has no such
// view, and the library then renders nothing in its place. The stand-in renders the child,
// as the native view does, so the Closet tiles it wraps stay in the tree.
jest.mock('expo-router/build/link/preview/native', () => ({
  ...jest.requireActual('expo-router/build/link/preview/native'),
  LinkZoomTransitionSource: ({ children }: { children?: unknown }) => children,
}));
