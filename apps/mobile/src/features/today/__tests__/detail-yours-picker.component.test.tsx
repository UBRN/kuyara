import { act, fireEvent, render, within } from '@testing-library/react-native';
import { HeaderHeightContext } from 'expo-router/react-navigation';
import { useMemo } from 'react';
import { Dimensions } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { garmentSwatchesBySlot } from '@/garment-art';
import { getGarmentType } from '@/features/catalog/domain/garment-catalog';
import type { GarmentTypeId } from '@/features/catalog/domain/garment-taxonomy';
import { useManualMix } from '@/features/recommendation/application/use-manual-mix';
import { outfitGarments, slotCandidates } from '@/features/recommendation/domain/manual-mix';
import type { WornPieceColors } from '@/features/recommendation/domain/outfit-history';
import { todayScreenState } from '@/features/today/__tests__/fixtures';
import { usePieceColors } from '@/features/today/application/piece-colors';
import { OutfitDetailScreen } from '@/features/today/presentation/outfit-detail-screen';
import { createTodayPresentation } from '@/features/today/presentation/today-presentation';
import { closetSolidForBoardSwatch } from '@/features/wardrobe/domain/closet-board-swatch';
import type { WardrobeItem } from '@/features/wardrobe/domain/wardrobe-item';
import { LocalizationContext } from '@/localization/localization-context';
import { messages, type SupportedLanguage } from '@/localization/messages';
import { lightTheme } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

jest.mock('@expo/ui/community/bottom-sheet', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  return {
    BottomSheet: ({ children, index, onClose }: { children: React.ReactNode; index: number; onClose?: () => void }) => {
      const open = React.useRef(index >= 0);
      React.useEffect(() => {
        if (open.current && index < 0) onClose?.();
        open.current = index >= 0;
      }, [index, onClose]);
      return index >= 0 ? React.createElement(View, null, children) : null;
    },
  };
});
// The segmented control is native; each segment stands as a pressable here.
jest.mock('@expo/ui/community/segmented-control', () => {
  const { Pressable, View } = jest.requireActual('react-native') as typeof import('react-native');
  return {
    SegmentedControl: ({ onChange, selectedIndex, testID, values }: {
      onChange: (event: { nativeEvent: { selectedSegmentIndex: number } }) => void;
      selectedIndex: number;
      testID?: string;
      values: string[];
    }) => (
      <View testID={testID}>
        {values.map((value, index) => (
          <Pressable
            accessibilityLabel={value}
            accessibilityState={{ selected: index === selectedIndex }}
            key={value}
            onPress={() => onChange({ nativeEvent: { selectedSegmentIndex: index } })}
            testID={`${testID}-${index}`}
          />
        ))}
      </View>
    ),
  };
});
jest.mock('expo-router', () => {
  const React = jest.requireActual('react') as typeof import('react');
  return {
    useFocusEffect: (callback: () => void | (() => void)) => React.useEffect(() => callback(), [callback]),
    Stack: { Toolbar: Object.assign(() => null, { Button: () => null }) },
  };
});

const fixtureNow = Date.parse('2026-08-13T06:30:00.000Z');
const originalDimensions = Dimensions.get('window');
beforeEach(() => {
  jest.spyOn(Date, 'now').mockReturnValue(fixtureNow);
  Dimensions.set({ window: { ...originalDimensions, width: 390, fontScale: 1 } });
});
afterEach(() => {
  jest.restoreAllMocks();
  Dimensions.set({ window: originalDimensions });
});

const hidden = { includeHiddenElements: true };
const { recommendation } = todayScreenState.snapshot;
if (recommendation.status !== 'recommended') throw new Error('Expected the Today fixture to recommend.');
// 20 degrees and rain, a women's profile: blouse, jeans, rain jacket, rain boots; the mid layer is free.
const pick = recommendation.outfits[0];
const catalogName = (language: SupportedLanguage, id: string) =>
  messages[language].catalog[`catalog.garment_type.${id}.name` as keyof (typeof messages)['en']['catalog']];
const outerCandidates = slotCandidates(pick, 'outer_layer', recommendation.requirements, 'womens');
// A mid layer the outer slot does not also offer, so each tab lists its own.
const midType = slotCandidates(pick, 'mid_layer', recommendation.requirements, 'womens')
  .find(({ garmentTypeId }) => !outerCandidates.some((outer) => outer.garmentTypeId === garmentTypeId))!.garmentTypeId;
