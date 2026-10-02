import { render } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { processColor, StyleSheet } from 'react-native';
import * as Reanimated from 'react-native-reanimated';

import {
  composeGarmentBoard,
  drawnExtent,
  fitTodayStage,
  garmentShadowRule,
  placeOnRunway,
  todayPreset,
} from '@/components/ui/garment-board/compose-garment-board';
import {
  entranceStartBoxes,
  GarmentBoard,
  measureGarmentBoardHeight,
  type GarmentBoardPiece,
} from '@/components/ui/garment-board/garment-board';
import { garmentRolesBySlot, type GarmentOutfitPalette } from '@/components/ui/garment-board/garment-palette';
import { resolveGarmentSilhouette } from '@/components/ui/garment-board/garment-silhouette-map';
import { silhouettes } from '@/components/ui/garment-board/silhouettes';
import { shiftOklchLightness } from '@/theme/color-oklch';
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
  optionId: 'outfit-a', formality: 'casual', temperatureC: 29, condition: 'clear', isNight: false,
  pieces: [{ slot: 'one_piece', garmentTypeId: 'dress' }, { slot: 'footwear', garmentTypeId: 'sandals' }],
};

const rolesOn = (plane: string) => garmentRolesBySlot({
  ...palette,
  appearance: 'light',
  stageColor: plane,
  accessoryStageColor: lightTheme.colors.background,
  inkColor: lightTheme.colors.textPrimary,
});

// A clip path's own shape is geometry, not paint; skip it when reading drawn fills.
const insideClip = (node: { type: unknown; parent: unknown }): boolean => {
  for (let at = node.parent as { type: unknown; parent: unknown } | null; at; at = at.parent as typeof at) {
    if (String(at.type).includes('ClipPath')) return true;
  }
  return false;
};

// The first main-coloured group's outline, filled (its stroke-free copy; the edge and the clip
// are separate).
function fillsOf(result: Awaited<ReturnType<typeof render>>, silhouetteId: 'g-dress' | 'g-sandal') {
  const group = silhouettes[silhouetteId].groups.find(({ fill }) => fill === 'main')!;
  return result.container
    .queryAll((node) => node.props.d === group.outline && node.props.strokeWidth == null
      && node.props.fill != null && node.props.fill !== 'none' && !insideClip(node))
    .map((node) => node.props.fill);
}

function dressFills(result: Awaited<ReturnType<typeof render>>) {
  return fillsOf(result, 'g-dress');
}

test('the board is one accessible image and its measured height matches its SVG', async () => {
  const result = await render(<GarmentBoard palette={palette} pieces={pieces} width={349} preset="today" accessibilityLabel="Dress, sandals" testID="board" />, { wrapper: LightTheme });
  const board = result.getByRole('image', { name: 'Dress, sandals' });
  expect(result.getAllByRole('image')).toHaveLength(1);
  expect(board).toHaveProp('testID', 'board');
  expect(board).toHaveProp('width', 349);
  expect(board).toHaveProp('height', measureGarmentBoardHeight(pieces, 349, 'today'));
});

test('detail uses the same pieces with its own measured height', async () => {
  const result = await render(<GarmentBoard palette={palette} pieces={pieces} width={349} preset="detail" accessibilityLabel="Dress, sandals" />, { wrapper: LightTheme });
  expect(result.getByRole('image')).toHaveProp('height', measureGarmentBoardHeight(pieces, 349, 'detail'));
  expect(measureGarmentBoardHeight(pieces, 349, 'detail')).not.toBe(measureGarmentBoardHeight(pieces, 349, 'today'));
  expect(dressFills(result)).toEqual([
    { type: 0, payload: processColor(rolesOn(lightTheme.colors.background).get('one_piece')!.main) },
  ]);
});

// O15: the board takes every fill from the outfit's palette, made legible on the plane it
// stands on, and a travelling board keeps those colours across the move.
test('board fills come from the outfit palette on the plane the board stands on', async () => {
  const stageColor = lightTheme.atmosphere.clearDay;
  const roles = rolesOn(stageColor);
  const staticResult = await render(
    <GarmentBoard
      accessibilityLabel="Dress, sandals"
      palette={palette}
      pieces={pieces}
      preset="today"
      stageColor={stageColor}
      width={349}
    />,
    { wrapper: LightTheme },
  );
  expect(dressFills(staticResult)).toEqual([{ type: 0, payload: processColor(roles.get('one_piece')!.main) }]);
  // ADR 0025 section 2: a board draws its footwear as a pair, the one shoe twice in the same colours.
  const shoe = { type: 0, payload: processColor(roles.get('footwear')!.main) };
  expect(fillsOf(staticResult, 'g-sandal')).toEqual([shoe, shoe]);
  expect(roles.get('one_piece')!.main).not.toBe(roles.get('footwear')!.main);

  const travellingResult = await render(
    <GarmentBoard
      accessibilityLabel="Dress, sandals"
      entrance={{ fromPreset: 'today', fromStageColor: lightTheme.atmosphere.fallingDay, fromStageRadius: 26 }}
      palette={palette}
      pieces={pieces}
      preset="today"
      stageColor={stageColor}
      width={349}
    />,
    { wrapper: LightTheme },
  );
  expect(dressFills(travellingResult)).toEqual([{ type: 0, payload: processColor(roles.get('one_piece')!.main) }]);
});

