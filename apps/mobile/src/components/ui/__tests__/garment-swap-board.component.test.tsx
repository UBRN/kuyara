import { act, fireEvent, render } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { StyleSheet, Text } from 'react-native';
import { State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import * as Reanimated from 'react-native-reanimated';

import { flatLayStack } from '@/components/ui/garment-board/compose-flat-lay';
import { entranceStartBoxes, type GarmentBoardPiece } from '@/components/ui/garment-board/garment-board';
import { haptics } from '@/components/ui/haptics';
import type { GarmentOutfitPalette } from '@/components/ui/garment-board/garment-palette';
import {
  GarmentSwapBoard,
  type GarmentSwapBoardProps,
  type GarmentSwapCandidate,
} from '@/components/ui/garment-board/garment-swap-board';
import { lightTheme, spacing } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

function LightTheme({ children }: PropsWithChildren) {
  return <KuyaraThemeContext.Provider value={lightTheme}>{children}</KuyaraThemeContext.Provider>;
}

const pieces: readonly GarmentBoardPiece[] = [
  { slot: 'one_piece', garmentTypeId: 'dress', category: 'one_piece' },
  { slot: 'footwear', garmentTypeId: 'sandals', category: 'footwear' },
];
const palette: GarmentOutfitPalette = {
  optionId: 'outfit-a', formality: 'casual', temperatureC: 24, condition: 'clear', isNight: false,
  pieces: pieces.map(({ slot, garmentTypeId }) => ({ slot, garmentTypeId })),
};
const footwear: readonly GarmentSwapCandidate[] = (['sneakers', 'sandals', 'closed_shoes'] as const)
  .map((garmentTypeId) => ({ garmentTypeId, category: 'footwear', suitable: true }));

function boardProps(overrides: Partial<GarmentSwapBoardProps> = {}): GarmentSwapBoardProps {
  return {
    pieces,
    palette,
    width: 358,
    candidates: { footwear },
    focusedSlot: null,
    onFocusChange: jest.fn(),
    onStep: jest.fn(),
    restHeight: 400,
    captionRects: {},
    overlay: null,
    labels: {
      pieceName: (id) => id,
      counter: (position, total) => `${position} of ${total}`,
      pieceValue: (piece, position, total) => `${piece}, ${position} of ${total}`,
      done: 'Done',
      otherHint: 'May not suit the weather',
      slotName: (slot) => slot,
      stripShown: 'Choices below',
    },
    entrance: { fromStageColor: lightTheme.colors.background, fromWidth: 358 },
    ...overrides,
  };
}

const flick = (sign: 1 | -1) => fireGestureHandler(getByGestureTestId('garment-swap-board-pan'), [
  { state: State.BEGAN, translationX: 0, velocityX: 0 },
  { state: State.ACTIVE, translationX: 60 * sign, velocityX: 600 * sign },
  { state: State.ACTIVE, translationX: 200 * sign, velocityX: 600 * sign },
  { state: State.END, translationX: 200 * sign, velocityX: 600 * sign },
]);
const withShoes = (garmentTypeId: 'sandals' | 'closed_shoes'): readonly GarmentBoardPiece[] =>
  pieces.map((piece) => (piece.slot === 'footwear' ? { ...piece, garmentTypeId } : piece));

// A second flick that lands before the owner hands back the stepped pieces must not drive the
// piece that is already leaving, nor ask for the same step twice.
test('a second flick before the step has rendered is not a second step', async () => {
  const onStep = jest.fn();
  const result = await render(<GarmentSwapBoard {...boardProps({ onStep })} />, { wrapper: LightTheme });
  await result.rerender(<GarmentSwapBoard {...boardProps({ onStep, focusedSlot: 'footwear' })} />);
  await act(async () => flick(-1));
  expect(onStep).toHaveBeenCalledTimes(1);
  expect(onStep).toHaveBeenLastCalledWith('footwear', 'closed_shoes', true);
  await act(async () => flick(-1));
  expect(onStep).toHaveBeenCalledTimes(1);

  // Once the stepped pieces arrive, the next flick drives the new piece.
  const stepped = withShoes('closed_shoes');
  await result.rerender(<GarmentSwapBoard {...boardProps({
    onStep, focusedSlot: 'footwear', pieces: stepped,
    palette: { ...palette, pieces: stepped.map(({ slot, garmentTypeId }) => ({ slot, garmentTypeId })) },
  })} />);
  await act(async () => flick(1));
  expect(onStep).toHaveBeenCalledTimes(2);
  expect(onStep).toHaveBeenLastCalledWith('footwear', 'sandals', true);
});

// A swiped-away piece fades from the release, as a paged-out piece does: it never slides out
// opaque while the owner has yet to hand back the stepped pieces.
test('a flick fades the piece it steps away from before the step has rendered', async () => {
  const timings = jest.spyOn(Reanimated, 'withTiming');
  const result = await render(<GarmentSwapBoard {...boardProps()} />, { wrapper: LightTheme });
  await result.rerender(<GarmentSwapBoard {...boardProps({ focusedSlot: 'footwear' })} />);
  timings.mockClear();
  await act(async () => flick(-1));
  expect(timings).toHaveBeenCalledWith(0, { duration: lightTheme.motion.fast, easing: expect.anything() });
  timings.mockRestore();
});

// The swipe hint plays on the first enlargement only, while the owner still asks for it. It
// starts one spatial-spring duration after the enlargement, once the growth has landed, and
// the owner hears that it played only then: an enlargement settled or grabbed during the
// wait plays nothing and records nothing, and the next one tries again.
test('the swipe hint records itself as its motion starts, never when cancelled in the wait', async () => {
  jest.useFakeTimers();
  const withSequence = jest.spyOn(Reanimated, 'withSequence');
  const onSwipeHintShown = jest.fn();
  const board = (focusedSlot: 'footwear' | null, swipeHint = true) => (
    <GarmentSwapBoard {...boardProps({ focusedSlot, onSwipeHintShown, swipeHint })} />
  );
  const wait = async (ms: number) => act(async () => { jest.advanceTimersByTime(ms); });
  const { duration } = lightTheme.springs.spatial;
  try {
    const result = await render(board(null), { wrapper: LightTheme });
    await wait(5000);

    // Settled before the wait is over: nothing moves and nothing is recorded.
    await result.rerender(board('footwear'));
    await wait(duration - 1);
    await result.rerender(board(null));
    await wait(duration);
    expect(onSwipeHintShown).not.toHaveBeenCalled();
    expect(withSequence).not.toHaveBeenCalled();

    // A grab during the wait takes the piece: the hint neither plays nor records.
    await result.rerender(board('footwear'));
    await act(async () => {
      getByGestureTestId('garment-swap-board-pan').handlers.onStart?.({ translationX: 0, velocityX: 0 } as never);
    });
    await wait(duration);
    expect(onSwipeHintShown).not.toHaveBeenCalled();
    expect(withSequence).not.toHaveBeenCalled();
    await result.rerender(board(null));

    // The next enlargement waits the growth out, then moves and records once.
    await result.rerender(board('footwear'));
    await wait(duration - 1);
    expect(onSwipeHintShown).not.toHaveBeenCalled();
    await wait(1);
    expect(onSwipeHintShown).toHaveBeenCalledTimes(1);
    expect(withSequence).toHaveBeenCalledTimes(2);

    // Played once, it never plays again in this visit.
    await result.rerender(board(null));
    await result.rerender(board('footwear'));
    await wait(duration * 4);
    expect(onSwipeHintShown).toHaveBeenCalledTimes(1);

    // Leaving the screen during the wait cancels it unrecorded.
    const leaving = jest.fn();
    const unmounted = await render(
      <GarmentSwapBoard {...boardProps({ focusedSlot: null, onSwipeHintShown: leaving, swipeHint: true })} />,
      { wrapper: LightTheme },
    );
    await wait(5000);
    await unmounted.rerender(
      <GarmentSwapBoard {...boardProps({ focusedSlot: 'footwear', onSwipeHintShown: leaving, swipeHint: true })} />,
    );
    await unmounted.unmount();
    await wait(duration * 2);
    expect(leaving).not.toHaveBeenCalled();

    // An owner whose flag is stored never asks for it.
    const stored = jest.fn();
    const done = await render(
      <GarmentSwapBoard {...boardProps({ focusedSlot: null, onSwipeHintShown: stored, swipeHint: false })} />,
      { wrapper: LightTheme },
    );
    await wait(5000);
    await done.rerender(
      <GarmentSwapBoard {...boardProps({ focusedSlot: 'footwear', onSwipeHintShown: stored, swipeHint: false })} />,
    );
    await wait(duration * 2);
    expect(stored).not.toHaveBeenCalled();
  } finally {
    withSequence.mockRestore();
    jest.useRealTimers();
  }
});

const tap = (x: number, y: number) => fireGestureHandler(getByGestureTestId('garment-swap-board-tap'), [
  { state: State.BEGAN, x, y },
  { state: State.ACTIVE, x, y },
  { state: State.END, x, y },
]);

// The owner enlarges a piece only after a render; a second tap on the same piece before that
// render arrives shrinks it instead of asking for the same enlargement again.
test('a quick second tap on the piece just enlarged shrinks it', async () => {
  const onFocusChange = jest.fn();
  // The caption lies below the stage, so a tap on it reaches only the footwear.
  const captionRects = { footwear: { x: 0, y: 1000, w: 100, h: 50 } };
  await render(<GarmentSwapBoard {...boardProps({ onFocusChange, captionRects })} />, { wrapper: LightTheme });
  await act(async () => tap(20, 1020));
  expect(onFocusChange).toHaveBeenLastCalledWith('footwear');
  await act(async () => tap(20, 1020));
  expect(onFocusChange).toHaveBeenCalledTimes(2);
  expect(onFocusChange).toHaveBeenLastCalledWith(null);
});

// When the enlargement moves to another piece while a finger still drags, the rest of that
// drag belongs to the piece it started on: it never moves or steps the newly enlarged piece.
test('a drag that outlives a focus change does not step the newly enlarged piece', async () => {
  const onStep = jest.fn();
  const dresses: readonly GarmentSwapCandidate[] = (['jumpsuit', 'dress', 'knit_dress'] as const)
    .map((garmentTypeId) => ({ garmentTypeId, category: 'one_piece', suitable: true }));
  const candidates = { footwear, one_piece: dresses };
  const result = await render(<GarmentSwapBoard {...boardProps({ onStep, candidates })} />, { wrapper: LightTheme });
  await result.rerender(<GarmentSwapBoard {...boardProps({ onStep, candidates, focusedSlot: 'footwear' })} />);
  const pan = () => getByGestureTestId('garment-swap-board-pan').handlers;
  const move = (translationX: number) => ({ translationX, velocityX: -600 });
  await act(async () => {
    pan().onStart?.(move(0) as never);
    pan().onUpdate?.(move(-60) as never);
  });
  await result.rerender(<GarmentSwapBoard {...boardProps({ onStep, candidates, focusedSlot: 'one_piece' })} />);
  await act(async () => {
    pan().onUpdate?.(move(-200) as never);
    pan().onEnd?.(move(-200) as never, true);
  });
  expect(onStep).not.toHaveBeenCalled();
});

// A drag's slot lasts only from its start to its end: updates and an end that arrive without
// a start of their own (a start that bailed) never move or step the piece.
test('a drag without its own start does not reuse the last drag\'s slot', async () => {
  const onStep = jest.fn();
  const result = await render(<GarmentSwapBoard {...boardProps({ onStep })} />, { wrapper: LightTheme });
  await result.rerender(<GarmentSwapBoard {...boardProps({ onStep, focusedSlot: 'footwear' })} />);
  const pan = () => getByGestureTestId('garment-swap-board-pan').handlers;
  await act(async () => {
    pan().onStart?.({ translationX: 0, velocityX: 0 } as never);
    pan().onUpdate?.({ translationX: -10, velocityX: 0 } as never);
    pan().onEnd?.({ translationX: -10, velocityX: 0 } as never, true);
  });
  expect(onStep).not.toHaveBeenCalled();
  await act(async () => {
    pan().onUpdate?.({ translationX: -200, velocityX: -600 } as never);
    pan().onEnd?.({ translationX: -200, velocityX: -600 } as never, true);
  });
  expect(onStep).not.toHaveBeenCalled();
});

// The captions follow the arrival once it is nine tenths travelled, as Presence's text follows
// its container: they never wait for the arrival spring's overshoot to finish.
test('the captions return as the arrival reaches nine tenths, before its spring has finished', async () => {
  // Springs reach their target without reporting completion, and every reaction is kept.
  const withSpring = jest.spyOn(Reanimated, 'withSpring').mockImplementation((target) => target);
  const reactions: { prepare: () => unknown; react: (value: unknown, previous: unknown) => void }[] = [];
  const useAnimatedReaction = jest.spyOn(Reanimated, 'useAnimatedReaction')
    .mockImplementation(((prepare: () => unknown, react: (value: unknown, previous: unknown) => void) => {
      reactions.push({ prepare, react });
    }) as never);
  const result = await render(
    <GarmentSwapBoard {...boardProps({ overlayTestID: 'captions' })} />,
    { wrapper: LightTheme },
  );
  const opacity = () => StyleSheet.flatten(result.getByTestId('captions', { includeHiddenElements: true }).props.style)
    .opacity;
  expect(opacity()).toBe(0);

  await act(async () => {
    for (const { prepare, react } of reactions.splice(0)) react(prepare(), null);
  });
  expect(opacity()).toBe(1);
  withSpring.mockRestore();
  useAnimatedReaction.mockRestore();
});

// A change that moves pieces hides the captions in the very commit that hands the board the
// new pieces or the focus: none is drawn over a moving piece, none is renamed before its piece
// changes, and they stay laid out so the plate keeps their height.
test('a change that moves pieces hides the captions in the commit that renames them', async () => {
  const props = (garmentTypeId: 'sandals' | 'closed_shoes', focusedSlot: 'footwear' | null = null) => {
    const shoes = withShoes(garmentTypeId);
    return boardProps({
      focusedSlot,
      overlay: <Text>{garmentTypeId}</Text>,
      overlayTestID: 'captions',
      pieces: shoes,
      palette: { ...palette, pieces: shoes.map(({ slot, garmentTypeId: id }) => ({ slot, garmentTypeId: id })) },
    });
  };
  const words = (result: Awaited<ReturnType<typeof render>>) => {
    const [wrapper] = result.getAllByTestId('captions', { includeHiddenElements: true }).at(-1)!.children;
    return wrapper as Exclude<typeof wrapper, string>;
  };
  const opacityOf = (result: Awaited<ReturnType<typeof render>>) =>
    StyleSheet.flatten(words(result).props.style).opacity ?? 1;
  const result = await render(<GarmentSwapBoard {...props('sandals')} />, { wrapper: LightTheme });
  expect(opacityOf(result)).toBe(1);
  expect(words(result)).toHaveTextContent('sandals', { exact: true });

  // The pieces are still moving: their springs have not landed.
  const withSpring = jest.spyOn(Reanimated, 'withSpring').mockImplementation((target) => target);
  await result.rerender(<GarmentSwapBoard {...props('closed_shoes')} />);
  expect(words(result)).toHaveTextContent('closed_shoes', { exact: true });
  expect(opacityOf(result)).toBe(0);
  withSpring.mockRestore();

  // An enlargement hides them the same way.
  const enlarged = await render(<GarmentSwapBoard {...props('sandals')} />, { wrapper: LightTheme });
  await enlarged.rerender(<GarmentSwapBoard {...props('sandals', 'footwear')} />);
  expect(opacityOf(enlarged)).toBe(0);
});

// A re-laid-out piece's new place or size reaches the screen a frame before its motion does;
// drawn from React, a piece that stayed showed for a frame where it was going (the lower pieces
// after a far strip tile). A move lives only in the transform, so React draws nothing new for
// it; a piece drawn at a new size gets a fresh view, whose first frame starts where it stands.
test('a re-layout draws no frame of a piece at its new place before it travels there', async () => {
  const look = (top: 'turtleneck' | 'sleeveless_top'): readonly GarmentBoardPiece[] => [
    { slot: 'primary_top', garmentTypeId: top, category: 'top' },
    { slot: 'outer_layer', garmentTypeId: 'parka', category: 'outerwear' },
    { slot: 'bottom', garmentTypeId: 'jeans', category: 'bottom' },
    { slot: 'footwear', garmentTypeId: 'weather_boots', category: 'footwear' },
  ];
  const tops: readonly GarmentSwapCandidate[] = (['sleeveless_top', 'sweater', 'turtleneck'] as const)
    .map((garmentTypeId) => ({ garmentTypeId, category: 'top', suitable: true }));
  const props = (top: 'turtleneck' | 'sleeveless_top') => {
    const next = look(top);
    return boardProps({
      candidates: { primary_top: tops },
      pieces: next,
      palette: { ...palette, pieces: next.map(({ slot, garmentTypeId }) => ({ slot, garmentTypeId })) },
    });
  };
  const result = await render(<GarmentSwapBoard {...props('turtleneck')} />, { wrapper: LightTheme });
  const drawing = (id: string) => result.getByTestId(`garment-swap-board-drawing-${id}`);
  const frameOf = (view: ReturnType<typeof drawing>) => {
    const [free] = view.children as ReturnType<typeof drawing>[];
    const [piece] = free.children as ReturnType<typeof drawing>[];
    const { left, top, width, height } = StyleSheet.flatten(piece.props.style);
    return { left, top, width, height };
  };
  const jeans = drawing('bottom-jeans');
  const parka = drawing('outer_layer-parka');
  const parkaFrame = frameOf(parka);
  expect(parkaFrame).toMatchObject({ left: 0, top: 0 });

  await result.rerender(<GarmentSwapBoard {...props('sleeveless_top')} />);
  // The parka only moves: the same view, the same frame to a hundredth of a point; its
  // transform carries the travel.
  expect(drawing('outer_layer-parka')).toBe(parka);
  expect(frameOf(drawing('outer_layer-parka'))).toEqual({
    left: 0, top: 0, width: expect.closeTo(parkaFrame.width, 2), height: expect.closeTo(parkaFrame.height, 2),
  });
  // The jeans are drawn larger: a fresh view at the new size.
  expect(frameOf(drawing('bottom-jeans')).height).not.toBe(frameOf(jeans).height);
  expect(drawing('bottom-jeans')).not.toBe(jeans);
});

// Law 8: half a step toward a candidate is a threshold under the finger, so each crossing
// toward one ticks once; a drag that stays short of it, or draws back, does not.
test('a swipe ticks once each time it crosses half a step toward a candidate', async () => {
  const selection = jest.spyOn(haptics, 'selection').mockImplementation(() => undefined);
  try {
    const result = await render(<GarmentSwapBoard {...boardProps()} />, { wrapper: LightTheme });
    await result.rerender(<GarmentSwapBoard {...boardProps({ focusedSlot: 'footwear' })} />);
    const pan = () => getByGestureTestId('garment-swap-board-pan').handlers;
    const move = (translationX: number) => ({ translationX, velocityX: 0 });
    // One drag in one act: the test mock rebuilds shared values on every render.
    const drag = async (path: readonly number[]) => act(async () => {
      const handlers = pan();
      handlers.onStart?.(move(0) as never);
      for (const x of path) handlers.onUpdate?.(move(x) as never);
      handlers.onEnd?.(move(0) as never, false);
    });
    // Short of half a step either way: no tick.
    await drag([-10, -30, 10, 30]);
    expect(selection).not.toHaveBeenCalled();
    // Across, staying across, back short of it and across again: two ticks.
    await drag([-10, -200, -210, -10, -200]);
    expect(selection).toHaveBeenCalledTimes(2);
  } finally {
    selection.mockRestore();
  }
});

// Law 7's dressing: on any change the piece taken off lifts away as it fades on `fast`, and
// the one put on is hung on from that height and lands on the arrival spring; one the finger
// already carried in catches its weight with the moment's settle instead.
test('a change lifts the old piece off and hangs the new one on', async () => {
  const timings = jest.spyOn(Reanimated, 'withTiming');
  const springs = jest.spyOn(Reanimated, 'withSpring');
  const sequences = jest.spyOn(Reanimated, 'withSequence');
  const { fast } = lightTheme.motion;
  const { arrival } = lightTheme.springs;
  const stepped = (garmentTypeId: 'sandals' | 'closed_shoes', focusedSlot: 'footwear' | null) => {
    const shoes = withShoes(garmentTypeId);
    return boardProps({
      focusedSlot,
      pieces: shoes,
      palette: { ...palette, pieces: shoes.map(({ slot, garmentTypeId: id }) => ({ slot, garmentTypeId: id })) },
    });
  };
  try {
    // A tile or the picker: lifted off, hung on.
    const result = await render(<GarmentSwapBoard {...stepped('sandals', null)} />, { wrapper: LightTheme });
    timings.mockClear();
    springs.mockClear();
    sequences.mockClear();
    await result.rerender(<GarmentSwapBoard {...stepped('closed_shoes', null)} />);
    expect(timings).toHaveBeenCalledWith(-spacing.lg, { duration: fast });
    expect(springs).toHaveBeenCalledWith(0, arrival, expect.any(Function));
    expect(sequences).not.toHaveBeenCalled();

    // A swipe: the piece swiped away lifts from the release; the one carried in catches.
    const swiped = await render(<GarmentSwapBoard {...stepped('sandals', 'footwear')} />, { wrapper: LightTheme });
    timings.mockClear();
    sequences.mockClear();
    await act(async () => flick(-1));
    expect(timings).toHaveBeenCalledWith(-spacing.lg, { duration: fast });
    await swiped.rerender(<GarmentSwapBoard {...stepped('closed_shoes', 'footwear')} />);
    expect(sequences).toHaveBeenCalledTimes(1);
    expect(timings).toHaveBeenCalledWith(spacing.xs, { duration: fast });
  } finally {
    timings.mockRestore();
    springs.mockRestore();
    sequences.mockRestore();
  }
});

// A layer the reader can take off: its enlarged strip header carries "Take off" beside Done.
const layered = (outer: 'light_jacket' | 'parka' | null): readonly GarmentBoardPiece[] => [
  { slot: 'primary_top', garmentTypeId: 'shirt', category: 'top' },
  ...(outer ? [{ slot: 'outer_layer', garmentTypeId: outer, category: 'outerwear' } as const] : []),
  { slot: 'bottom', garmentTypeId: 'jeans', category: 'bottom' },
  { slot: 'footwear', garmentTypeId: 'sneakers', category: 'footwear' },
];
const outerCandidates: readonly GarmentSwapCandidate[] = (['light_jacket', 'parka'] as const)
  .map((garmentTypeId) => ({ garmentTypeId, category: 'outerwear', suitable: true }));
const layeredProps = (outer: 'light_jacket' | 'parka' | null, overrides: Partial<GarmentSwapBoardProps> = {}) => {
  const worn = layered(outer);
  return boardProps({
    pieces: worn,
    palette: { ...palette, pieces: worn.map(({ slot, garmentTypeId }) => ({ slot, garmentTypeId })) },
    candidates: outer ? { outer_layer: outerCandidates, footwear } : { footwear },
    takeOffSlots: ['mid_layer', 'outer_layer'],
    labels: {
      ...boardProps().labels,
      takeOff: 'Take off',
      takeOffAccessibilityLabel: (slot) => `Take the ${slot} off`,
    },
    ...overrides,
  });
};

test('an enlarged layer offers Take off in its strip header and as an action on its piece', async () => {
  const onTakeOff = jest.fn();
  const result = await render(<GarmentSwapBoard {...layeredProps('light_jacket', { onTakeOff })} />,
    { wrapper: LightTheme });
  const piece = result.getByTestId('garment-swap-board-piece-outer_layer');
  expect(piece.props.accessibilityActions).toContainEqual({ name: 'takeOff', label: 'Take the outer_layer off' });
  expect(result.getByTestId('garment-swap-board-piece-footwear').props.accessibilityActions
    .some(({ name }: { name: string }) => name === 'takeOff')).toBe(false);
  await act(async () => piece.props.onAccessibilityAction({ nativeEvent: { actionName: 'takeOff' } }));
  expect(onTakeOff).toHaveBeenLastCalledWith('outer_layer');

  await result.rerender(<GarmentSwapBoard {...layeredProps('light_jacket', { onTakeOff, focusedSlot: 'outer_layer' })} />);
  const takeOff = result.getByTestId('garment-swap-board-strip-take-off');
  expect(takeOff).toHaveProp('accessibilityLabel', 'Take the outer_layer off');
  expect(result.getByTestId('garment-swap-board-strip-done')).toBeOnTheScreen();
  await fireEvent.press(takeOff);
  expect(onTakeOff).toHaveBeenCalledTimes(2);

  // Footwear can never be taken off: its strip has Done alone.
  await result.rerender(<GarmentSwapBoard {...layeredProps('light_jacket', { onTakeOff, focusedSlot: 'footwear' })} />);
  expect(result.queryByTestId('garment-swap-board-strip-take-off')).toBeNull();
});

// The frame that mounts a take-off can reach the screen after most of a `fast` fade has run on
// the wall clock; the lift and the fade advance per drawn frame, so the piece is seen leaving.
test('a layer taken off lifts and fades in place, and an added one is hung on from unseen', async () => {
  const timings = jest.spyOn(Reanimated, 'withTiming');
  const springs = jest.spyOn(Reanimated, 'withSpring');
  const paced = jest.mocked(Reanimated.defineAnimation);
  const { fast } = lightTheme.motion;
  try {
    const result = await render(<GarmentSwapBoard {...layeredProps('light_jacket')} />, { wrapper: LightTheme });
    timings.mockClear();
    springs.mockClear();
    paced.mockClear();
    await result.rerender(<GarmentSwapBoard {...layeredProps(null)} />);
    expect(timings).toHaveBeenCalledWith(-spacing.lg, { duration: fast });
    // The mock's timing stands for its target: the lift and the fade are each paced.
    expect(paced.mock.calls.map(([starting]) => starting)).toEqual([-spacing.lg, 0]);
    // Nothing slides sideways: the only springs are the pieces that stay gliding to their boxes.
    expect(springs.mock.calls.map(([target]) => target).filter((target) => target !== 1)).toEqual([]);
    expect(result.queryByTestId('garment-swap-board-piece-outer_layer')).toBeNull();
    expect(result.queryByTestId('garment-swap-board-strip')).toBeNull();

    springs.mockClear();
    await result.rerender(<GarmentSwapBoard {...layeredProps('parka')} />);
    expect(springs).toHaveBeenCalledWith(0, lightTheme.springs.arrival, expect.any(Function));
    expect(result.getByTestId('garment-swap-board-piece-outer_layer')).toBeOnTheScreen();
  } finally {
    timings.mockRestore();
    springs.mockRestore();
  }
});

// ADR 0026 section 7: the detail's pieces leave from exactly what Today's band drew, the band's
// own fit at its own width, square, and stacked as the band stacks them, so the first frame of
// the entrance is the band's picture.
test.each([393, 440])('the entrance starts from Today\'s band as drawn on a %i-point screen', async (screen) => {
  const rainySmart: readonly GarmentBoardPiece[] = [
    { slot: 'primary_top', garmentTypeId: 'shirt', category: 'top' },
    { slot: 'bottom', garmentTypeId: 'trousers', category: 'bottom' },
    { slot: 'mid_layer', garmentTypeId: 'sweater', category: 'top' },
    { slot: 'outer_layer', garmentTypeId: 'rain_jacket', category: 'outerwear' },
    { slot: 'footwear', garmentTypeId: 'ankle_boots', category: 'footwear' },
  ];
  // Today's band reaches both screen edges; the detail's board stands inside the gutters.
  const width = screen - 2 * spacing.lg;
  const held = jest.spyOn(Reanimated, 'withSpring').mockImplementation(((_to: number) => 0) as never);
  try {
    const result = await render(<GarmentSwapBoard {...boardProps({
      width,
      pieces: rainySmart,
      candidates: {},
      palette: { ...palette, pieces: rainySmart.map(({ slot, garmentTypeId }) => ({ slot, garmentTypeId })) },
      entrance: { fromStageColor: lightTheme.atmosphere.fallingDay, fromWidth: screen },
    })} />, { wrapper: LightTheme });

    const band = entranceStartBoxes(rainySmart, screen, 'today', true);
    const drawings = result.getAllByTestId(/^garment-swap-board-drawing-/);
    expect(drawings.map((node) => String(node.props.testID).split('-').at(-2)))
      .toEqual(flatLayStack.filter((slot) => rainySmart.some((piece) => piece.slot === slot)));
    for (const piece of rainySmart) {
      const drawing = result.getByTestId(`garment-swap-board-drawing-${piece.slot}-${piece.garmentTypeId}`);
      const [free] = drawing.children as (typeof drawing)[];
      const [view] = free.children as (typeof drawing)[];
      const style = StyleSheet.flatten(view.props.style);
      const [{ translateX }, { translateY }, { scaleX }, { scaleY }] = style.transform;
      const w = scaleX * style.width;
      const h = scaleY * style.height;
      const today = band.get(piece.slot)!;
      expect({
        x: translateX + style.width / 2 - w / 2,
        y: translateY + style.height / 2 - h / 2,
        w,
        h,
      }).toEqual({
        x: expect.closeTo(today.x * screen - spacing.lg, 3),
        y: expect.closeTo(today.y * screen, 3),
        w: expect.closeTo(today.w * screen, 3),
        h: expect.closeTo(today.h * screen, 3),
      });
    }
    // The band is cornerless, and so is the tint the entrance fades from.
    const [tint] = result.getByTestId('garment-swap-board-plate').children as (typeof drawings)[number][];
    expect(StyleSheet.flatten(tint.props.style)).toMatchObject({ height: expect.any(Number) });
    expect(StyleSheet.flatten(tint.props.style).borderRadius ?? 0).toBe(0);
  } finally {
    held.mockRestore();
  }
});
