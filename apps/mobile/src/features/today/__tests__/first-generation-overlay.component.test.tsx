import { act, fireEvent, render } from '@testing-library/react-native';
import { Alert, StyleSheet } from 'react-native';

import { FirstGenerationOverlay } from '@/features/today/presentation/first-generation-overlay';
import { messages } from '@/localization/messages';
import { lightTheme } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

const onSkip = jest.fn();
const props = {
  active: true,
  completed: false,
  language: 'en' as const,
  phase: 'asking-stylist' as const,
  insight: null,
  onSkip,
};

function overlay(overrides: Partial<typeof props> = {}) {
  return (
    <KuyaraThemeContext.Provider value={lightTheme}>
      <FirstGenerationOverlay {...props} {...overrides} />
    </KuyaraThemeContext.Provider>
  );
}

beforeEach(() => { jest.useFakeTimers(); onSkip.mockClear(); });
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

test('shows after generation starts and fills one, three, then five pieces', async () => {
  const result = await render(overlay({ active: false }));
  expect(result.queryByTestId('first-generation-overlay')).toBeNull();
  await result.rerender(overlay());
  await act(() => jest.advanceTimersByTime(0));
  expect(result.getByTestId('first-generation-overlay')).toBeOnTheScreen();
  const pieceOpacity = (index: number) => StyleSheet.flatten(
    result.getByTestId(`first-generation-board-piece-${index}`, { includeHiddenElements: true }).props.style,
  ).opacity;
  expect(pieceOpacity(0)).toBe(1);
  expect(pieceOpacity(1)).toBe(0.12);
  expect(result.queryByTestId('first-generation-skip')).toBeNull();
  await act(() => jest.advanceTimersByTime(2_000));
  expect(pieceOpacity(2)).toBe(1);
  expect(pieceOpacity(3)).toBe(0.12);
  expect(result.getByTestId('first-generation-line').props.accessibilityLabel)
    .toBe(messages.en.today.phase['asking-stylist']);
  await act(() => jest.advanceTimersByTime(2_000));
  expect(pieceOpacity(4)).toBe(1);
  expect(result.getByTestId('first-generation-line').props.accessibilityLiveRegion).toBe('polite');
});

test('skip appears at ten seconds and uses the native alert roles', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  const result = await render(overlay());
  await act(() => jest.advanceTimersByTime(9_999));
  expect(result.queryByTestId('first-generation-skip')).toBeNull();
  await act(() => jest.advanceTimersByTime(1));
  fireEvent.press(result.getByTestId('first-generation-skip'));
  expect(alert).toHaveBeenCalledTimes(1);
  const buttons = alert.mock.calls[0][2]!;
  expect(buttons[0]).toMatchObject({ text: messages.en.today.loading.keepWaiting, isPreferred: true, style: 'cancel' });
  expect(buttons[1]).toMatchObject({ text: messages.en.today.loading.skipWait, style: 'destructive' });
  buttons[1].onPress?.();
  expect(onSkip).toHaveBeenCalledTimes(1);
  expect(result.getByTestId('first-generation-skip').props.accessibilityRole).toBe('button');
});

test('completion holds the success state for eight tenths of a second', async () => {
  const result = await render(overlay());
  await result.rerender(overlay({ active: false, completed: true }));
  await act(() => jest.advanceTimersByTime(0));
  expect(result.getByTestId('first-generation-success')).toHaveTextContent(messages.en.today.loading.allSet);
  await act(() => jest.advanceTimersByTime(799));
  expect(result.getByTestId('first-generation-overlay')).toBeOnTheScreen();
  await act(() => jest.advanceTimersByTime(1));
  expect(result.queryByTestId('first-generation-overlay')).toBeNull();
});