const risingBoard = (
  <GarmentBoard
    palette={palette}
    accessibilityLabel="Dress, sandals"
    pieces={pieces}
    preset="today"
    rise
    testID="board"
    width={349}
  />
);

// Each piece rises on its own layer under the one accessible image, so the stage the
// screen draws never moves and no layer adds a node a screen reader stops on.
const riseLayers = (result: Awaited<ReturnType<typeof render>>) =>
  result.getByRole('image', { name: 'Dress, sandals' }).children
    .filter((child) => typeof child !== 'string')
    .map((layer) => StyleSheet.flatten(layer.props.style) ?? {});

test('a rising board starts one large step below at zero opacity and adds no node', async () => {
  // The test mock lands every spring at once; hold the landing to read the first frame.
  const withSpring = jest.spyOn(Reanimated, 'withSpring').mockImplementation((toValue) => toValue);
  const result = await render(risingBoard, { wrapper: LightTheme });
  withSpring.mockRestore();

  const layers = riseLayers(result);
  expect(layers).toHaveLength(pieces.length);
  for (const layer of layers) {
    expect(layer.opacity).toBe(0);
    expect(layer.transform).toEqual([{ translateY: spacing.xl }]);
  }
  expect(result.getAllByRole('image')).toHaveLength(1);
  expect(result.getByRole('image', { name: 'Dress, sandals' })).toHaveProp('testID', 'board');
});

// ADR 0020: content arrives in reading order. The pieces rise one by one in the board's
// reading order, whatever order the outfit lists them in, each one stagger step after the
// piece before it, each with its shadow; the layers stack in the dressing order, so the outer
// layer, read before the mid layer, still lies over it.
test('a rising board staggers its pieces in reading order and stacks them in dressing order', async () => {
  const layered: readonly GarmentBoardPiece[] = [
    { slot: 'footwear', garmentTypeId: 'ankle_boots', category: 'footwear' },
    { slot: 'mid_layer', garmentTypeId: 'sweater', category: 'top' },
    { slot: 'outer_layer', garmentTypeId: 'rain_jacket', category: 'outerwear' },
    { slot: 'bottom', garmentTypeId: 'trousers', category: 'bottom' },
    { slot: 'primary_top', garmentTypeId: 't_shirt', category: 'top' },
  ];
  const layeredPalette: GarmentOutfitPalette = {
    ...palette, pieces: layered.map(({ slot, garmentTypeId }) => ({ slot, garmentTypeId })),
  };
  const withDelay = jest.spyOn(Reanimated, 'withDelay');
  const result = await render(
    <GarmentBoard accessibilityLabel="Rainy outfit" fit palette={layeredPalette} pieces={layered} preset="today"
      rise stageColor={lightTheme.atmosphere.clearDay} width={349} />,
    { wrapper: LightTheme },
  );

  // Stacked top, bottom, mid layer, outer layer, footwear; read top, bottom, outer, mid, footwear.
  const { stagger } = lightTheme.motion;
  const delays = withDelay.mock.calls.map(([delay]) => delay);
  expect(delays).toEqual([0, 1, 3, 2, 4].flatMap((index) => [index * stagger, index * stagger]));
  const layers = result.getByRole('image').children.filter((child) => typeof child !== 'string');
  expect(layers).toHaveLength(layered.length);
  const ids = ['g-tee', 'g-trousers', 'g-sweater', 'g-rain', 'g-boot'] as const;
  layers.forEach((layer, index) => {
    const [group] = silhouettes[ids[index]].groups;
    expect(layer.queryAll((node) => node.props.d === group.outline).length).toBeGreaterThan(0);
    // Each piece casts its own shadow, inside its own layer, so it rises with the piece.
    expect(layer.queryAll((node) => String(node.type).includes('FeGaussianBlur')).length).toBe(1);
  });
  withDelay.mockRestore();
});

