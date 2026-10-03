import { fireEvent, render } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { Dimensions, StyleSheet } from 'react-native';
import * as Reanimated from 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { structuralCategories } from '@/features/catalog/domain/garment-taxonomy';
import { ProfileScreen } from '@/features/profile/presentation/profile-screen';
import { TourTargetRegistry } from '@/features/walkthrough/application/tour-target-registry';
import { TourTargetsContext } from '@/features/walkthrough/application/walkthrough-context';
import {
  WardrobeApplicationContext,
  type WardrobeApplicationValue,
} from '@/features/wardrobe/application/wardrobe-application-context';
import type { WardrobeItem } from '@/features/wardrobe/domain/wardrobe-item';
import { LocalizationContext } from '@/localization/localization-context';
import { messages } from '@/localization/messages';
import { darkTheme, lightTheme, type KuyaraTheme } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

jest.mock('expo-symbols', () => ({
  SymbolView: () => null,
}));

const initialMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, right: 0, bottom: 34, left: 0 },
};

const originalWindowDimensions = Dimensions.get('window');

// See list-row.component.test.tsx: `useWindowDimensions` seeds from `Dimensions.get`, so
// this must be set before render rather than mocking the exported hook.
function mockFontScale(fontScale: number) {
  Dimensions.set({ window: { ...originalWindowDimensions, fontScale } });
}

afterEach(() => {
  Dimensions.set({ window: originalWindowDimensions });
});

const baseItem: WardrobeItem = {
  id: '118f0f4d-1d45-4ae7-a8f1-796e8297d3b4',
  localProfileId: '018f0f4d-1d45-4ae7-a8f1-796e8297d3b4',
  name: 'City shell',
  category: 'outerwear',
  entryState: 'owned',
  garmentTypeId: 'rain_jacket',
  color: null,
  colorFamily: 'blue',
  thermalLevelOverride: null,
  waterProtectionOverride: null,
  windProtectionOverride: null,
  breathabilityOverride: null,
  armCoverageOverride: null,
  legCoverageOverride: null,
  tractionSuitabilityOverride: null,
  photoRelativePath: null,
  createdAt: '2026-07-30T10:00:00.000Z',
  updatedAt: '2026-07-30T10:05:00.000Z',
  deletedAt: null,
};

function application(
  items: readonly WardrobeItem[],
  status: 'ready' | 'loading' | 'error' = 'ready',
): WardrobeApplicationValue {
  return {
    state:
      status === 'ready'
        ? {
            status: 'ready',
            items,
            isRefreshing: false,
            isMutating: false,
            refreshFailure: null,
          }
        : { status },
    refresh: async () => undefined,
    getItem: async () => null,
    preparePhoto: async () => null,
    discardStagedPhoto: async () => undefined,
    resolvePhotoUri: () => null,
    createItem: async () => baseItem,
    updateItem: async () => baseItem,
    softDeleteItem: async () => baseItem,
    seedEmptyCloset: async () => [],
  };
}

function TestProviders({
  children,
  items,
  status,
  resolvePhotoUri,
  language = 'en',
  theme = lightTheme,
}: PropsWithChildren<{
  items: readonly WardrobeItem[];
  status?: 'ready' | 'loading' | 'error';
  resolvePhotoUri?: WardrobeApplicationValue['resolvePhotoUri'];
  language?: 'en' | 'tr';
  theme?: KuyaraTheme;
}>) {
  return (
    <WardrobeApplicationContext.Provider value={{ ...application(items, status), ...(resolvePhotoUri ? { resolvePhotoUri } : {}) }}>
      <LocalizationContext.Provider value={{ language, messages: messages[language], hour12: false }}>
        <KuyaraThemeContext.Provider value={theme}>
          <SafeAreaProvider initialMetrics={initialMetrics}>
            {children}
          </SafeAreaProvider>
        </KuyaraThemeContext.Provider>
      </LocalizationContext.Provider>
    </WardrobeApplicationContext.Provider>
  );
}

function itemWithId(id: string, overrides: Partial<WardrobeItem> = {}): WardrobeItem {
  return { ...baseItem, id, ...overrides };
}

