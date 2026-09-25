import { act, fireEvent, render } from '@testing-library/react-native';
import { Alert, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { runwayDressingDuration } from '@/components/ui';
import type { RecommendationPhase } from '@/features/recommendation/application/recommendation-application-controller';
import { FirstGenerationRunway, type RunwayOutfit } from '@/features/today/presentation/first-generation-runway';
import { messages } from '@/localization/messages';
import { lightTheme } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

const onSkip = jest.fn();
const chosen: RunwayOutfit = {
  id: 'ai-option',
  pieces: [
    { slot: 'primary_top', garmentTypeId: 't_shirt', category: 'top' },
    { slot: 'bottom', garmentTypeId: 'trousers', category: 'bottom' },
    { slot: 'footwear', garmentTypeId: 'sneakers', category: 'footwear' },
  ],
};
const draftSlots = ['primary_top', 'bottom', 'outer_layer', 'mid_layer', 'footwear'];
const props = {
  active: true,
  completed: false,
  language: 'en' as const,
  phase: 'asking-stylist' as RecommendationPhase | null,
  weather: { condition: 'rain', daypart: 'day' as const, insight: null as string | null },
  outfit: null as RunwayOutfit | null,
  onSkip,
};
const initialMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 59, right: 0, bottom: 34, left: 0 },
};
const copy = messages.en.today.loading;
const dressing = runwayDressingDuration(chosen.pieces.length, lightTheme.motion);

function runway(overrides: Partial<typeof props> = {}) {
  return (
    <KuyaraThemeContext.Provider value={lightTheme}>
      <SafeAreaProvider initialMetrics={initialMetrics}>
        <FirstGenerationRunway {...props} {...overrides} />
      </SafeAreaProvider>
    </KuyaraThemeContext.Provider>
  );
}

type Result = Awaited<ReturnType<typeof render>>;
const hidden = { includeHiddenElements: true };
const progressValue = (result: Result) =>
  result.getByTestId('first-generation-progress').props.accessibilityValue.text;
const drafts = (result: Result) => draftSlots.filter((slot) => result.queryByTestId(`runway-draft-${slot}`, hidden));
const dressed = (result: Result) =>
  [...draftSlots, 'one_piece'].filter((slot) => result.queryByTestId(`runway-dressed-${slot}`, hidden));

async function laidOut(result: Result) {
  await act(() => fireEvent(result.getByTestId('first-generation-stage'), 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width: 358, height: 420 } },
  }));
}

beforeEach(() => { jest.useFakeTimers(); onSkip.mockClear(); });
afterEach(() => { jest.useRealTimers(); jest.restoreAllMocks(); });

test('shows only once a first generation starts, on the field of the day', async () => {
  const result = await render(runway({ active: false }));
  expect(result.queryByTestId('first-generation-runway')).toBeNull();
  await result.rerender(runway());
  await act(() => jest.advanceTimersByTime(0));
  const root = result.getByTestId('first-generation-runway');
  expect(root).toBeOnTheScreen();
  expect(StyleSheet.flatten(root.props.style).backgroundColor).toBe(lightTheme.runway.rain);
});

test('only neutral drafts come on before the answer: five marks, one draft every 1.2 seconds', async () => {
  const result = await render(runway());
  await laidOut(result);
  for (const slot of draftSlots) expect(result.getByTestId(`runway-mark-${slot}`, hidden)).toBeTruthy();
  expect(progressValue(result)).toBe(copy.progress.waiting);

  expect(drafts(result)).toEqual([]);
  await act(() => jest.advanceTimersByTime(599));
  expect(drafts(result)).toEqual([]);
  await act(() => jest.advanceTimersByTime(1));
  expect(drafts(result)).toEqual(['primary_top']);
  await act(() => jest.advanceTimersByTime(1_200));
  expect(drafts(result)).toEqual(['primary_top', 'bottom']);
  await act(() => jest.advanceTimersByTime(1_200 * 3));
  expect(drafts(result)).toEqual(draftSlots);
  // The spoken value never counts the drafts; nothing on the board is the outfit yet.
  expect(progressValue(result)).toBe(copy.progress.waiting);
  expect(dressed(result)).toEqual([]);
});

test('no outfit is drawn until the answer is handed over, whatever the phase says', async () => {
  const result = await render(runway({ phase: 'answer-received' }));
  await laidOut(result);
  await act(() => jest.advanceTimersByTime(8_000));
  expect(dressed(result)).toEqual([]);
  expect(drafts(result)).toEqual(draftSlots);
  expect(result.getByTestId('first-generation-line').props.accessibilityLabel)
    .toBe(messages.en.today.phase['answer-received']);
});

