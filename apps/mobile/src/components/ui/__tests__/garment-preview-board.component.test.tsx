import { act, isHiddenFromAccessibility, render } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import * as Reanimated from 'react-native-reanimated';

import { GarmentPreviewBoard, type GarmentBoardPiece } from '@/components/ui';
import { PREVIEW_SLIDE } from '@/components/ui/garment-preview-board';
import { lightTheme } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

function LightTheme({ children }: PropsWithChildren) {
  return <KuyaraThemeContext.Provider value={lightTheme}>{children}</KuyaraThemeContext.Provider>;
}

const outfit = (footwear: GarmentBoardPiece['garmentTypeId']): readonly GarmentBoardPiece[] => [
  { slot: 'primary_top', garmentTypeId: 't_shirt', category: 'top' },
  { slot: 'bottom', garmentTypeId: 'jeans', category: 'bottom' },
  { slot: 'footwear', garmentTypeId: footwear, category: 'footwear' },
];

const board = (pieces: readonly GarmentBoardPiece[]) => (
  <LightTheme>
    <GarmentPreviewBoard
      height={400}
      palette={{
        optionId: 'preview', formality: 'casual', temperatureC: 14, condition: 'cloudy', isNight: false,
        pieces: pieces.map(({ garmentTypeId, slot }) => ({ garmentTypeId, slot })),
      }}
      pieces={pieces}
      stageColor={lightTheme.atmosphere.veiledDay}
      testID="preview"
      width={300}
    />
  </LightTheme>
);
const hidden = { includeHiddenElements: true };
type Landing = (finished: boolean) => void;

test('the board is drawn at rest on mount, hidden from the screen reader, at the height it is given', async () => {
  const withSpring = jest.spyOn(Reanimated, 'withSpring');
  const withTiming = jest.spyOn(Reanimated, 'withTiming');
  const result = await render(board(outfit('sneakers')));
  const root = result.getByTestId('preview', hidden);

  expect(isHiddenFromAccessibility(root)).toBe(true);
  expect(root.props.style).toMatchObject({ height: 400, width: 300 });
  expect(root.children).toHaveLength(3);
  expect(withSpring).not.toHaveBeenCalled();
  expect(withTiming).not.toHaveBeenCalled();
  withSpring.mockRestore();
  withTiming.mockRestore();
});

test('a choice slides the piece it changes out and its successor in, and the old piece leaves the tree', async () => {
  const fades: Landing[] = [];
  const withSpring = jest.spyOn(Reanimated, 'withSpring').mockImplementation(
    ((toValue: number) => toValue) as typeof Reanimated.withSpring,
  );
  const withDelay = jest.spyOn(Reanimated, 'withDelay').mockImplementation(
    ((_delay: number, animation: unknown) => animation) as typeof Reanimated.withDelay,
  );
  const withTiming = jest.spyOn(Reanimated, 'withTiming').mockImplementation(((
    toValue: number, _config: unknown, callback?: Landing,
  ) => {
    if (callback) fades.push(callback);
    return toValue;
  }) as typeof Reanimated.withTiming);
  const result = await render(board(outfit('sneakers')));

  await result.rerender(board(outfit('loafers')));
  // The leaving shoe slides to the leading side while it fades on fast; the new one fades in
  // on fast while it slides home on the spatial spring.
  expect(withSpring).toHaveBeenCalledWith(-PREVIEW_SLIDE, lightTheme.springs.spatial);
  expect(withSpring).toHaveBeenCalledWith(0, lightTheme.springs.spatial, expect.any(Function));
  expect(withTiming).toHaveBeenCalledWith(0, { duration: lightTheme.motion.fast, easing: expect.anything() }, expect.any(Function));
  expect(withTiming).toHaveBeenCalledWith(1, { duration: lightTheme.motion.fast, easing: expect.anything() });
  expect(result.getByTestId('preview', hidden).children).toHaveLength(4);

  await act(() => fades.forEach((land) => land(true)));
  expect(result.getByTestId('preview', hidden).children).toHaveLength(3);
  withSpring.mockRestore();
  withDelay.mockRestore();
  withTiming.mockRestore();
});

test('the same pieces re-rendered start no motion', async () => {
  const result = await render(board(outfit('sneakers')));
  const withSpring = jest.spyOn(Reanimated, 'withSpring');
  await result.rerender(board(outfit('sneakers')));
  expect(withSpring).not.toHaveBeenCalled();
  withSpring.mockRestore();
});