test('the Closet heading counts both entry states and opens the closet with no filter', async () => {
  mockFontScale(1);
  const onOpenWardrobe = jest.fn();
  const result = await render(
    <TestProviders
      items={[
        baseItem,
        itemWithId('218f0f4d-1d45-4ae7-a8f1-796e8297d3b4'),
        itemWithId('318f0f4d-1d45-4ae7-a8f1-796e8297d3b4', { entryState: 'wanted' }),
      ]}>
      <ProfileScreen onAddPiece={() => undefined} onOpenCategory={() => undefined} onOpenHistory={() => undefined}

        onOpenWardrobe={onOpenWardrobe}

      />
    </TestProviders>,
  );

  // Two owned plus one wanted: the heading counts the Closet, not one of its states.
  expect(result.getByTestId('profile-closet-heading-count')).toHaveTextContent('3');
  await fireEvent.press(result.getByTestId('profile-closet-heading'));
  expect(onOpenWardrobe).toHaveBeenCalledWith();
});

test.each([
  [1, 'row', false],
  [3.12, 'column', true],
] as const)(
  'the Closet heading at fontScale %s uses a %s layout without changing its accessible control',
  async (fontScale, flexDirection, stacked) => {
    mockFontScale(fontScale);
    const result = await render(
      <TestProviders items={[baseItem]}>
        <ProfileScreen onAddPiece={() => undefined} onOpenCategory={() => undefined} onOpenHistory={() => undefined}

          onOpenWardrobe={() => undefined}

        />
      </TestProviders>,
    );

    const heading = result.getByTestId('profile-closet-heading');
    expect(StyleSheet.flatten(heading.props.style)).toMatchObject({ flexDirection });
    expect(Boolean(result.queryByTestId('profile-closet-heading-title-row'))).toBe(stacked);
    expect(heading.props.accessibilityLabel).toBe(
      messages.en.profile.closetHeadingAccessibilityLabel({ count: 1 }),
    );
    expect(heading.props.accessibilityHint).toBe(messages.en.profile.closetHeadingHint);
    expect(result.getByTestId('profile-closet-heading-count')).toHaveTextContent('1');
  },
);

test('the rack is one button whose label names the Closet and its pieces by category', async () => {
  mockFontScale(1);
  const onOpenWardrobe = jest.fn();
  const result = await render(
    <TestProviders
      items={[
        baseItem,
        itemWithId('218f0f4d-1d45-4ae7-a8f1-796e8297d3b4', { category: 'top', garmentTypeId: 't_shirt' }),
        itemWithId('318f0f4d-1d45-4ae7-a8f1-796e8297d3b4', { category: 'top', garmentTypeId: 'shirt', entryState: 'wanted' }),
      ]}>
      <ProfileScreen onAddPiece={() => undefined}
        displayName="Deniz"
        onOpenCategory={() => undefined}
        onOpenHistory={() => undefined}
        onOpenWardrobe={onOpenWardrobe}
      />
    </TestProviders>,
  );

  const rack = result.getByTestId('profile-rack');
  expect(rack.props.accessibilityRole).toBe('button');
  // Catalogue order, and only the categories that hold something.
  expect(rack.props.accessibilityLabel).toBe('Deniz’s Closet, 3 pieces: Tops 2, Outerwear 1.');
  expect(rack.props.accessibilityHint).toBe(messages.en.profile.closetHeadingHint);
  await fireEvent.press(rack);
  expect(onOpenWardrobe).toHaveBeenCalledWith();
});