test('the answer dresses the chosen pieces, the extra drafts leave, then All set holds', async () => {
  const result = await render(runway());
  await laidOut(result);
  await act(() => jest.advanceTimersByTime(600 + 1_200 * 4));

  await result.rerender(runway({ active: false, completed: true, phase: null, outfit: chosen }));
  await act(() => jest.advanceTimersByTime(0));
  expect(dressed(result)).toEqual(['primary_top', 'bottom', 'footwear']);
  expect(result.queryByTestId('runway-mark-primary_top', hidden)).toBeNull();
  expect(result.getByTestId('first-generation-line')).toHaveTextContent(copy.chosen);
  expect(progressValue(result)).toBe(copy.progress.dressing);
  expect(result.queryByTestId('first-generation-success')).toBeNull();

  await act(() => jest.advanceTimersByTime(dressing));
  expect(result.getByTestId('first-generation-success')).toHaveTextContent(copy.allSet);
  expect(progressValue(result)).toBe(copy.progress.done);
  expect(result.getByTestId('first-generation-progress').props.accessibilityValue.now).toBe(100);
  await act(() => jest.advanceTimersByTime(799));
  expect(result.getByTestId('first-generation-runway')).toBeOnTheScreen();
  await act(() => jest.advanceTimersByTime(1));
  expect(result.queryByTestId('first-generation-runway')).toBeNull();
});

test('an early answer stops the drafts; the slots that never came on enter dressed', async () => {
  const result = await render(runway());
  await laidOut(result);
  await act(() => jest.advanceTimersByTime(700));
  expect(drafts(result)).toEqual(['primary_top']);

  await result.rerender(runway({ outfit: chosen }));
  await act(() => jest.advanceTimersByTime(5_000));
  // Only the one draft that had come on stays to hand over; no further draft arrives.
  expect(drafts(result)).toEqual(['primary_top']);
  expect(dressed(result)).toEqual(['primary_top', 'bottom', 'footwear']);
});

test('rotates the insight, the phase and the one tip every two seconds', async () => {
  const insight = 'Rain keeps on until 14:00.';
  const result = await render(runway({ weather: { ...props.weather, insight } }));
  expect(result.getByTestId('first-generation-line')).toHaveTextContent(insight);
  await act(() => jest.advanceTimersByTime(2_000));
  expect(result.getByTestId('first-generation-line')).toHaveTextContent(messages.en.today.phase['asking-stylist']);
  await act(() => jest.advanceTimersByTime(2_000));
  expect(result.getByTestId('first-generation-line')).toHaveTextContent(copy.tip);
  expect(result.getByTestId('first-generation-line').props.accessibilityLiveRegion).toBe('polite');
});

test('particles stay inside the board band', async () => {
  const result = await render(runway());
  await laidOut(result);
  const particles = result.getByTestId('first-generation-particles', hidden);
  expect(result.getByTestId('first-generation-stage')).toContainElement(particles);
});

test('skip appears at ten seconds, uses the native alert roles and leaves with the answer', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  const result = await render(runway());
  await laidOut(result);
  await act(() => jest.advanceTimersByTime(9_999));
  expect(result.queryByTestId('first-generation-skip')).toBeNull();
  await act(() => jest.advanceTimersByTime(1));
  await fireEvent.press(result.getByTestId('first-generation-skip'));
  expect(alert).toHaveBeenCalledTimes(1);
  const buttons = alert.mock.calls[0][2]!;
  expect(buttons[0]).toMatchObject({ text: copy.keepWaiting, isPreferred: true, style: 'cancel' });
  expect(buttons[1]).toMatchObject({ text: copy.skipWait, style: 'destructive' });
  buttons[1].onPress?.();
  expect(onSkip).toHaveBeenCalledTimes(1);
  expect(result.getByTestId('first-generation-skip').props.accessibilityRole).toBe('button');

  // Skipping saves the device's pick, which the runway then dresses as the answer.
  await result.rerender(runway({ active: false, completed: true, outfit: chosen }));
  expect(result.queryByTestId('first-generation-skip')).toBeNull();
  expect(dressed(result)).toEqual(['primary_top', 'bottom', 'footwear']);
  await act(() => jest.advanceTimersByTime(dressing + 800));
  expect(result.queryByTestId('first-generation-runway')).toBeNull();
});

test('the runway is an in-screen layer, never a modal over the tab bar', async () => {
  const result = await render(runway());
  // A React Native Modal renders a native modal host, which would sit above the tab bar.
  expect(JSON.stringify(result.toJSON())).not.toContain('ModalHostView');
  const root = result.getByTestId('first-generation-runway');
  expect(StyleSheet.flatten(root.props.style)).toMatchObject({ position: 'absolute', bottom: 0, top: 0 });
});
