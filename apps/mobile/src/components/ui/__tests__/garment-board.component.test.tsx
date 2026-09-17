import { render } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { processColor, StyleSheet } from 'react-native';

import { GarmentBoard, measureGarmentBoardHeight, type GarmentBoardPiece } from '@/components/ui/garment-board/garment-board';
import { resolveGarmentRenderFills } from '@/components/ui/garment-board/garment-render-fills';
import { silhouettes } from '@/components/ui/garment-board/silhouettes';
import { blend } from '@/theme/color-blend';
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

function fillsOf(result: Awaited<ReturnType<typeof render>>, silhouetteId: 'g-dress' | 'g-sandal') {
  const filledPath = silhouettes[silhouetteId].paths.find((path) => path.filled)!;
  return result.container
    .queryAll((node) => node.props.d === filledPath.d)
    .map((node) => node.props.fill);
}

function dressFills(result: Awaited<ReturnType<typeof render>>) {
  return fillsOf(result, 'g-dress');
}

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
  expect(dressFills(result)).toEqual([
    { type: 0, payload: processColor(lightTheme.colors.stage) },
  ]);
});

test('a tinted stage gives static and travelling artwork the same derived target fill', async () => {
  const stageColor = lightTheme.atmosphere.clearDay;
  const targetFill = blend(stageColor, lightTheme.colors.textPrimary, 0.13);
  const staticResult = await render(
    <GarmentBoard
      accessibilityLabel="Dress, sandals"
      pieces={pieces}
      preset="today"
      stageColor={stageColor}
      width={349}
    />,
    { wrapper: LightTheme },
  );
  expect(dressFills(staticResult)).toEqual([
    { type: 0, payload: processColor(targetFill) },
  ]);

  const fromStageColor = lightTheme.atmosphere.fallingDay;
  const travellingResult = await render(
    <GarmentBoard
      accessibilityLabel="Dress, sandals"
      entrance={{ fromPreset: 'today', fromStageColor, fromStageRadius: 26 }}
      pieces={pieces}
      preset="today"
      stageColor={stageColor}
      width={349}
    />,
    { wrapper: LightTheme },
  );
  expect(dressFills(travellingResult)).toEqual([
    { type: 0, payload: processColor(targetFill) },
    {
      type: 0,
      payload: processColor(blend(fromStageColor, lightTheme.colors.textPrimary, 0.13)),
    },
  ]);
});

test('an option id colours one piece of the board that is the screen\u2019s subject', async () => {
  const plane = lightTheme.atmosphere.clearDay;
  const expected = resolveGarmentRenderFills({
    optionId: 'outfit-a',
    pieces: pieces.map(({ slot }) => ({ slot, colorFamily: null })),
    plane,
    colors: lightTheme.colors,
    colorScheme: 'light',
  });
  const neutral = blend(plane, lightTheme.colors.textPrimary, 0.13);
  const result = await render(
    <GarmentBoard
      accessibilityLabel="Dress, sandals"
      optionId="outfit-a"
      pieces={pieces}
      preset="today"
      stageColor={plane}
      width={349}
    />,
    { wrapper: LightTheme },
  );

  // The dress takes the accent and the sandals the deeper neutral, so the board reads as
  // one answer with one colour in it rather than as three equal panels.
  expect(dressFills(result)).toEqual([{ type: 0, payload: processColor(expected.get('one_piece')) }]);
  expect(fillsOf(result, 'g-sandal')).toEqual([{ type: 0, payload: processColor(expected.get('footwear')) }]);
  expect(expected.get('one_piece')).not.toBe(neutral);
  expect(expected.get('footwear')).not.toBe(neutral);
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