test('six category cells always show, counting owned plus wanted, and a cell opens its category', async () => {
  mockFontScale(1);
  const onOpenCategory = jest.fn();
  const result = await render(
    <TestProviders
      items={[
        baseItem,
        itemWithId('218f0f4d-1d45-4ae7-a8f1-796e8297d3b4', { category: 'top', garmentTypeId: 't_shirt' }),
        itemWithId('318f0f4d-1d45-4ae7-a8f1-796e8297d3b4', { category: 'top', garmentTypeId: 'shirt', entryState: 'wanted' }),
      ]}>
      <ProfileScreen onAddPiece={() => undefined} onOpenCategory={onOpenCategory} onOpenHistory={() => undefined} onOpenWardrobe={() => undefined} />
    </TestProviders>,
  );

  const expected = { top: 2, bottom: 0, one_piece: 0, outerwear: 1, footwear: 0, accessory: 0 } as const;
  for (const [category, count] of Object.entries(expected)) {
    expect(result.getByTestId(`profile-category-${category}-count`)).toHaveTextContent(String(count));
  }
  const tops = result.getByTestId('profile-category-top');
  expect(tops.props.accessibilityRole).toBe('button');
  expect(tops.props.accessibilityLabel).toBe('Tops, 2 pieces, 1 wanted.');
  expect(result.getByTestId('profile-category-outerwear').props.accessibilityLabel).toBe('Outerwear, 1 piece.');
  expect(result.getByTestId('profile-category-footwear').props.accessibilityLabel).toBe('Shoes, 0 pieces.');
  await fireEvent.press(result.getByTestId('profile-category-footwear'));
  expect(onOpenCategory).toHaveBeenCalledWith('footwear');
});

// In dark only a category holding pieces stands on the light garment plate; an empty one
// keeps the dark muted tile. In light the two fills are the same colour.
test.each([
  [darkTheme, darkTheme.colors.garmentTile, darkTheme.colors.surfaceMuted],
  [lightTheme, lightTheme.colors.garmentTile, lightTheme.colors.garmentTile],
] as const)('a filled category stands on the plate and an empty one stays muted', async (theme, filled, empty) => {
  mockFontScale(1);
  const result = await render(
    <TestProviders items={[baseItem]} theme={theme}>
      <ProfileScreen onAddPiece={() => undefined} onOpenCategory={() => undefined} onOpenHistory={() => undefined} onOpenWardrobe={() => undefined} />
    </TestProviders>,
  );
  const fill = (category: string) =>
    StyleSheet.flatten(result.getByTestId(`profile-category-${category}-tile`).props.style).backgroundColor;
  expect(fill('outerwear')).toBe(filled);
  expect(fill('footwear')).toBe(empty);
});

test.each([
  [1, 3],
  [1.353, 2],
] as const)('at fontScale %s the category cells sit in %s columns', async (fontScale, columns) => {
  mockFontScale(fontScale);
  const result = await render(
    <TestProviders items={[baseItem]}>
      <ProfileScreen onAddPiece={() => undefined} onOpenCategory={() => undefined} onOpenHistory={() => undefined} onOpenWardrobe={() => undefined} />
    </TestProviders>,
  );

  const rows = result.getByTestId('profile-category-cells').props.children;
  expect(rows).toHaveLength(6 / columns);
  for (const row of rows) {
    expect(row.props.children).toHaveLength(columns);
  }
});

// A mens profile with no one-piece record offers five categories: the last row keeps the
// grid's column width with a spacer nobody can reach, and each cell keeps its arrival place.
test.each([
  [1, [3, 2]],
  [1.353, [2, 2, 1]],
] as const)('five categories at fontScale %s sit in rows of %j with an unreachable spacer', async (fontScale, rowSizes) => {
  mockFontScale(fontScale);
  const fiveCategories = structuralCategories.filter((category) => category !== 'one_piece');
  const result = await render(
    <TestProviders items={[baseItem]}>
      <ProfileScreen categories={fiveCategories} onAddPiece={() => undefined} onOpenCategory={() => undefined} onOpenHistory={() => undefined} onOpenWardrobe={() => undefined} />
    </TestProviders>,
  );

  expect(result.queryByTestId('profile-category-one_piece')).toBeNull();
  const columns = rowSizes[0];
  const rows: { props: { children: { key: string; props: { index?: number } }[] } }[] =
    result.getByTestId('profile-category-cells').props.children;
  expect(rows.map((row) => row.props.children.filter((child) => !child.key.startsWith('spacer')).length))
    .toEqual(rowSizes);
  // Every row holds the same number of slots, so the columns line up.
  for (const row of rows) {
    expect(row.props.children).toHaveLength(columns);
  }
  const arrival = rows.flatMap((row) =>
    row.props.children.filter((child) => !child.key.startsWith('spacer')).map((child) => [child.key, child.props.index]),
  );
  expect(arrival).toEqual(fiveCategories.map((category, index) => [category, 2 + index]));

  expect(result.queryByTestId('profile-category-spacer')).toBeNull();
  const spacer = result.getByTestId('profile-category-spacer', { includeHiddenElements: true });
  expect(spacer.props.accessibilityElementsHidden).toBe(true);
  expect(spacer.props.importantForAccessibility).toBe('no-hide-descendants');
  expect(spacer.props.pointerEvents).toBe('none');
  expect(spacer.props.accessible).not.toBe(true);
  expect(spacer.props.onPress).toBeUndefined();
});

