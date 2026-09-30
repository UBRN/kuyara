import { render } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
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