const drawn = (() => {
  const presentation = createTodayPresentation(todayScreenState, 'en', false, 'celsius', fixtureNow);
  if (presentation.kind !== 'loaded') throw new Error('Expected loaded Today presentation.');
  return garmentSwatchesBySlot(presentation.suggestions[0].palette);
})();

const record = (id: string, garmentTypeId: GarmentTypeId, colorId: string, more: Partial<WardrobeItem> = {}): WardrobeItem => ({
  id, localProfileId: 'profile-one', name: null, category: getGarmentType(garmentTypeId)!.structuralCategory,
  entryState: 'owned', color: null, photoRelativePath: null, createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z', deletedAt: null, garmentTypeId, colorFamily: null,
  colorChoice: { kind: 'option', id: colorId }, thermalLevelOverride: null, waterProtectionOverride: null,
  windProtectionOverride: null, breathabilityOverride: null, armCoverageOverride: null, legCoverageOverride: null,
  tractionSuitabilityOverride: null, ...more,
});
// A named camel trench coat, a piece the rain makes unusual; an olive rain jacket with a photo.
const trench = record('own-trench', 'trench_coat', 'camel', { name: 'Long trench' });
const rainJacket = record('own-rain', 'rain_jacket', 'olive', { photoRelativePath: 'wardrobe/own-rain.jpg' });
const wantedCoat = record('wish-coat', 'rain_jacket', 'navy', { entryState: 'wanted' });
const jeans = record('own-jeans', 'jeans', 'indigo_denim');
const sweater = record('own-mid', midType, 'plum');

function Detail({ language, wardrobeItems, onWoreThis }: Readonly<{
  language: SupportedLanguage;
  wardrobeItems: readonly WardrobeItem[];
  onWoreThis: (pieceColors: WornPieceColors) => void;
}>) {
  const manualMix = useManualMix(pick, recommendation.status === 'recommended' ? recommendation.requirements : null,
    'womens');
  const garments = useMemo(() => (manualMix ? outfitGarments(manualMix.outfit) : {}), [manualMix]);
  const pieceColors = usePieceColors(pick.optionId, garments);
  return (
    <OutfitDetailScreen
      language={language}
      manualMix={manualMix}
      onEditPiece={jest.fn()}
      onWoreThis={onWoreThis}
      pieceColors={pieceColors}
      resolvePhotoUri={(path) => (path ? `file:///app/${path}` : null)}
      state={todayScreenState}
      suggestionId={pick.optionId}
      wardrobeItems={wardrobeItems}
      worn={() => 'none'}
    />
  );
}

async function renderDetail(language: SupportedLanguage, wardrobeItems: readonly WardrobeItem[]) {
  const onWoreThis = jest.fn();
  const result = await render(
    <LocalizationContext value={{ language, messages: messages[language], hour12: false, temperatureUnit: 'celsius' }}>
      <KuyaraThemeContext.Provider value={lightTheme}>
        <SafeAreaProvider initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 59, right: 0, bottom: 34, left: 0 },
        }}>
          <HeaderHeightContext value={undefined}>
            <Detail language={language} onWoreThis={onWoreThis} wardrobeItems={wardrobeItems} />
          </HeaderHeightContext>
        </SafeAreaProvider>
      </KuyaraThemeContext.Provider>
    </LocalizationContext>,
  );
  await fireEvent(result.getByTestId('outfit-detail-content'), 'layout',
    { nativeEvent: { layout: { width: 358, height: 1000, x: 0, y: 0 } } });
  return { result, onWoreThis };
}
type Rendered = Awaited<ReturnType<typeof renderDetail>>['result'];

// A picker choice plays once the sheet has gone.
const afterSheet = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 600)); });
const groups = (result: Rendered) => result.getAllByTestId(/^piece-picker-(yours|fits|others)$/)
  .map(({ props }) => String(props.testID).replace('piece-picker-', ''));
const ownRows = (result: Rendered) => result.queryAllByTestId(/^piece-picker-own-/)
  .filter(({ props }) => props.accessibilityRole === 'button')
  .map(({ props }) => String(props.testID).replace('piece-picker-own-', ''));

test('the fixture draws the rain jacket in a colour other than olive, and the trench coat is unusual', () => {
  expect(drawn.outer_layer).not.toBe('olive');
  expect(outerCandidates.find(({ garmentTypeId }) => garmentTypeId === 'trench_coat')?.suitable).toBe(false);
  expect(outerCandidates.find(({ garmentTypeId }) => garmentTypeId === 'rain_jacket')?.suitable).toBe(true);
});