test('six categories need no spacer and keep their arrival places', async () => {
  mockFontScale(1);
  const result = await render(
    <TestProviders items={[baseItem]}>
      <ProfileScreen onAddPiece={() => undefined} onOpenCategory={() => undefined} onOpenHistory={() => undefined} onOpenWardrobe={() => undefined} />
    </TestProviders>,
  );

  expect(result.queryByTestId('profile-category-spacer', { includeHiddenElements: true })).toBeNull();
  const rows: { props: { children: { key: string; props: { index?: number } }[] } }[] =
    result.getByTestId('profile-category-cells').props.children;
  expect(rows.flatMap((row) => row.props.children.map((child) => [child.key, child.props.index])))
    .toEqual(structuralCategories.map((category, index) => [category, 2 + index]));
});

test('the empty Closet shows the empty rack, the sentence and the Add a piece action, and hides the Wanted row', async () => {
  mockFontScale(1);
  const onOpenWardrobe = jest.fn();
  const onAddPiece = jest.fn();
  const result = await render(
    <TestProviders items={[]}>
      <ProfileScreen onOpenCategory={() => undefined} onOpenHistory={() => undefined}
        onAddPiece={onAddPiece}
        onOpenWardrobe={onOpenWardrobe}

      />
    </TestProviders>,
  );

  expect(result.getByText(messages.en.profile.wardrobeEmpty)).toBeOnTheScreen();
  // The empty rack keeps its place; a row of zeros is what ADR 0028 removed, so no cells.
  expect(result.getByTestId('profile-rack').props.accessibilityLabel).toBe('Closet, 0 pieces.');
  expect(result.queryByTestId('profile-category-cells')).toBeNull();
  expect(result.queryByTestId('profile-wanted-row')).toBeNull();
  // The empty state's Add a piece opens the add form, not the Closet list.
  await fireEvent.press(result.getByTestId('profile-add-piece-button'));
  expect(onAddPiece).toHaveBeenCalledTimes(1);
  expect(onOpenWardrobe).not.toHaveBeenCalled();
});

test('the Turkish empty Closet wraps its text within the window at fontScale 3.1', async () => {
  mockFontScale(3.1);
  const result = await render(
    <TestProviders items={[]} language="tr">
      <ProfileScreen onAddPiece={() => undefined} onOpenCategory={() => undefined} onOpenHistory={() => undefined} displayName="Utku" onOpenWardrobe={() => undefined} />
    </TestProviders>,
  );

  const windowWidth = Dimensions.get('window').width;
  const screenContentStyle = StyleSheet.flatten(
    result.getByTestId('profile-screen').props.contentContainerStyle,
  );
  expect(Dimensions.get('window').fontScale).toBe(3.1);
  expect(screenContentStyle?.width).toBe('100%');

  const heading = result.getByTestId('profile-closet-heading');
  const headingStyle = StyleSheet.flatten(heading.props.style);
  expect(headingStyle?.flexDirection).toBe('column');
  expect(headingStyle?.height).toBeUndefined();
  expect(result.getByTestId('profile-closet-heading-title-row')).toBeOnTheScreen();

  const textNodes = [
    result.getByText(messages.tr.profile.wardrobeTitleNamed('Utku')),
    result.getByTestId('profile-closet-heading-count'),
    result.getByText(messages.tr.profile.wardrobeEmpty),
    result.getByText(messages.tr.profile.addPieceAction, { includeHiddenElements: true }),
  ];

  for (const node of textNodes) {
    const style = StyleSheet.flatten(node.props.style);
    expect(node.props.numberOfLines).not.toBe(1);
    expect(style).toMatchObject({ flexShrink: 1, maxWidth: '100%', minWidth: 0 });
    if (typeof style?.width === 'number') {
      expect(style.width).toBeLessThanOrEqual(windowWidth);
    }
  }

  expect(result.getByTestId('profile-closet-heading-count')).toHaveTextContent('0');
});

