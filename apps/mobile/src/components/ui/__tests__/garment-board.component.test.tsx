import { render } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { processColor, StyleSheet } from 'react-native';

import { GarmentBoard, measureGarmentBoardHeight, type GarmentBoardPiece } from '@/components/ui/garment-board/garment-board';
import { garmentRolesBySlot, type GarmentOutfitPalette } from '@/components/ui/garment-board/garment-palette';
import { silhouettes } from '@/components/ui/garment-board/silhouettes';
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

// The first group's outline, filled (its stroke-free copy; the edge and the clip are separate).
function fillsOf(result: Awaited<ReturnType<typeof render>>, silhouetteId: 'g-dress' | 'g-sandal') {
  const [group] = silhouettes[silhouetteId].groups;
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
  expect(fillsOf(staticResult, 'g-sandal')).toEqual([{ type: 0, payload: processColor(roles.get('footwear')!.main) }]);
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