test('a held rise keeps its pieces unseen at the start until released, then rises once', async () => {
  const board = (holdRise: boolean) => (
    <GarmentBoard
      palette={palette}
      accessibilityLabel="Dress, sandals"
      holdRise={holdRise}
      pieces={pieces}
      preset="today"
      rise
      testID="board"
      width={349}
    />
  );
  const withSpring = jest.spyOn(Reanimated, 'withSpring');
  const result = await render(board(true), { wrapper: LightTheme });
  await result.rerender(board(true));
  expect(withSpring).not.toHaveBeenCalled();
  for (const layer of riseLayers(result)) {
    expect(layer).toMatchObject({ opacity: 0, transform: [{ translateY: spacing.xl }] });
  }

  await result.rerender(board(false));
  expect(withSpring).toHaveBeenCalledTimes(pieces.length);
  for (const layer of riseLayers(result)) expect(layer.opacity ?? 1).toBe(1);
  // A later hold never replays it.
  await result.rerender(board(true));
  await result.rerender(board(false));
  expect(withSpring).toHaveBeenCalledTimes(pieces.length);
  withSpring.mockRestore();
});

// A landed rise hands its resting style to React itself. Reanimated only syncs a settled
// animation's props back to React when a JS tick falls 1 to 2 s after its last frame and
// drops them natively after 2 s; a JS stall across that window (a cold-launch background
// refresh) left React holding the zero-opacity start, and the next re-render committed it:
// the stage stayed, the pieces vanished until restart.
test('a landed rise leaves no zero-opacity start in the props React commits', async () => {
  const result = await render(risingBoard, { wrapper: LightTheme });

  for (const layer of riseLayers(result)) {
    expect(layer.opacity ?? 1).toBe(1);
    expect(layer.transform ?? []).toEqual([]);
  }
  expect(result.getByRole('image', { name: 'Dress, sandals' })).toHaveProp('testID', 'board');
});

test('entrance keeps one accessible detail-height image and reports settle once', async () => {
  const onSettled = jest.fn();
  const result = await render(
    <GarmentBoard
      palette={palette}
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
      palette={palette}
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

// P2: Today's primary stage fits the board, as tall as its fitted pieces. Every board draws
// each piece with its soft shadow, in the plane's own colour moved down in lightness.
test('a fitted board is as tall as its fitted pieces and every piece casts a shadow', async () => {
  const fitted = await render(
    <GarmentBoard accessibilityLabel="Dress, sandals" fit palette={palette}
      pieces={pieces} preset="today" stageColor={lightTheme.atmosphere.clearDay} width={349} />,
    { wrapper: LightTheme },
  );
  const image = fitted.getByRole('image');
  expect(image).toHaveProp('height', measureGarmentBoardHeight(pieces, 349, 'today', true));
  const floods = fitted.container.queryAll((node) => String(node.type).includes('FeFlood'));
  expect(floods).toHaveLength(pieces.length);
  const shadow = shiftOklchLightness(lightTheme.atmosphere.clearDay, garmentShadowRule.step.light);
  expect(floods.every((node) => processColor(shadow) === (node.props.floodColor?.payload ?? node.props.floodColor)))
    .toBe(true);
});

// P2: opening the detail, the pieces leave from where Today's fitted stage drew them, so
// nothing jumps by the fit's scale; without the fit they leave from the plain preset.
test('an entrance from the fitted Today stage starts on the fitted Today boxes', () => {
  const composed = composeGarmentBoard(pieces.map((piece) => ({
    ...piece, ...resolveGarmentSilhouette(piece.garmentTypeId, piece.category),
  })), todayPreset);
  const extent = drawnExtent(composed.boxes.values());
  const { scale, height } = fitTodayStage(extent, 349);
  const start = entranceStartBoxes(pieces, 349, 'today', true);
  expect(start.size).toBe(pieces.length);
  for (const piece of composed.order) {
    const today = placeOnRunway(composed.boxes.get(piece)!, extent, scale, 349, height);
    const from = start.get(piece.slot)!;
    expect(from.x * 349).toBeCloseTo(today.x, 9);
    expect(from.y * 349).toBeCloseTo(today.y, 9);
    expect(from.w * 349).toBeCloseTo(today.w, 9);
    expect(from.h * 349).toBeCloseTo(today.h, 9);
  }
  const plain = entranceStartBoxes(pieces, 349, 'today', false);
  for (const piece of composed.order) expect(plain.get(piece.slot)).toEqual(composed.boxes.get(piece));
});