test('a wanted-only closet counts its pieces and keeps the rack and the cells', async () => {
  mockFontScale(1);
  const onOpenWardrobe = jest.fn();
  const result = await render(
    <TestProviders items={[itemWithId(baseItem.id, { entryState: 'wanted' })]}>
      <ProfileScreen onAddPiece={() => undefined} onOpenCategory={() => undefined} onOpenHistory={() => undefined}

        onOpenWardrobe={onOpenWardrobe}

      />
    </TestProviders>,
  );

  // The empty state needs both lists empty, so a wanted-only Closet keeps its rack, its
  // cells and a count rather than reading zero beside nothing at all.
  expect(result.getByTestId('profile-rack')).toBeOnTheScreen();
  expect(result.getByTestId('profile-category-outerwear-count')).toHaveTextContent('1');
  expect(result.getByTestId('profile-closet-heading-count')).toHaveTextContent('1');
  expect(result.queryByText(messages.en.profile.wardrobeEmpty)).toBeNull();
  const wantedRow = result.getByTestId('profile-wanted-row');
  expect(wantedRow.props.accessibilityLabel).toBe(`${messages.en.profile.wantedLabel}, 1`);
  await fireEvent.press(wantedRow);
  expect(onOpenWardrobe).toHaveBeenCalledWith('wanted');
});

// ADR 0028 section 1 hides the row only while nothing exists in either state, so an
// owned-only Closet still reports its zero.
test('an owned-only closet keeps the Wanted row at zero', async () => {
  mockFontScale(1);
  const onOpenWardrobe = jest.fn();
  const result = await render(
    <TestProviders items={[baseItem]}>
      <ProfileScreen onAddPiece={() => undefined} onOpenCategory={() => undefined} onOpenHistory={() => undefined}

        onOpenWardrobe={onOpenWardrobe}

      />
    </TestProviders>,
  );

  const wantedRow = result.getByTestId('profile-wanted-row');
  expect(wantedRow.props.accessibilityLabel).toBe(`${messages.en.profile.wantedLabel}, 0`);
  await fireEvent.press(wantedRow);
  expect(onOpenWardrobe).toHaveBeenCalledWith('wanted');
});

test('Profile removes the location row and its History row opens History', async () => {
  const onOpenHistory = jest.fn();
  const result = await render(
    <TestProviders items={[baseItem]}>
      <ProfileScreen onAddPiece={() => undefined} onOpenCategory={() => undefined} onOpenHistory={onOpenHistory} onOpenWardrobe={() => undefined} />
    </TestProviders>,
  );
  expect(result.queryByTestId('profile-location-row')).toBeNull();
  const history = result.getByTestId('profile-history-row');
  expect(history.props.accessibilityRole).toBe('button');
  expect(history.props.accessibilityLabel).toBe(messages.en.profile.historyLabel);
  await fireEvent.press(history);
  expect(onOpenHistory).toHaveBeenCalledTimes(1);
});

test('the Closet heading uses the name while the rest of Profile stays the same', async () => {
  const result = await render(
    <TestProviders items={[baseItem]}>
      <ProfileScreen onAddPiece={() => undefined} onOpenCategory={() => undefined} onOpenHistory={() => undefined} displayName="Utku" onOpenWardrobe={() => undefined} />
    </TestProviders>,
  );
  expect(result.getByText('Utku’s Closet')).toBeOnTheScreen();
  expect(result.getByTestId('profile-closet-heading').props.accessibilityLabel)
    .toBe('Utku’s Closet, 1 piece.');
});

