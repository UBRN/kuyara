import { render } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { StyleSheet } from 'react-native';

import { GarmentBoard, measureGarmentBoardHeight, type GarmentBoardPiece } from '@/components/ui/garment-board/garment-board';
import { createKuyaraTheme, lightTheme, spacing } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

function LightTheme({ children }: PropsWithChildren) {
  return <KuyaraThemeContext.Provider value={lightTheme}>{children}</KuyaraThemeContext.Provider>;
}

const reducedMotionTheme = createKuyaraTheme('light', true);

function ReducedMotionTheme({ children }: PropsWithChildren) {
  return (
    <KuyaraThemeContext.Provider value={reducedMotionTheme}>
      {children}
    </KuyaraThemeContext.Provider>
  );
}

const pieces: readonly GarmentBoardPiece[] = [
  { slot: 'one_piece', garmentTypeId: 'dress', category: 'one_piece' },
  { slot: 'footwear', garmentTypeId: 'sandals', category: 'footwear' },
];

test('the board is one accessible image and its measured height matches its SVG', async () => {
  const result = await render(<GarmentBoard pieces={pieces} width={349} preset="today" accessibilityLabel="Dress, sandals" testID="board" />, { wrapper: LightTheme });
  const board = result.getByRole('image', { name: 'Dress, sandals' });
  expect(result.getAllByRole('image')).toHaveLength(1);
  expect(board).toHaveProp('testID', 'board');
  expect(board).toHaveProp('width', 349);
  expect(board).toHaveProp('height', measureGarmentBoardHeight(pieces, 349, 'today'));
});

test('detail uses the same pieces with its own measured height', async () => {
  const result = await render(<GarmentBoard pieces={pieces} width={349} preset="detail" accessibilityLabel="Dress, sandals" />, { wrapper: LightTheme });
  expect(result.getByRole('image')).toHaveProp('height', measureGarmentBoardHeight(pieces, 349, 'detail'));
  expect(measureGarmentBoardHeight(pieces, 349, 'detail')).not.toBe(measureGarmentBoardHeight(pieces, 349, 'today'));
});

const risingBoard = (
  <GarmentBoard
    accessibilityLabel="Dress, sandals"
    pieces={pieces}
    preset="today"
    rise
    testID="board"
    width={349}
  />
);

const restingBoard = (
  <GarmentBoard
    accessibilityLabel="Dress, sandals"
    pieces={pieces}
    preset="today"
    testID="board"
    width={349}
  />
);

test('a rising board starts one large step below at zero opacity and adds no node', async () => {
  const result = await render(risingBoard, { wrapper: LightTheme });

  // The whole arrival rides one wrapper, so the stage the screen draws never moves, and
  // the wrapper carries no accessibility props of its own.
  const style = StyleSheet.flatten(result.toJSON()!.props.style);
  expect(style.opacity).toBe(0);
  expect(style.transform).toEqual([{ translateY: spacing.xl }]);
  expect(result.getAllByRole('image')).toHaveLength(1);
  expect(result.getByRole('image', { name: 'Dress, sandals' })).toHaveProp('testID', 'board');
});

test('Reduced Motion draws a rising board at rest', async () => {
  const rising = await render(risingBoard, { wrapper: ReducedMotionTheme });
  const resting = await render(restingBoard, { wrapper: ReducedMotionTheme });

  expect(rising.toJSON()).toEqual(resting.toJSON());
});

test('entrance keeps one accessible detail-height image and reports settle once', async () => {
  const onSettled = jest.fn();
  const result = await render(
    <GarmentBoard
      accessibilityLabel="Dress, sandals"
      entrance={{
        fromPreset: 'today',
        fromStageColor: lightTheme.atmosphere.fallingDay,
        fromStageRadius: 26,
        onSettled,
      }}
      pieces={pieces}
      preset="detail"
      width={349}
    />,
    { wrapper: LightTheme },
  );

  expect(result.getAllByRole('image')).toHaveLength(1);
  expect(StyleSheet.flatten(result.getByRole('image', { name: 'Dress, sandals' }).props.style))
    .toMatchObject({ height: measureGarmentBoardHeight(pieces, 349, 'detail'), width: 349 });
  expect(onSettled).toHaveBeenCalledTimes(1);
});

test('a settle change moves the pieces without replaying the entrance or the accessible tree', async () => {
  const onSettled = jest.fn();
  const board = (settle: number) => (
    <GarmentBoard
      accessibilityLabel="Dress, sandals"
      entrance={{
        fromPreset: 'today',
        fromStageColor: lightTheme.atmosphere.fallingDay,
        fromStageRadius: 26,
        onSettled,
      }}
      pieces={pieces}
      preset="detail"
      settle={settle}
      width={349}
    />
  );
  const result = await render(board(0), { wrapper: LightTheme });
  const restingTree = result.toJSON();

  await result.rerender(board(1));

  // The settle rides a shared value: no node enters or leaves, so nothing is
  // re-announced, and the entrance is not replayed.
  expect(result.toJSON()).toEqual(restingTree);
  expect(onSettled).toHaveBeenCalledTimes(1);
});

test('Reduced Motion reports settle once and preserves the static board tree', async () => {
  const onSettled = jest.fn();
  const staticResult = await render(
    <GarmentBoard
      accessibilityLabel="Dress, sandals"
      pieces={pieces}
      preset="detail"
      testID="board"
      width={349}
    />,
    { wrapper: ReducedMotionTheme },
  );
  const entranceBoard = (settle: number) => (
    <GarmentBoard
      accessibilityLabel="Dress, sandals"
      entrance={{
        fromPreset: 'today',
        fromStageColor: lightTheme.atmosphere.fallingDay,
        fromStageRadius: 26,
        onSettled,
      }}
      pieces={pieces}
      preset="detail"
      settle={settle}
      testID="board"
      width={349}
    />
  );
  const entranceResult = await render(entranceBoard(0), { wrapper: ReducedMotionTheme });

  expect(entranceResult.toJSON()).toEqual(staticResult.toJSON());
  expect(onSettled).toHaveBeenCalledTimes(1);

  // The moment's settle renders nothing under Reduce Motion; only its haptic remains.
  await entranceResult.rerender(entranceBoard(1));
  expect(entranceResult.toJSON()).toEqual(staticResult.toJSON());
});
