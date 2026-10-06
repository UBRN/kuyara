import { act, fireEvent, render } from '@testing-library/react-native';
import { Dimensions } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { GarmentPainting as GarmentPaintingType } from '@/garment-art/garment-painting';
import { useManualMix } from '@/features/recommendation/application/use-manual-mix';
import { todayScreenState } from '@/features/today/__tests__/fixtures';
import { OutfitDetailScreen } from '@/features/today/presentation/outfit-detail-screen';
import { LocalizationContext } from '@/localization/localization-context';
import { messages } from '@/localization/messages';
import { lightTheme } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

jest.mock('expo-router', () => {
  const React = jest.requireActual('react') as typeof import('react');
  return {
    useFocusEffect: (callback: () => void | (() => void)) => React.useEffect(() => callback(), [callback]),
    // The detail's share button sits in the native toolbar, which draws nothing here.
    Stack: { Toolbar: Object.assign(() => null, { Button: () => null }) },
  };
});

// Every drawing that actually paints, past its memo: a board piece's drawing carries its slot,
// a tile's (the strip's and the piece rows') only its silhouette.
const mockPainted: string[] = [];
jest.mock('@/garment-art/garment-painting', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const actual = jest.requireActual('@/garment-art/garment-painting') as
    typeof import('@/garment-art/garment-painting');
  const inner = (actual.GarmentPainting as unknown as { type: (props: object) => React.ReactNode }).type;
  return {
    ...actual,
    GarmentPainting: React.memo(function CountedGarmentPainting(props: Parameters<typeof GarmentPaintingType>[0]) {
      const { silhouette } = props as { silhouette: { id: string; slot?: string } };
      mockPainted.push(silhouette.slot ? `board:${silhouette.slot}` : `tile:${silhouette.id}`);
      return inner(props);
    }),
  };
});

const fixtureNow = Date.parse('2026-08-13T06:30:00.000Z');
const originalDimensions = Dimensions.get('window');
let dateNowSpy: jest.SpiedFunction<typeof Date.now>;
beforeEach(() => {
  mockPainted.length = 0;
  dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(fixtureNow);
  Dimensions.set({ window: { ...originalDimensions, width: 390, fontScale: 1 } });
});
afterEach(() => {
  dateNowSpy.mockRestore();
  Dimensions.set({ window: originalDimensions });
});

const { recommendation } = todayScreenState.snapshot;
if (recommendation.status !== 'recommended') throw new Error('Expected the Today fixture to recommend.');
const pick = recommendation.outfits[0];

function Detail() {
  const manualMix = useManualMix(pick, recommendation.status === 'recommended' ? recommendation.requirements : null,
    'womens');
  return (
    <OutfitDetailScreen
      language="en"
      manualMix={manualMix}
      onEditPiece={jest.fn()}
      onWoreThis={jest.fn()}
      state={todayScreenState}
      suggestionId={pick.optionId}
      wardrobeItems={[]}
      worn="none"
    />
  );
}

const board = () => mockPainted.filter((entry) => entry.startsWith('board:'));
const tiles = () => mockPainted.filter((entry) => entry.startsWith('tile:'));

// Drawings are the detail's most expensive subtree (measured 2026-09-29: a step repainted
// every piece on the board, every strip tile and every piece row, about 35 paths each).
// Enlarging a piece or stepping it changes that slot alone: the other pieces, the other
// candidates' tiles and the other rows keep their drawing, size and colours, so nothing of
// theirs may paint again.
test('enlarging a piece and stepping it repaint only the drawings the step adds', async () => {
  const result = await render(
    <LocalizationContext value={{ language: 'en', messages: messages.en, hour12: false, temperatureUnit: 'celsius' }}>
      <KuyaraThemeContext.Provider value={lightTheme}>
        <SafeAreaProvider initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 59, right: 0, bottom: 34, left: 0 },
        }}>
          <Detail />
        </SafeAreaProvider>
      </KuyaraThemeContext.Provider>
    </LocalizationContext>,
  );
  await fireEvent(result.getByTestId('outfit-detail-content'), 'layout',
    { nativeEvent: { layout: { width: 358, height: 1000, x: 0, y: 0 } } });
  await act(async () => undefined);
  const slots = new Set(board());
  expect(slots).toContain('board:footwear');
  expect(slots.size).toBeGreaterThan(1);
  const piece = () => result.getByTestId('outfit-detail-board-piece-footwear');

  mockPainted.length = 0;
  await fireEvent(piece(), 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });
  await act(async () => undefined);
  expect(board().filter((entry) => entry !== 'board:footwear')).toEqual([]);
  // The strip opened, so its tiles painted once.
  expect(tiles().length).toBeGreaterThan(0);

  mockPainted.length = 0;
  await fireEvent(piece(), 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
  await act(async () => undefined);
  // Only the piece that now waits behind the window's far edge is new: its resting drawing
  // and its big one paint, each a pair of shoes. The piece that slid in and the one that slid
  // out keep theirs.
  expect(board()).toEqual(['board:footwear', 'board:footwear', 'board:footwear', 'board:footwear']);
  // Of the tiles, only the changed piece's row paints: the strip's candidates keep their colours.
  expect(tiles()).toHaveLength(1);
});