test('Turkish keeps the name unchanged in the Closet heading at large text size', async () => {
  mockFontScale(3.12);
  const result = await render(
    <TestProviders items={[baseItem]} language="tr">
      <ProfileScreen onAddPiece={() => undefined} onOpenCategory={() => undefined} onOpenHistory={() => undefined} displayName="Utku" onOpenWardrobe={() => undefined} />
    </TestProviders>,
  );
  expect(result.getByText('Gardırop · Utku')).toBeOnTheScreen();
  expect(result.getByTestId('profile-closet-heading').props.accessibilityLabel)
    .toBe('Gardırop · Utku, 1 parça.');
});

test('a loading Closet shows the bare rack and the six cells without counts, spoken as loading', async () => {
  mockFontScale(1);
  const result = await render(
    <TestProviders items={[]} status="loading">
      <ProfileScreen onAddPiece={() => undefined} onOpenCategory={() => undefined} onOpenHistory={() => undefined} onOpenWardrobe={() => undefined} />
    </TestProviders>,
  );

  const rack = result.getByTestId('profile-rack', { includeHiddenElements: true });
  expect(rack.props.accessibilityRole).toBeUndefined();
  const cells = result.getByTestId('profile-category-cells-loading');
  expect(cells.props.accessibilityRole).toBe('progressbar');
  expect(cells.props.accessibilityLabel).toBe(messages.en.wardrobe.loadingLabel);
  expect(result.queryByTestId('profile-category-top-count', { includeHiddenElements: true })).toBeNull();
  expect(result.queryByTestId('profile-closet-heading-count')).toBeNull();
  expect(result.queryByTestId('profile-wanted-row')).toBeNull();
  expect(result.getByTestId('profile-history-row')).toBeOnTheScreen();
});

test('the Closet heading speaks no count while the Closet is loading or failed to load', async () => {
  mockFontScale(1);
  const loading = await render(
    <TestProviders items={[]} status="loading">
      <ProfileScreen onAddPiece={() => undefined} onOpenCategory={() => undefined} onOpenHistory={() => undefined} onOpenWardrobe={() => undefined} />
    </TestProviders>,
  );
  expect(loading.getByTestId('profile-closet-heading').props.accessibilityLabel)
    .toBe(messages.en.profile.wardrobeTitle);

  const failed = await render(
    <TestProviders items={[]} status="error">
      <ProfileScreen onAddPiece={() => undefined} onOpenCategory={() => undefined} onOpenHistory={() => undefined} onOpenWardrobe={() => undefined} />
    </TestProviders>,
  );
  expect(failed.getByTestId('profile-closet-heading').props.accessibilityLabel)
    .toBe(messages.en.profile.wardrobeTitle);
});

test('a Closet that cannot load shows the bare rack and a retry that refreshes it', async () => {
  mockFontScale(1);
  const refresh = jest.fn(async () => undefined);
  const result = await render(
    <WardrobeApplicationContext.Provider value={{ ...application([], 'error'), refresh }}>
      <LocalizationContext.Provider value={{ language: 'en', messages: messages.en, hour12: false }}>
        <KuyaraThemeContext.Provider value={lightTheme}>
          <SafeAreaProvider initialMetrics={initialMetrics}>
            <ProfileScreen onAddPiece={() => undefined} onOpenCategory={() => undefined} onOpenHistory={() => undefined} onOpenWardrobe={() => undefined} />
          </SafeAreaProvider>
        </KuyaraThemeContext.Provider>
      </LocalizationContext.Provider>
    </WardrobeApplicationContext.Provider>,
  );

  expect(result.getByText(messages.en.wardrobe.loadErrorTitle)).toBeOnTheScreen();
  expect(result.queryByTestId('profile-category-cells')).toBeNull();
  expect(result.queryByTestId('profile-wanted-row')).toBeNull();
  await fireEvent.press(result.getByTestId('profile-closet-retry-button'));
  expect(refresh).toHaveBeenCalledTimes(1);
});