// Detail's "Yours" in the pickers: the reader's owned Closet pieces of the slot's catalog types,
// first, one row per record in Closet order, a shortcut that wears the type in the record's colour.
describe.each(['en', 'tr'] as const)('%s Yours in the pickers', (language) => {
  const copy = messages[language].today.manualMix;
  const colors = messages[language].wardrobe.colorOptionNames;

  test('Change lists the owned pieces of the slot first, each as its record names it', async () => {
    const { result } = await renderDetail(language, [trench, wantedCoat, jeans, rainJacket]);
    await fireEvent.press(result.getByTestId('outfit-detail-change-outer_layer'));
    expect(groups(result)).toEqual(['yours', 'fits', 'others']);
    const yours = within(result.getByTestId('piece-picker-yours'));
    expect(yours.getByRole('header', { name: copy.yours })).toBeOnTheScreen();
    expect(yours.getByText(copy.yoursHint)).toBeOnTheScreen();
    // Wanted pieces and other slots' types never show; Closet order holds.
    expect(ownRows(result)).toEqual(['own-trench', 'own-rain']);

    const named = result.getByTestId('piece-picker-own-own-trench');
    expect(within(named).getByText('Long trench')).toBeOnTheScreen();
    expect(within(named).getByText(
      `${catalogName(language, 'trench_coat')} · ${colors.camel} · ${copy.unusual}`)).toBeOnTheScreen();
    expect(named).toHaveProp('accessibilityLabel', copy.yoursPiece(catalogName(language, 'trench_coat'), colors.camel));
    expect(named).toHaveProp('accessibilityHint', copy.otherPieceHint);

    const plain = result.getByTestId('piece-picker-own-own-rain');
    expect(within(plain).getByText(catalogName(language, 'rain_jacket'))).toBeOnTheScreen();
    expect(within(plain).getByText(colors.olive)).toBeOnTheScreen();
    expect(plain.props.accessibilityHint).toBeUndefined();
    // The photo is the tile, hidden from VoiceOver; a record without one is drawn in its colour.
    expect(result.getByTestId('piece-picker-own-own-rain-photo-rain_jacket', hidden))
      .toHaveProp('source', { uri: 'file:///app/wardrobe/own-rain.jpg' });
    expect(result.getByTestId('piece-picker-own-own-trench-silhouette-trench_coat', hidden)).toBeOnTheScreen();
    expect(result.getByTestId('piece-picker-own-own-rain-mark', hidden)).toBeOnTheScreen();

    // The olive jacket is not the one worn: Current stays on the catalog's drawn rain jacket.
    expect(result.getByTestId('piece-picker-current-rain_jacket')).toBeOnTheScreen();
    expect(result.queryByTestId('piece-picker-current-own-own-rain')).toBeNull();
    // The catalog's candidates stay as they were.
    expect(result.getAllByTestId(/^piece-picker-option-/).map(({ props }) => props.testID))
      .toEqual(outerCandidates.map(({ garmentTypeId }) => `piece-picker-option-${garmentTypeId}`));
  });

  test('a Yours row wears its type in its colour, reads as owned, and takes Current from the catalog row', async () => {
    const { result, onWoreThis } = await renderDetail(language, [trench, rainJacket]);
    await fireEvent.press(result.getByTestId('outfit-detail-change-outer_layer'));
    await fireEvent.press(result.getByTestId('piece-picker-own-own-trench'));
    await afterSheet();
    expect(result.queryByTestId('piece-picker-sheet')).toBeNull();
    expect(result.getByTestId('outfit-detail-piece-trench_coat')).toBeOnTheScreen();
    expect(result.getByTestId('outfit-detail-name-marker-trench_coat-owned', hidden)).toBeOnTheScreen();
    await fireEvent.press(result.getByTestId('outfit-detail-wore-this'));
    expect(onWoreThis.mock.calls.at(-1)?.[0]).toMatchObject({ outer_layer: 'camel' });

    await fireEvent.press(result.getByTestId('outfit-detail-change-outer_layer'));
    const current = result.getByTestId('piece-picker-own-own-trench');
    expect(current).toHaveProp('accessibilityState', { selected: true });
    expect(current).toHaveProp('accessibilityLabel',
      `${copy.yoursPiece(catalogName(language, 'trench_coat'), colors.camel)}, ${copy.pickerCurrent}`);
    expect(result.getByTestId('piece-picker-current-own-own-trench')).toHaveTextContent(copy.pickerCurrent);
    expect(result.queryByTestId('piece-picker-current-trench_coat')).toBeNull();
    expect(result.getByTestId('piece-picker-option-trench_coat')).toHaveProp('accessibilityState', { selected: false });
  });

  test('a Yours row of the worn type in another colour only paints it', async () => {
    const { result, onWoreThis } = await renderDetail(language, [rainJacket]);
    await fireEvent.press(result.getByTestId('outfit-detail-change-outer_layer'));
    await fireEvent.press(result.getByTestId('piece-picker-own-own-rain'));
    await afterSheet();
    expect(result.getByTestId('outfit-detail-piece-rain_jacket')).toBeOnTheScreen();
    expect(result.getByTestId('outfit-detail-name-marker-rain_jacket-owned', hidden)).toBeOnTheScreen();
    await fireEvent.press(result.getByTestId('outfit-detail-wore-this'));
    expect(onWoreThis.mock.calls.at(-1)?.[0]).toMatchObject({ outer_layer: 'olive' });
  });

  test('the worn piece in its drawn colour is Current under Yours, and choosing it changes nothing', async () => {
    const same = record('own-same', 'rain_jacket', closetSolidForBoardSwatch(drawn.outer_layer!));
    const { result } = await renderDetail(language, [same]);
    await fireEvent.press(result.getByTestId('outfit-detail-change-outer_layer'));
    expect(result.getByTestId('piece-picker-current-own-own-same')).toBeOnTheScreen();
    expect(result.queryByTestId('piece-picker-current-rain_jacket')).toBeNull();
    await fireEvent.press(result.getByTestId('piece-picker-own-own-same'));
    await afterSheet();
    expect(result.queryByTestId('outfit-detail-reset-button')).toBeNull();
    expect(result.getByTestId('outfit-detail-generation-source'))
      .toHaveTextContent(messages[language].today.generationSourceDeterministic);
  });

  test('Add a layer lists the owned pieces of the chosen layer, and one adds it in its colour', async () => {
    const { result, onWoreThis } = await renderDetail(language, [rainJacket, sweater]);
    // With the outer layer off too, both layers are free and the group follows the tab.
    await fireEvent(result.getByTestId('outfit-detail-board-piece-outer_layer'), 'accessibilityAction',
      { nativeEvent: { actionName: 'takeOff' } });
    await fireEvent.press(within(result.getByTestId('outfit-detail-add-layer')).getByRole('button'));
    expect(groups(result)[0]).toBe('yours');
    expect(ownRows(result)).toEqual(['own-mid']);
    const tabs = within(result.getByTestId('piece-picker-tabs'));
    await fireEvent.press(tabs.getByLabelText(messages[language].today.slots.outer_layer));
    expect(ownRows(result)).toEqual(['own-rain']);
    await fireEvent.press(tabs.getByLabelText(messages[language].today.slots.mid_layer));

    await fireEvent.press(result.getByTestId('piece-picker-own-own-mid'));
    await afterSheet();
    expect(result.getByTestId('outfit-detail-board-piece-mid_layer')).toBeOnTheScreen();
    expect(result.getByTestId(`outfit-detail-piece-added-${midType}`, hidden)).toHaveTextContent(copy.added);
    expect(result.getByTestId(`outfit-detail-name-marker-${midType}-owned`, hidden)).toBeOnTheScreen();
    await fireEvent.press(result.getByTestId('outfit-detail-wore-this'));
    expect(onWoreThis.mock.calls.at(-1)?.[0]).toMatchObject({ mid_layer: 'plum' });
  });

  test('the group is absent when nothing in the Closet fits the slot', async () => {
    const { result } = await renderDetail(language, [wantedCoat, jeans]);
    await fireEvent.press(result.getByTestId('outfit-detail-change-outer_layer'));
    expect(result.queryByTestId('piece-picker-yours')).toBeNull();
    expect(groups(result)[0]).toBe('fits');
    await fireEvent.press(result.getByTestId('piece-picker-close'));
    await afterSheet();
    await fireEvent.press(within(result.getByTestId('outfit-detail-add-layer')).getByRole('button'));
    expect(result.queryByTestId('piece-picker-yours')).toBeNull();
  });
});
