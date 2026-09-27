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
