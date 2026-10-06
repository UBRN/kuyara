import { render } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';

import { ClosetRack } from '@/garment-art/closet-rack';
import { GarmentBoard, type GarmentBoardPiece } from '@/garment-art/garment-board';
import { GarmentCutProvider } from '@/garment-art/garment-cut';
import { GarmentDrawing } from '@/garment-art/garment-tile-artwork';
import { silhouettes, type SilhouetteId } from '@/garment-art/silhouettes';
import { lightTheme } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

// Every reader draws a piece in the cut its provider names: the women's tee or the men's.
function Wrapper({ cut, children }: PropsWithChildren<{ cut?: 'womens' | 'mens' }>) {
  const themed = <KuyaraThemeContext.Provider value={lightTheme}>{children}</KuyaraThemeContext.Provider>;
  return cut ? <GarmentCutProvider cut={cut}>{themed}</GarmentCutProvider> : themed;
}

const outline = (id: SilhouetteId) => silhouettes[id].groups[0].outline;
const draws = (result: Awaited<ReturnType<typeof render>>, id: SilhouetteId) =>
  result.container.queryAll((node) => node.props.d === outline(id)).length > 0;

const pieces: readonly GarmentBoardPiece[] = [
  { slot: 'primary_top', garmentTypeId: 't_shirt', category: 'top' },
  { slot: 'bottom', garmentTypeId: 'jeans', category: 'bottom' },
  { slot: 'footwear', garmentTypeId: 'sneakers', category: 'footwear' },
];
const palette = {
  optionId: 'cut', formality: 'casual' as const, temperatureC: 20, condition: 'clear' as const, isNight: false,
  pieces: pieces.map(({ slot, garmentTypeId }) => ({ slot, garmentTypeId })),
};
const rackPieces = [{
  id: 'tee', garmentTypeId: 't_shirt' as const, category: 'top' as const, colorFamily: null, wanted: false, addedAt: 1,
}];

test.each([
  ['the board', <GarmentBoard accessibilityLabel="Tee, jeans, sneakers" key="board" palette={palette} pieces={pieces} preset="today" width={349} />],
  ['a tile', <GarmentDrawing category="top" garmentTypeId="t_shirt" key="tile" size={44} testID="tile" />],
  ['the rack', <ClosetRack key="rack" pieces={rackPieces} />],
])('%s draws a piece in the cut its provider names, women\'s without one', async (_, element) => {
  const womens = await render(element, { wrapper: ({ children }) => <Wrapper>{children}</Wrapper> });
  expect(draws(womens, 'g-tee-f')).toBe(true);
  expect(draws(womens, 'g-tee-m')).toBe(false);
  const men = await render(element, { wrapper: ({ children }) => <Wrapper cut="mens">{children}</Wrapper> });
  expect(draws(men, 'g-tee-m')).toBe(true);
  expect(draws(men, 'g-tee-f')).toBe(false);
});
