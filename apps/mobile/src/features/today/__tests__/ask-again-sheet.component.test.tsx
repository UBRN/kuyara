import { fireEvent, render } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AskAgainSheet } from '@/features/today/presentation/ask-again-sheet';
import { messages, type SupportedLanguage } from '@/localization/messages';
import { lightTheme } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

jest.mock('@expo/ui/swift-ui', () => jest.requireActual('@/components/ui/__tests__/expo-ui-test-mock'));
jest.mock('@expo/ui/swift-ui/modifiers', () =>
  jest.requireActual('@/components/ui/__tests__/expo-ui-test-mock'));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('@expo/ui/community/bottom-sheet', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  return { BottomSheet: ({ children, index, snapPoints }: {
    children: React.ReactNode; index: number; snapPoints: readonly string[];
  }) => index >= 0 ? React.createElement(View, { testID: 'sheet-detents', snapPoints } as object, children) : null };
});
// The native controls are tested in their own wrappers; here they are plain buttons, which
// also keeps the native dependency's name out of `features/`.
jest.mock('@/components/ui/segmented-control', () => {
  const { Pressable: MockPressable, Text: MockText, View: MockView } = jest.requireActual('react-native');
  return {
    SegmentedControl: ({ onChange, options, testID, value }: Readonly<{
      onChange: (value: string) => void;
      options: readonly Readonly<{ label: string; value: string }>[];
      testID?: string;
      value: string;
    }>) => (
      <MockView testID={testID}>
        {options.map((option) => (
          <MockPressable accessibilityState={{ selected: option.value === value }} key={option.value}
            onPress={() => onChange(option.value)} testID={`${testID}-${option.value}`}>
            <MockText>{option.label}</MockText>
          </MockPressable>
        ))}
      </MockView>
    ),
  };
});
jest.mock('@/components/ui/native-wheel-picker', () => {
  const { Pressable: MockPressable, Text: MockText, View: MockView } = jest.requireActual('react-native');
  return {
    NativeWheelPicker: ({ label, onSelectionChange, options, selection, testID }: Readonly<{
      label: string;
      onSelectionChange: (value: string) => void;
      options: readonly Readonly<{ label: string; value: string }>[];
      selection: string;
      testID?: string;
    }>) => (
      <MockView accessibilityLabel={label} accessibilityValue={{ text: selection }} testID={testID}>
        {options.map((option) => (
          <MockPressable key={option.value} onPress={() => onSelectionChange(option.value)}
            testID={`${testID}-${option.label}`}>
            <MockText>{option.label}</MockText>
          </MockPressable>
        ))}
      </MockView>
    ),
  };
});

// 16:02 on Thursday 24 September 2026 in Istanbul.
const now = Date.parse('2026-09-24T13:02:00.000Z');
const timeZone = 'Europe/Istanbul';

function sheet(language: SupportedLanguage, props: Partial<Parameters<typeof AskAgainSheet>[0]> = {}) {
  return (
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 },
      insets: { top: 59, right: 0, bottom: 34, left: 0 } }}>
      <KuyaraThemeContext.Provider value={lightTheme}>
        <AskAgainSheet busy={false} error={false} evening={false} hour12={false} language={language}
          now={now} onConfirm={jest.fn()} onDismiss={jest.fn()} selected="smart" timeZone={timeZone}
          visible {...props} />
      </KuyaraThemeContext.Provider>
    </SafeAreaProvider>
  );
}