// ADR 0025 gives the accessories their own silhouettes, so an accessory draws like any
// typed garment; a legacy entry without a type and an empty category draw the category glyph.
test('a cell draws its newest owned piece, and a legacy or empty category its glyph', async () => {
  const accessory = itemWithId('accessory', { garmentTypeId: 'beanie', category: 'accessory' });
  const legacy = itemWithId('legacy', { garmentTypeId: null, category: 'top' });
  const result = await render(
    <TestProviders items={[baseItem, accessory, legacy]}>
      <ProfileScreen onAddPiece={() => undefined} onOpenCategory={() => undefined} onOpenHistory={() => undefined} onOpenWardrobe={() => undefined} />
    </TestProviders>,
  );
  const hidden = { includeHiddenElements: true };
  expect(result.getByTestId('profile-category-outerwear-drawing', hidden)).toBeOnTheScreen();
  expect(result.getByTestId('profile-category-accessory-drawing', hidden)).toBeOnTheScreen();
  expect(result.queryByTestId('profile-category-top-drawing', hidden)).toBeNull();
  expect(result.queryByTestId('profile-category-footwear-drawing', hidden)).toBeNull();
});

// Phase 8: Profile offers the tour its Closet heading, rack and History row, unchanged.
test('Profile registers the Closet heading, the rack and the History row for the tour', async () => {
  const registry = new TourTargetRegistry();
  const onOpenHistory = jest.fn();
  const result = await render(
    <TestProviders items={[baseItem]}>
      <TourTargetsContext value={registry}>
        <ProfileScreen onAddPiece={() => undefined} onOpenCategory={() => undefined} onOpenHistory={onOpenHistory} onOpenWardrobe={() => undefined} />
      </TourTargetsContext>
    </TestProviders>,
  );
  expect(['closet-head', 'rack', 'history'].map((id) => registry.has(id as 'rack'))).toEqual([true, true, true]);
  expect(registry.get('history')?.reveal).toEqual(expect.any(Function));
  await fireEvent.press(result.getByTestId('profile-history-row'));
  expect(onOpenHistory).toHaveBeenCalledTimes(1);
});

// Law 7: Profile's heading, rack, cells and rows arrive once, in reading order; the Closet
// finishing its load swaps the cells inside their block without replaying the arrival.
// Two calls per arrival (the fade and the travel), one stagger step apart: the heading, the
// rack, the six category cells one by one, then the rows, the wait capped at deliberate.
const arrivalDelays = Array.from({ length: 9 }, (_, index) => (
  Math.min(index * lightTheme.motion.stagger, lightTheme.motion.deliberate)
)).flatMap((delay) => [delay, delay]);

test('Profile content arrives in reading order and a load does not replay it', async () => {
  mockFontScale(1);
  const withDelay = jest.spyOn(Reanimated, 'withDelay');
  const screen = (status: 'ready' | 'loading') => (
    <TestProviders items={[baseItem]} status={status}>
      <ProfileScreen onAddPiece={() => undefined} onOpenCategory={() => undefined}
        onOpenHistory={() => undefined} onOpenWardrobe={() => undefined} />
    </TestProviders>
  );
  const result = await render(screen('loading'));
  const delays = () => withDelay.mock.calls.map(([delay]) => delay);
  expect(delays()).toEqual(arrivalDelays);

  withDelay.mockClear();
  await result.rerender(screen('ready'));
  expect(result.getByTestId('profile-category-cells')).toBeOnTheScreen();
  expect(withDelay).not.toHaveBeenCalled();
  withDelay.mockRestore();
});

// The Profile tab mounts at launch, before it is shown. Its content waits at the start and
// arrives on the first showing; leaving the tab and coming back never replays it.
test('Profile content arrives when the tab is first shown, and only then', async () => {
  mockFontScale(1);
  const withDelay = jest.spyOn(Reanimated, 'withDelay');
  const screen = (shown: boolean) => (
    <TestProviders items={[baseItem]} status="ready">
      <ProfileScreen onAddPiece={() => undefined} onOpenCategory={() => undefined}
        onOpenHistory={() => undefined} onOpenWardrobe={() => undefined} shown={shown} />
    </TestProviders>
  );
  const result = await render(screen(false));
  expect(withDelay).not.toHaveBeenCalled();

  await result.rerender(screen(true));
  expect(withDelay.mock.calls.map(([delay]) => delay)).toEqual(arrivalDelays);

  withDelay.mockClear();
  await result.rerender(screen(false));
  await result.rerender(screen(true));
  expect(withDelay).not.toHaveBeenCalled();
  withDelay.mockRestore();
});
