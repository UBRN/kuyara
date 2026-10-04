import { fireEvent, render } from '@testing-library/react-native';
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
          onPickStyles={jest.fn()} period="morning" usual="smart" visible />
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
          onConfirmStyles={jest.fn()} onDismiss={jest.fn()} onPickStyles={jest.fn()} period="morning"
          step="styles" usual="smart" visible />
      </KuyaraThemeContext.Provider>
    </SafeAreaProvider>,
  );
  const ordered = view.getAllByTestId(/^daily-formality-(error|styles-done)$/).map((node) => node.props.testID);
  expect(ordered).toEqual(['daily-formality-error', 'daily-formality-styles-done']);
  const warning = view.getByTestId('daily-formality-error');
  expect(warning).toHaveTextContent(messages.en.today.dailyStyle.saveError);
  expect(warning.props.accessibilityRole).toBe('alert');
});

// The one-tap question: it names the profile's usual day type and answers it with one large
// button; the other two day types sit below as tiles with nothing checked, each an answer too,
// and the day's styles are one optional text button away.
test.each([
  ['morning', 'en', 'A usual Smart day?', 'Or is today different?'],
  ['evening', 'en', 'A usual Smart evening?', 'Or is this evening different?'],
  ['morning', 'tr', 'Her zamanki gibi Şık bir gün mü?', 'Yoksa bugün farklı mı?'],
  ['evening', 'tr', 'Her zamanki gibi Şık bir akşam mı?', 'Yoksa bu akşam farklı mı?'],
] as const)('the %s sheet in %s asks about the usual day type and answers it in one tap',
  async (period, language, question, different) => {
    const onChoose = jest.fn();
    const onPickStyles = jest.fn();
    const copy = messages[language].today.dailyStyle;
    const view = await render(
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 59, right: 0, bottom: 34, left: 0 } }}>
        <KuyaraThemeContext.Provider value={lightTheme}>
          <DailyFormalitySheet error={false} language={language} onChoose={onChoose} onDismiss={jest.fn()}
            onPickStyles={onPickStyles} period={period} usual="smart" visible />
        </KuyaraThemeContext.Provider>
      </SafeAreaProvider>,
    );

    expect(view.getByRole('header', { name: question })).toBeOnTheScreen();
    const usual = view.getByTestId('daily-formality-usual');
    expect(usual).toHaveTextContent(copy.usualAction);
    expect(view.getByTestId('daily-formality-different')).toHaveTextContent(different);
    const tiles = view.getAllByRole('radio');
    expect(tiles.map((tile) => tile.props.accessibilityLabel)).toEqual([copy.casual, copy.formal]);
    expect(tiles.map((tile) => tile.props.accessibilityState.selected)).toEqual([false, false]);
    expect(view.getByTestId('daily-formality-pick-styles')).toHaveTextContent(copy.pickStyles);
    // Reading order: the question, the usual answer, the other day types, then the styles.
    expect(view.getAllByTestId(/^daily-formality-(usual|different|choices|pick-styles)$/)
      .map((node) => node.props.testID)).toEqual([
      'daily-formality-usual', 'daily-formality-different', 'daily-formality-choices',
      'daily-formality-pick-styles',
    ]);

    await fireEvent.press(usual);
    expect(onChoose).toHaveBeenLastCalledWith('smart');
    await fireEvent.press(view.getByTestId('daily-formality-formal'));
    expect(onChoose).toHaveBeenLastCalledWith('formal');
    await fireEvent.press(view.getByTestId('daily-formality-pick-styles'));
    expect(onPickStyles).toHaveBeenCalledTimes(1);
    expect(onChoose).toHaveBeenCalledTimes(2);
  });

// Law 7: the step change fades the new step in on `normal`; the first step shows at rest.
test('the styles step fades in once it is opened; the first step stands still', async () => {
  const copy = messages.en.today.dailyStyle;
  const withTiming = jest.spyOn(Reanimated, 'withTiming');
  const at = (step: 'dayType' | 'styles') => (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 },
      insets: { top: 59, right: 0, bottom: 34, left: 0 } }}>
      <KuyaraThemeContext.Provider value={lightTheme}>
        <DailyFormalitySheet confirmLabel="Done" error={false} language="en" onChoose={jest.fn()}
          onConfirmStyles={jest.fn()} onDismiss={jest.fn()} onPickStyles={jest.fn()} period="morning"
          step={step} usual="smart" visible />
      </KuyaraThemeContext.Provider>
    </SafeAreaProvider>
  );
  const view = await render(at('dayType'));
  const opacityOf = (node: ReturnType<typeof view.getByTestId>) => StyleSheet.flatten(node.parent!.props.style).opacity;
  expect(opacityOf(view.getByTestId('daily-formality-usual'))).toBe(1);

  withTiming.mockImplementation((toValue) => toValue);
  await view.rerender(at('styles'));
  expect(opacityOf(view.getByTestId('daily-formality-styles-note'))).toBe(0);
  expect(opacityOf(view.getByRole('header', { name: copy.stylesQuestion }))).toBe(0);
  expect(withTiming).toHaveBeenCalledWith(1, { duration: lightTheme.motion.normal, easing: expect.anything() });
  withTiming.mockRestore();
});

// The styles step also asks the day type: the three tiles, the one on screen checked, sit above
// the styles under the re-ask sheet's question, so a Formal day with chosen styles is one answer.
test.each([
  ['morning', 'en'], ['evening', 'en'], ['morning', 'tr'],
] as const)('the %s styles step in %s draws the three day types above the styles', async (period, language) => {
  const onStylesDayType = jest.fn();
  const onChoose = jest.fn();
  const copy = messages[language].today.dailyStyle;
  const view = await render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 },
      insets: { top: 59, right: 0, bottom: 34, left: 0 } }}>
      <KuyaraThemeContext.Provider value={lightTheme}>
        <DailyFormalitySheet confirmLabel="Done" error={false} language={language} onChoose={onChoose}
          onConfirmStyles={jest.fn()} onDismiss={jest.fn()} onPickStyles={jest.fn()}
          onStylesDayType={onStylesDayType} period={period} step="styles" stylesDayType="smart"
          usual="smart" visible />
      </KuyaraThemeContext.Provider>
    </SafeAreaProvider>,
  );

  expect(view.getByTestId('daily-formality-styles-day-type'))
    .toHaveTextContent(period === 'evening' ? copy.questionEvening : copy.question);
  const tiles = view.getAllByRole('radio');
  expect(tiles.map((tile) => tile.props.accessibilityLabel)).toEqual([copy.casual, copy.smart, copy.formal]);
  expect(tiles.map((tile) => tile.props.accessibilityState.selected)).toEqual([false, true, false]);
  expect(view.getAllByTestId(/^daily-formality-(styles-day-type|day-type-choices|styles-note|styles-done)$/)
    .map((node) => node.props.testID)).toEqual([
    'daily-formality-styles-day-type', 'daily-formality-day-type-choices', 'daily-formality-styles-note',
    'daily-formality-styles-done',
  ]);

  await fireEvent.press(view.getByTestId('daily-formality-day-type-formal'));
  expect(onStylesDayType).toHaveBeenCalledWith('formal');
  // A tile on this step only picks; Done writes.
  expect(onChoose).not.toHaveBeenCalled();
});