describe.each(['en', 'tr'] as const)('%s re-ask sheet', (language) => {
  const copy = messages[language].today;

  test('opens large with the day type in force checked and Now chosen', async () => {
    const view = await render(sheet(language));
    expect(view.getByTestId('sheet-detents').props.snapPoints).toEqual(['100%']);
    expect(view.getByText(copy.dailyStyle.question)).toBeOnTheScreen();
    expect(view.getAllByRole('radio').map((tile) => tile.props.accessibilityState.selected))
      .toEqual([false, true, false]);
    expect(view.getByText(copy.askAgain.whenQuestion)).toBeOnTheScreen();
    expect(view.queryByTestId('ask-again-departure')).toBeNull();
    expect(view.getByTestId('ask-again-warning'))
      .toHaveTextContent(copy.askAgain.warning('16:00', '22:00'));
    expect(view.getByTestId('ask-again-confirm')).toHaveTextContent(copy.askAgain.chooseNow);
  });

  test('Later reveals the wheel, and the label and warning follow the picked time', async () => {
    const onConfirm = jest.fn();
    const view = await render(sheet(language, { onConfirm }));
    await fireEvent.press(view.getByTestId('ask-again-when-later'));
    expect(view.getByTestId('ask-again-departure')).toBeOnTheScreen();
    // The wheel is named by the question it answers, the heading drawn above it.
    expect(view.getByTestId('ask-again-departure').props.accessibilityLabel).toBe(copy.askAgain.whenQuestion);
    // The wheel opens about an hour ahead.
    expect(view.getByTestId('ask-again-confirm')).toHaveTextContent(copy.askAgain.chooseAt('17:15'));
    await fireEvent.press(view.getByTestId('ask-again-departure-18:00'));
    expect(view.getByTestId('ask-again-confirm')).toHaveTextContent(copy.askAgain.chooseAt('18:00'));
    expect(view.getByTestId('ask-again-warning'))
      .toHaveTextContent(copy.askAgain.warning('18:00', '01:00'));
    await fireEvent.press(view.getByTestId('ask-again-day-type-formal'));
    await fireEvent.press(view.getByTestId('ask-again-confirm'));
    expect(onConfirm).toHaveBeenCalledWith({ formality: 'formal', departureAt: '2026-09-24T15:00:00.000Z' });
  });

  test('a departure after midnight names its day in the warning', async () => {
    const view = await render(sheet(language));
    await fireEvent.press(view.getByTestId('ask-again-when-later'));
    await fireEvent.press(view.getByTestId('ask-again-departure-01:00'));
    expect(view.getByTestId('ask-again-warning')).toHaveTextContent(copy.askAgain.warningOnDay(
      language === 'en' ? 'Friday 25 September' : '25 Eylül Cuma', '01:00', '04:00'));
  });

  test('Now confirms with no departure, and the close button only dismisses', async () => {
    const onConfirm = jest.fn();
    const onDismiss = jest.fn();
    const view = await render(sheet(language, { onConfirm, onDismiss, evening: true }));
    expect(view.getByText(copy.dailyStyle.questionEvening)).toBeOnTheScreen();
    await fireEvent.press(view.getByTestId('ask-again-close'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
    await fireEvent.press(view.getByTestId('ask-again-confirm'));
    expect(onConfirm).toHaveBeenCalledWith({ formality: 'smart', departureAt: null });
  });

  test('while busy the confirmation is marked busy and ignores presses', async () => {
    const onConfirm = jest.fn();
    const view = await render(sheet(language, { busy: true, onConfirm }));
    const confirm = view.getByTestId('ask-again-confirm');
    expect(confirm.props.accessibilityState).toMatchObject({ busy: true });
    await fireEvent.press(confirm);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  test('a persisted departure still ahead reopens as Later at that time', async () => {
    const onConfirm = jest.fn();
    const view = await render(sheet(language, { departure: '2026-09-24T20:30:00.000Z', onConfirm }));
    expect(view.getByTestId('ask-again-when-later').props.accessibilityState.selected).toBe(true);
    expect(view.getByTestId('ask-again-departure').props.accessibilityValue.text)
      .toBe('2026-09-24T20:30:00.000Z');
    expect(view.getByTestId('ask-again-confirm')).toHaveTextContent(copy.askAgain.chooseAt('23:30'));
    await fireEvent.press(view.getByTestId('ask-again-confirm'));
    expect(onConfirm).toHaveBeenCalledWith({ formality: 'smart', departureAt: '2026-09-24T20:30:00.000Z' });
  });

  test('a past or absent departure opens on Now, also on a reopening', async () => {
    const view = await render(sheet(language, { departure: '2026-09-24T12:30:00.000Z' }));
    expect(view.getByTestId('ask-again-when-now').props.accessibilityState.selected).toBe(true);
    expect(view.queryByTestId('ask-again-departure')).toBeNull();
    expect(view.getByTestId('ask-again-confirm')).toHaveTextContent(copy.askAgain.chooseNow);
    await view.rerender(sheet(language, { visible: false, departure: '2026-09-24T20:30:00.000Z' }));
    await view.rerender(sheet(language, { departure: '2026-09-24T20:30:00.000Z' }));
    expect(view.getByTestId('ask-again-confirm')).toHaveTextContent(copy.askAgain.chooseAt('23:30'));
    await view.rerender(sheet(language, { visible: false, departure: null }));
    await view.rerender(sheet(language, { departure: null }));
    expect(view.getByTestId('ask-again-confirm')).toHaveTextContent(copy.askAgain.chooseNow);
  });

  test('a failed save says so and keeps the sheet', async () => {
    const view = await render(sheet(language, { error: true }));
    expect(view.getByTestId('ask-again-error')).toHaveTextContent(copy.dailyStyle.saveError);
    expect(view.getByTestId('ask-again-confirm')).toBeOnTheScreen();
  });
});

test('a failed re-ask is spoken to VoiceOver once, not on mount without an error', async () => {
  const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
  announce.mockClear();
  const screen = await render(sheet('en'));
  expect(announce).not.toHaveBeenCalled();
  await screen.rerender(sheet('en', { error: true }));
  expect(announce).toHaveBeenCalledTimes(1);
  expect(announce).toHaveBeenCalledWith(messages.en.today.dailyStyle.saveError);
  await screen.rerender(sheet('en', { error: true, busy: false }));
  expect(announce).toHaveBeenCalledTimes(1);
  announce.mockRestore();
});
