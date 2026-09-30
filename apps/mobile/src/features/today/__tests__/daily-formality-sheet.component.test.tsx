import { render } from '@testing-library/react-native';
import { AccessibilityInfo, StyleSheet } from 'react-native';
import * as Reanimated from 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { DailyFormalitySheet } from '@/features/today/presentation/daily-formality-sheet';
import { messages } from '@/localization/messages';
import { lightTheme } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

jest.mock('@expo/ui/swift-ui', () => jest.requireActual('@/components/ui/__tests__/expo-ui-test-mock'));
jest.mock('@expo/ui/swift-ui/modifiers', () =>
  jest.requireActual('@/components/ui/__tests__/expo-ui-test-mock'));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('@expo/ui/community/bottom-sheet', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  return { BottomSheet: ({ children, index }: { children: React.ReactNode; index: number }) =>
    index >= 0 ? React.createElement(View, null, children) : null };
});

function sheet(error: boolean) {
  return (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 },
      insets: { top: 59, right: 0, bottom: 34, left: 0 } }}>
      <KuyaraThemeContext.Provider value={lightTheme}>
        <DailyFormalitySheet error={error} language="en" onChoose={jest.fn()} onDismiss={jest.fn()}
          question="What are you dressing for?" selected="smart" visible />
      </KuyaraThemeContext.Provider>
    </SafeAreaProvider>
  );
}

test('a failed day-type save is spoken to VoiceOver once, and nothing is spoken without one', async () => {
  const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
  announce.mockClear();
  const view = await render(sheet(false));
  expect(announce).not.toHaveBeenCalled();

  await view.rerender(sheet(true));
  expect(announce).toHaveBeenCalledTimes(1);
  expect(announce).toHaveBeenCalledWith(messages.en.today.dailyStyle.saveError);
  announce.mockRestore();
});

test('a failed styles save shows its warning above Done, where the long step does not hide it', async () => {
  const view = await render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 },
      insets: { top: 59, right: 0, bottom: 34, left: 0 } }}>
      <KuyaraThemeContext.Provider value={lightTheme}>
        <DailyFormalitySheet confirmLabel="Done" error language="en" onChoose={jest.fn()}
          onConfirmStyles={jest.fn()} onDismiss={jest.fn()} question="What are you dressing for?"
          selected="smart" step="styles" visible />
      </KuyaraThemeContext.Provider>
    </SafeAreaProvider>,
  );
  const ordered = view.getAllByTestId(/^daily-formality-(error|styles-done)$/).map((node) => node.props.testID);
  expect(ordered).toEqual(['daily-formality-error', 'daily-formality-styles-done']);
  const warning = view.getByTestId('daily-formality-error');
  expect(warning).toHaveTextContent(messages.en.today.dailyStyle.saveError);
  expect(warning.props.accessibilityRole).toBe('alert');
});

// Law 7: the step change fades the new step in on `normal`; the first step shows at rest.
test('the styles step fades in after the day type is chosen; the first step stands still', async () => {
  const copy = messages.en.today.dailyStyle;
  const withTiming = jest.spyOn(Reanimated, 'withTiming');
  const at = (step: 'dayType' | 'styles') => (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 },
      insets: { top: 59, right: 0, bottom: 34, left: 0 } }}>
      <KuyaraThemeContext.Provider value={lightTheme}>
        <DailyFormalitySheet confirmLabel="Done" error={false} language="en" onChoose={jest.fn()}
          onConfirmStyles={jest.fn()} onDismiss={jest.fn()} question="What are you dressing for?"
          selected="smart" step={step} visible />
      </KuyaraThemeContext.Provider>
    </SafeAreaProvider>
  );
  const view = await render(at('dayType'));
  const opacityOf = (node: ReturnType<typeof view.getByTestId>) => StyleSheet.flatten(node.parent!.props.style).opacity;
  expect(opacityOf(view.getByTestId('daily-formality-choices'))).toBe(1);

  withTiming.mockImplementation((toValue) => toValue);
  await view.rerender(at('styles'));
  expect(opacityOf(view.getByTestId('daily-formality-styles-note'))).toBe(0);
  expect(opacityOf(view.getByRole('header', { name: copy.stylesQuestion }))).toBe(0);
  expect(withTiming).toHaveBeenCalledWith(1, { duration: lightTheme.motion.normal });
  withTiming.mockRestore();
});
