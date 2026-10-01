import { act, render } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';

import type { GarmentBoardPiece } from '@/components/ui/garment-board/garment-board';
import type { GarmentOutfitPalette } from '@/components/ui/garment-board/garment-palette';
import {
  GarmentSwapBoard,
  type GarmentSwapBoardProps,
  type GarmentSwapCandidate,
} from '@/components/ui/garment-board/garment-swap-board';
import { lightTheme } from '@/theme/theme';
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
    entrance: { fromStageColor: lightTheme.colors.background, fromStageRadius: 0 },
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
