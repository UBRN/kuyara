import { render } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';

import { GarmentBoard, measureGarmentBoardHeight, type GarmentBoardPiece } from '@/components/ui/garment-board/garment-board';
import { lightTheme } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

function LightTheme({ children }: PropsWithChildren) {
  return <KuyaraThemeContext.Provider value={lightTheme}>{children}</KuyaraThemeContext.Provider>;
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
