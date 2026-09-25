import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { Dimensions, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { WardrobeApplicationState } from '@/features/wardrobe/application/wardrobe-application-controller';
import type { WardrobeItem } from '@/features/wardrobe/domain/wardrobe-item';
import {
  WardrobeListScreen,
  buildCategoryRows,
  resolveDefaultCategory,
  resolveGridGeometry,
  tileEntranceIndex,
} from '@/features/wardrobe/presentation/wardrobe-list-screen';
import { LocalizationContext } from '@/localization/localization-context';
import { messages, type SupportedLanguage } from '@/localization/messages';
import { lightTheme } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

jest.mock('expo-symbols', () => ({
  SymbolView: () => null,
}));

const initialMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, right: 0, bottom: 34, left: 0 },
};

const originalWindowDimensions = Dimensions.get('window');

afterEach(() => {
  Dimensions.set({ window: originalWindowDimensions });
});

const ownedItem: WardrobeItem = {
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

const wantedItem: WardrobeItem = {
  ...ownedItem,
  id: '218f0f4d-1d45-4ae7-a8f1-796e8297d3b4',
  name: null,
  entryState: 'wanted',
  category: 'footwear',
  garmentTypeId: 'weather_boots',
};

const legacyItem: WardrobeItem = {
  ...ownedItem,
  id: '318f0f4d-1d45-4ae7-a8f1-796e8297d3b4',
  name: null,
  garmentTypeId: null,
  category: 'top',
};

function TestProviders({
  children,
  language = 'en',
}: PropsWithChildren<{ language?: SupportedLanguage }>) {
  return (
    <LocalizationContext.Provider value={{ language, messages: messages[language], hour12: false }}>
      <KuyaraThemeContext.Provider value={lightTheme}>
        <SafeAreaProvider initialMetrics={initialMetrics}>{children}</SafeAreaProvider>
      </KuyaraThemeContext.Provider>
    </LocalizationContext.Provider>
  );
}

function readyState(items: readonly WardrobeItem[], overrides: Partial<Extract<WardrobeApplicationState, { status: 'ready' }>> = {}): WardrobeApplicationState {
  return {
    status: 'ready',
    items,
    isRefreshing: false,
    isMutating: false,
    refreshFailure: null,
    ...overrides,
  };
}

test('loading state exposes an accessible progressbar and no artwork', async () => {
  const result = await render(
    <TestProviders>
      <WardrobeListScreen
        onAdd={() => undefined}
        onEdit={() => undefined}
        onRetry={() => undefined}
        state={{ status: 'loading' }}
      />
    </TestProviders>,
  );

  const loading = result.getByTestId('wardrobe-loading');
  expect(loading.props.accessibilityRole).toBe('progressbar');
  expect(result.getByLabelText(messages.en.wardrobe.loadingLabel)).toBeOnTheScreen();
});

test('error state retries and shows no category tabs', async () => {
  const onRetry = jest.fn();
  const result = await render(
    <TestProviders>
      <WardrobeListScreen
        onAdd={() => undefined}
        onEdit={() => undefined}
        onRetry={onRetry}
        state={{ status: 'error' }}
      />
    </TestProviders>,
  );

  expect(result.getByTestId('wardrobe-load-error')).toBeOnTheScreen();
  expect(result.getByText(messages.en.wardrobe.loadErrorTitle)).toBeOnTheScreen();
  expect(result.queryByTestId('wardrobe-category-tabs')).not.toBeOnTheScreen();
  await fireEvent.press(result.getByTestId('wardrobe-retry-button'));
  expect(onRetry).toHaveBeenCalledTimes(1);
  expect(onRetry).toHaveBeenCalledWith('retry_button');
});

test('an empty Closet opens on the first category, says it is empty and adds into it', async () => {
  const onAdd = jest.fn();
  const result = await render(
    <TestProviders>
      <WardrobeListScreen
        onAdd={onAdd}
        onEdit={() => undefined}
        onRetry={() => undefined}
        state={readyState([])}
      />
    </TestProviders>,
  );

  expect(result.getByText(messages.en.wardrobe.categoryEmpty.top)).toBeOnTheScreen();
  expect(result.getByTestId('wardrobe-category-tab-top').props.accessibilityState.selected).toBe(true);
  await fireEvent.press(
    result.getByRole('button', { name: messages.en.profile.addPieceAction }),
  );
  expect(onAdd).toHaveBeenCalledWith('top');
});

test('an empty category page names its own category and adds into it', async () => {
  const onAdd = jest.fn();
  const result = await render(
    <TestProviders language="tr">
      <WardrobeListScreen
        initialCategory="one_piece"
        onAdd={onAdd}
        onEdit={() => undefined}
        onRetry={() => undefined}
        state={readyState([ownedItem])}
      />
    </TestProviders>,
  );

  expect(result.getByText(messages.tr.wardrobe.categoryEmpty.one_piece)).toBeOnTheScreen();
  expect(result.queryByTestId(`wardrobe-item-${ownedItem.id}`)).not.toBeOnTheScreen();
  await fireEvent.press(result.getByTestId('wardrobe-empty-add-button'));
  expect(onAdd).toHaveBeenCalledWith('one_piece');
});

test('owned and wanted are sections of one category page, owned first, each with its count', async () => {
  const ownedShoe = { ...wantedItem, id: '418f0f4d-1d45-4ae7-a8f1-796e8297d3b4', entryState: 'owned' as const };
  const result = await render(
    <TestProviders>
      <WardrobeListScreen
        initialCategory="footwear"
        onAdd={() => undefined}
        onEdit={() => undefined}
        onRetry={() => undefined}
        state={readyState([ownedItem, wantedItem, ownedShoe])}
      />
    </TestProviders>,
  );

  const owned = result.getByTestId('wardrobe-section-owned');
  const wanted = result.getByTestId('wardrobe-section-wanted');
  expect(owned.props.accessibilityRole).toBe('header');
  expect(owned.props.accessibilityLabel).toBe('Owned, 1');
  expect(wanted.props.accessibilityLabel).toBe('Wanted, 1');
  expect(result.getByTestId(`wardrobe-item-${ownedShoe.id}`)).toBeOnTheScreen();
  expect(result.getByTestId(`wardrobe-item-${wantedItem.id}`)).toBeOnTheScreen();
  // The outerwear piece belongs to another page.
  expect(result.queryByTestId(`wardrobe-item-${ownedItem.id}`)).not.toBeOnTheScreen();
});

test('a wanted tile has no stage fill, a dashed frame, a heart badge and says Wanted', async () => {
  const result = await render(
    <TestProviders>
      <WardrobeListScreen
        initialCategory="footwear"
        onAdd={() => undefined}
        onEdit={() => undefined}
        onRetry={() => undefined}
        state={readyState([wantedItem])}
      />
    </TestProviders>,
  );

  const frame = StyleSheet.flatten(result.getByTestId(`wardrobe-item-${wantedItem.id}-frame`).props.style);
  expect(frame.borderStyle).toBe('dashed');
  expect(frame.backgroundColor).toBeUndefined();
  expect(result.getByTestId(`wardrobe-item-${wantedItem.id}-wanted-badge`, { includeHiddenElements: true }))
    .toBeOnTheScreen();
  expect(result.getByTestId(`wardrobe-item-${wantedItem.id}`).props.accessibilityLabel)
    .toBe(`${messages.en.catalog['catalog.garment_type.weather_boots.name']}. Wanted`);
});

test('a named item shows its own name and the type as the subline', async () => {
  const result = await render(
    <TestProviders language="tr">
      <WardrobeListScreen
        onAdd={() => undefined}
        onEdit={() => undefined}
        onRetry={() => undefined}
        state={readyState([ownedItem])}
      />
    </TestProviders>,
  );

  expect(result.getByText('City shell')).toBeOnTheScreen();
  expect(result.getByText('Yağmurluk')).toBeOnTheScreen();
});

test('a legacy row with no type shows the category and explains the missing type', async () => {
  const result = await render(
    <TestProviders>
      <WardrobeListScreen
        onAdd={() => undefined}
        onEdit={() => undefined}
        onRetry={() => undefined}
        state={readyState([legacyItem])}
      />
    </TestProviders>,
  );

  expect(
    result.getByText(messages.en.catalog['catalog.attribute.structural_category.top']),
  ).toBeOnTheScreen();
  expect(result.getByText(messages.en.wardrobe.unclassifiedType)).toBeOnTheScreen();
});

test('selecting a tile emits the edit intent', async () => {
  const onEdit = jest.fn();
  const result = await render(
    <TestProviders>
      <WardrobeListScreen
        onAdd={() => undefined}
        onEdit={onEdit}
        onRetry={() => undefined}
        state={readyState([ownedItem])}
      />
    </TestProviders>,
  );

  await fireEvent.press(result.getByTestId(`wardrobe-item-${ownedItem.id}`));
  expect(onEdit).toHaveBeenCalledWith(ownedItem.id);
});

test('a held tile dims while it is pressed and returns when the finger leaves', async () => {
  const result = await render(
    <TestProviders>
      <WardrobeListScreen
        onAdd={() => undefined}
        onEdit={() => undefined}
        onRetry={() => undefined}
        state={readyState([ownedItem])}
      />
    </TestProviders>,
  );

  // Law 7's press feedback. The scale rides a shared value, which the Reanimated test mock
  // rebuilds on every render, so the visible half of the response is what is read here:
  // the tile dims, and motion is never the only indication that it is held.
  const tile = result.getByTestId(`wardrobe-item-${ownedItem.id}`);
  expect(StyleSheet.flatten(tile.props.style).opacity).toBe(1);

  fireEvent(tile, 'pressIn');
  await waitFor(() => {
    expect(StyleSheet.flatten(result.getByTestId(`wardrobe-item-${ownedItem.id}`).props.style).opacity)
      .toBe(lightTheme.interaction.pressedOpacity);
  });

  fireEvent(tile, 'pressOut');
  await waitFor(() => {
    expect(StyleSheet.flatten(result.getByTestId(`wardrobe-item-${ownedItem.id}`).props.style).opacity)
      .toBe(1);
  });
});

test('a photo tile falls back to the silhouette after a load failure', async () => {
  const withPhoto = { ...ownedItem, photoRelativePath: 'kuyara/wardrobe/photos/a.jpg' };
  const result = await render(
    <TestProviders>
      <WardrobeListScreen
        onAdd={() => undefined}
        onEdit={() => undefined}
        onRetry={() => undefined}
        resolvePhotoUri={() => 'file:///private/documents/photo.jpg'}
        state={readyState([withPhoto])}
      />
    </TestProviders>,
  );

  const photo = result.getByTestId(`wardrobe-photo-${ownedItem.id}`, {
    includeHiddenElements: true,
  });
  expect(photo).toHaveProp('resizeMode', 'cover');
  expect(result.queryByTestId(`wardrobe-silhouette-${ownedItem.id}`, { includeHiddenElements: true })).toBeNull();
  await fireEvent(photo, 'error');
  expect(
    result.queryByTestId(`wardrobe-photo-${ownedItem.id}`),
  ).not.toBeOnTheScreen();
  expect(
    result.getByTestId(`wardrobe-silhouette-${ownedItem.id}`, {
      includeHiddenElements: true,
    }),
  ).toBeOnTheScreen();
});

test('the six category tabs always show in catalogue order with counts, and a tab turns the page', async () => {
  const onCategoryChange = jest.fn();
  const result = await render(
    <TestProviders>
      <WardrobeListScreen
        onAdd={() => undefined}
        onCategoryChange={onCategoryChange}
        onEdit={() => undefined}
        onRetry={() => undefined}
        state={readyState([ownedItem, legacyItem, wantedItem])}
      />
    </TestProviders>,
  );

  const strip = result.getByTestId('wardrobe-category-tabs');
  expect(strip.props.accessibilityRole).toBe('tablist');
  const tabs = result.getAllByRole('tab');
  expect(tabs.map((tab) => tab.props.testID)).toEqual([
    'wardrobe-category-tab-top',
    'wardrobe-category-tab-bottom',
    'wardrobe-category-tab-one_piece',
    'wardrobe-category-tab-outerwear',
    'wardrobe-category-tab-footwear',
    'wardrobe-category-tab-accessory',
  ]);
  expect(result.getByTestId('wardrobe-category-tab-footwear-count')).toHaveTextContent('1');
  expect(result.getByTestId('wardrobe-category-tab-bottom-count')).toHaveTextContent('0');
  expect(result.getByTestId('wardrobe-category-tab-footwear').props.accessibilityLabel)
    .toBe('Shoes, 1 piece, 1 wanted.');

  // The first category that holds anything opens first: the legacy top.
  expect(result.getByTestId(`wardrobe-item-${legacyItem.id}`)).toBeOnTheScreen();
  await fireEvent.press(result.getByTestId('wardrobe-category-tab-outerwear'));
  expect(onCategoryChange).toHaveBeenCalledWith('outerwear');
  expect(result.getByTestId(`wardrobe-item-${ownedItem.id}`)).toBeOnTheScreen();
  expect(result.queryByTestId(`wardrobe-item-${legacyItem.id}`)).not.toBeOnTheScreen();
  expect(result.getByTestId('wardrobe-category-tab-outerwear').props.accessibilityState.selected).toBe(true);
});

test.each([
  [1, 3],
  [1.353, 2],
] as const)('at fontScale %s the grid has %s columns', async (fontScale, columns) => {
  Dimensions.set({ window: { ...originalWindowDimensions, fontScale } });
  const tops = Array.from({ length: 4 }, (_, index) => ({
    ...legacyItem,
    id: `00000000-0000-4000-8000-00000000000${index}`,
    createdAt: `2026-07-2${index}T10:00:00.000Z`,
  }));
  const result = await render(
    <TestProviders>
      <WardrobeListScreen
        onAdd={() => undefined}
        onEdit={() => undefined}
        onRetry={() => undefined}
        state={readyState(tops)}
      />
    </TestProviders>,
  );

  // The newest tile leads the first row, and that row holds exactly `columns` tiles.
  const first = result.getByTestId(`wardrobe-item-${tops[3].id}`);
  const width = StyleSheet.flatten(result.getByTestId(`wardrobe-item-${tops[3].id}-frame`).props.style).width;
  expect(first).toBeOnTheScreen();
  expect(width).toBeCloseTo(resolveGridGeometry(originalWindowDimensions.width, columns).width, 5);
});

test('a category page is an owned section then a wanted section, cut into rows, newest first', () => {
  const at = (id: string, entryState: 'owned' | 'wanted', day: number) => ({
    ...legacyItem, id, entryState, createdAt: `2026-07-1${day}T10:00:00.000Z`,
  });
  const rows = buildCategoryRows(
    [at('a', 'owned', 1), at('b', 'owned', 2), at('c', 'owned', 3), at('d', 'owned', 4), at('w', 'wanted', 5), ownedItem],
    'top',
    3,
  );
  expect(rows.map((row) => (row.kind === 'section' ? row.entryState : row.items.map((item) => item.id).join('')))).toEqual([
    'owned', 'dcb', 'a', 'wanted', 'w',
  ]);
  expect(rows[3]).toMatchObject({ kind: 'section', afterOwned: true, count: 1 });
  expect(buildCategoryRows([ownedItem], 'top', 3)).toEqual([]);
});

test('without a requested category the Closet opens where its pieces are, or where its wanted ones are', () => {
  expect(resolveDefaultCategory([], false)).toBe('top');
  expect(resolveDefaultCategory([ownedItem, wantedItem], false)).toBe('outerwear');
  // Profile's Wanted row: the first category holding a wanted piece.
  expect(resolveDefaultCategory([ownedItem, wantedItem], true)).toBe('footwear');
  // Nothing wanted anywhere: fall back to where the pieces are.
  expect(resolveDefaultCategory([ownedItem], true)).toBe('outerwear');
});

test('a background refresh failure shows a retryable banner without discarding the grid', async () => {
  const onRetry = jest.fn();
  const result = await render(
    <TestProviders>
      <WardrobeListScreen
        onAdd={() => undefined}
        onEdit={() => undefined}
        onRetry={onRetry}
        state={readyState([ownedItem], { refreshFailure: 'unavailable' })}
      />
    </TestProviders>,
  );

  expect(result.getByTestId('wardrobe-refresh-error')).toBeOnTheScreen();
  expect(result.getByTestId(`wardrobe-item-${ownedItem.id}`)).toBeOnTheScreen();
  await fireEvent.press(
    result.getByRole('button', { name: messages.en.wardrobe.retryAction }),
  );
  expect(onRetry).toHaveBeenCalledTimes(1);
  expect(onRetry).toHaveBeenCalledWith('retry_button');
});

test('grid geometry follows the window width: three columns, two at the largest standard text size', () => {
  // The 393 point reference: 112 by 140 in three columns, 174.5 by 218 in two.
  const three = resolveGridGeometry(393, 3);
  expect(three.width).toBeCloseTo(112.33, 2);
  expect(three.height / three.width).toBeCloseTo(218 / 174.5, 5);
  const two = resolveGridGeometry(393, 2);
  expect(two.width).toBe(174.5);
  expect(two.height).toBeCloseTo(218, 5);

  // A 375 point device: three tiles plus two gaps still fit inside the 343 point content box.
  expect(resolveGridGeometry(375, 3).width * 3 + 24).toBeCloseTo(343, 5);
});

// ADR 0025 gives the five accessories their own silhouettes, so an
// accessory draws like any typed garment; only a legacy entry without a type falls back
// to the category placeholder.
test('the grid draws coloured silhouettes for typed garments and accessories, and a glyph for legacy entries', async () => {
  const accessory = { ...ownedItem, id: 'accessory', garmentTypeId: 'beanie' as const, category: 'accessory' as const };
  const items = [ownedItem, accessory, legacyItem];
  const hidden = { includeHiddenElements: true };
  for (const item of [ownedItem, accessory]) {
    const result = await render(
      <TestProviders>
        <WardrobeListScreen onAdd={() => undefined} onEdit={() => undefined} onRetry={() => undefined}
          initialCategory={item.category} state={readyState(items)} />
      </TestProviders>,
    );
    expect(result.getByTestId(`wardrobe-silhouette-${item.id}`, hidden)).toBeOnTheScreen();
    expect(result.queryByTestId(`wardrobe-photo-placeholder-${item.id}`, hidden)).toBeNull();
    await result.unmount();
  }
  const result = await render(
    <TestProviders>
      <WardrobeListScreen onAdd={() => undefined} onEdit={() => undefined} onRetry={() => undefined}
        initialCategory="top" state={readyState(items)} />
    </TestProviders>,
  );
  expect(result.getByTestId(`wardrobe-photo-placeholder-${legacyItem.id}`, hidden)).toBeOnTheScreen();
  expect(result.queryByTestId(`wardrobe-silhouette-${legacyItem.id}`, hidden)).toBeNull();
});

// Law 7: opening the Closet is an arrival, so the whole grid enters in reading order;
// returning from a save is not, so only the item that was just saved does. The tile's own
// presence in the list is the indication either way, never the motion alone.
test('every tile arrives on a plain open, and only the saved one after an add', () => {
  expect(tileEntranceIndex('a', 0, null)).toBe(0);
  expect(tileEntranceIndex('b', 3, undefined)).toBe(3);

  // The list orders newest first, so the saved item is the first tile; it still arrives
  // at the head of the stagger rather than inheriting its neighbours' delay.
  expect(tileEntranceIndex('b', 0, 'b')).toBe(0);
  expect(tileEntranceIndex('a', 1, 'b')).toBeNull();
  // A saved id the list no longer holds leaves every tile at rest rather than replaying
  // the whole grid.
  expect(tileEntranceIndex('a', 0, 'gone')).toBeNull();
});

test('the category follows the route, so a return from the add flow reselects it', async () => {
  const result = await render(
    <TestProviders>
      <WardrobeListScreen
        initialCategory="outerwear"
        onAdd={() => undefined}
        onEdit={() => undefined}
        onRetry={() => undefined}
        state={readyState([ownedItem, wantedItem])}
      />
    </TestProviders>,
  );

  expect(result.getByTestId(`wardrobe-item-${ownedItem.id}`)).toBeOnTheScreen();

  // The add flow returns to `/wardrobe` with the category the item joined. Whether the
  // navigator remounts this screen or keeps it, the new prop has to win.
  await result.rerender(
    <TestProviders>
      <WardrobeListScreen
        initialCategory="footwear"
        onAdd={() => undefined}
        onEdit={() => undefined}
        onRetry={() => undefined}
        revealWanted
        savedItemId={wantedItem.id}
        state={readyState([ownedItem, wantedItem])}
      />
    </TestProviders>,
  );

  expect(result.getByTestId(`wardrobe-item-${wantedItem.id}`)).toBeOnTheScreen();
  expect(result.queryByTestId(`wardrobe-item-${ownedItem.id}`)).not.toBeOnTheScreen();
});

// Milestone 10 phase 3: the route (`wardrobe-list-route.tsx`) tells the pull gesture
// apart from either retry button by this `source` argument alone, so this screen stays
// free of analytics itself while still proving each control reports its own source.
test('the pull gesture reports its own source, distinct from either retry button', async () => {
  const onRetry = jest.fn();
  const result = await render(
    <TestProviders>
      <WardrobeListScreen
        onAdd={() => undefined}
        onEdit={() => undefined}
        onRetry={onRetry}
        state={readyState([ownedItem])}
      />
    </TestProviders>,
  );

  act(() => {
    result.getByTestId('wardrobe-list').props.onRefresh();
  });
  expect(onRetry).toHaveBeenCalledTimes(1);
  expect(onRetry).toHaveBeenCalledWith('pull');
});
