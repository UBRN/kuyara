import { act, fireEvent, render } from '@testing-library/react-native';
import { Alert, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { FirstGenerationRunway, type RunwayOutfit } from '@/features/today/presentation/first-generation-runway';
import { messages } from '@/localization/messages';
import { lightTheme } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

const onSkip = jest.fn();
const preview: RunwayOutfit = {
  id: 'preview-option',
  pieces: [
    { slot: 'primary_top', garmentTypeId: 't_shirt', category: 'top' },
    { slot: 'bottom', garmentTypeId: 'trousers', category: 'bottom' },
    { slot: 'footwear', garmentTypeId: 'sneakers', category: 'footwear' },
  ],
};
const props = {
  active: true,
  completed: false,
  language: 'en' as const,
  phase: 'asking-stylist' as const,
  weather: { atmosphere: 'veiledDay' as const, condition: 'cloudy', daypart: 'day' as const, insight: null as string | null },
  outfit: preview as RunwayOutfit | null,
  onSkip,
};
const initialMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 59, right: 0, bottom: 34, left: 0 },
};
const copy = messages.en.today.loading;

function runway(overrides: Partial<typeof props> = {}) {
  return (
    <KuyaraThemeContext.Provider value={lightTheme}>
      <SafeAreaProvider initialMetrics={initialMetrics}>
        <FirstGenerationRunway {...props} {...overrides} />
      </SafeAreaProvider>
    </KuyaraThemeContext.Provider>
  );
}

const progressValue = (result: Awaited<ReturnType<typeof render>>) =>
  result.getByTestId('first-generation-progress').props.accessibilityValue.text;
const pieceOpacity = (result: Awaited<ReturnType<typeof render>>, slot: string) => StyleSheet.flatten(
  result.getByTestId(`runway-piece-${slot}`, { includeHiddenElements: true }).props.style,
).opacity;

async function laidOut(result: Awaited<ReturnType<typeof render>>) {
  await act(() => fireEvent(result.getByTestId('first-generation-stage'), 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width: 358, height: 420 } },
  }));
}

beforeEach(() => { jest.useFakeTimers(); onSkip.mockClear(); });
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

test('shows only once a first generation starts and places one piece every 1.2 seconds', async () => {
  const result = await render(runway({ active: false }));
  expect(result.queryByTestId('first-generation-runway')).toBeNull();
  await result.rerender(runway());
  await act(() => jest.advanceTimersByTime(0));
  expect(result.getByTestId('first-generation-runway')).toBeOnTheScreen();
  await laidOut(result);

  expect(progressValue(result)).toBe(copy.progress[0]);
  expect(pieceOpacity(result, 'primary_top')).toBe(0);
  expect(result.getByTestId('runway-mark-primary_top', { includeHiddenElements: true })).toBeTruthy();
  await act(() => jest.advanceTimersByTime(1_200));
  expect(progressValue(result)).toBe(copy.progress[1]);
  expect(pieceOpacity(result, 'primary_top')).toBe(1);
  expect(pieceOpacity(result, 'bottom')).toBe(0);
  await act(() => jest.advanceTimersByTime(2_400));
  expect(progressValue(result)).toBe(copy.progressComplete);
  expect(result.getByTestId('first-generation-progress').props.accessibilityRole).toBe('progressbar');
  expect(result.getByTestId('first-generation-line').props.accessibilityLabel)
    .toBe(messages.en.today.phase['asking-stylist']);
  expect(result.getByTestId('first-generation-line').props.accessibilityLiveRegion).toBe('polite');
});

test('rotates the insight, the phase and the one tip every two seconds', async () => {
  const insight = 'Clouds stay overhead all day.';
  const result = await render(runway({ weather: { ...props.weather, insight } }));
  expect(result.getByTestId('first-generation-line')).toHaveTextContent(insight);
  await act(() => jest.advanceTimersByTime(2_000));
  expect(result.getByTestId('first-generation-line')).toHaveTextContent(messages.en.today.phase['asking-stylist']);
  await act(() => jest.advanceTimersByTime(2_000));
  expect(result.getByTestId('first-generation-line')).toHaveTextContent(copy.tip);
});

test('particles stay inside the board band', async () => {
  const result = await render(runway());
  await laidOut(result);
  const particles = result.getByTestId('first-generation-particles', { includeHiddenElements: true });
  expect(result.getByTestId('first-generation-stage')).toContainElement(particles);
});

test('skip appears at ten seconds and uses the native alert roles', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  const result = await render(runway());
  await act(() => jest.advanceTimersByTime(9_999));
  expect(result.queryByTestId('first-generation-skip')).toBeNull();
  await act(() => jest.advanceTimersByTime(1));
  fireEvent.press(result.getByTestId('first-generation-skip'));
  expect(alert).toHaveBeenCalledTimes(1);
  const buttons = alert.mock.calls[0][2]!;
  expect(buttons[0]).toMatchObject({ text: copy.keepWaiting, isPreferred: true, style: 'cancel' });
  expect(buttons[1]).toMatchObject({ text: copy.skipWait, style: 'destructive' });
  buttons[1].onPress?.();
  expect(onSkip).toHaveBeenCalledTimes(1);
  expect(result.getByTestId('first-generation-skip').props.accessibilityRole).toBe('button');
});

test('completion lands every piece and holds All set for eight tenths of a second', async () => {
  const result = await render(runway());
  await laidOut(result);
  await result.rerender(runway({ active: false, completed: true }));
  await act(() => jest.advanceTimersByTime(0));
  expect(result.getByTestId('first-generation-success')).toHaveTextContent(copy.allSet);
  expect(progressValue(result)).toBe(copy.progressComplete);
  expect(pieceOpacity(result, 'footwear')).toBe(1);
  await act(() => jest.advanceTimersByTime(799));
  expect(result.getByTestId('first-generation-runway')).toBeOnTheScreen();
  await act(() => jest.advanceTimersByTime(1));
  expect(result.queryByTestId('first-generation-runway')).toBeNull();
});

test('a different chosen outfit replaces the preview pieces on the board', async () => {
  const result = await render(runway());
  await laidOut(result);
  await result.rerender(runway({
    active: false,
    completed: true,
    outfit: { id: 'ai-option', pieces: [...preview.pieces, { slot: 'outer_layer', garmentTypeId: 'light_jacket', category: 'outerwear' }] },
  }));
  await act(() => jest.advanceTimersByTime(0));
  expect(pieceOpacity(result, 'outer_layer')).toBe(1);
  expect(pieceOpacity(result, 'primary_top')).toBe(1);
});

test('the runway is an in-screen layer, never a modal over the tab bar', async () => {
  const result = await render(runway());
  // A React Native Modal renders a native modal host, which would sit above the tab bar.
  expect(JSON.stringify(result.toJSON())).not.toContain('ModalHostView');
  const root = result.getByTestId('first-generation-runway');
  expect(StyleSheet.flatten(root.props.style)).toMatchObject({ position: 'absolute', bottom: 0, top: 0 });
});
