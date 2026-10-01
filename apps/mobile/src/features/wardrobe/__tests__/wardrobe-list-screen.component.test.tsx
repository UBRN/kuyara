import { act, fireEvent, render, waitFor, within } from '@testing-library/react-native';
import { useState, type PropsWithChildren } from 'react';
import { AccessibilityInfo, Dimensions, FlatList, StyleSheet } from 'react-native';
import * as Reanimated from 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { WardrobeApplicationState } from '@/features/wardrobe/application/wardrobe-application-controller';
import type { StructuralCategory } from '@/features/catalog/domain/garment-taxonomy';
import type { WardrobeItem } from '@/features/wardrobe/domain/wardrobe-item';
import {
  WardrobeListScreen,
  buildCategoryRows,
  resolveDefaultCategory,
  resolveGridGeometry,
  tileEntranceIndex,
} from '@/features/wardrobe/presentation/wardrobe-list-screen';
import { PUSH_WINDOW_MS, useSingleTap } from '@/components/ui/use-single-push';
import { LocalizationContext } from '@/localization/localization-context';
import { messages, type SupportedLanguage } from '@/localization/messages';
import { lightTheme } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';
import { EasierToSeeContext, SystemVisibilityContext } from '@/theme/easier-to-see';

// A tile is an expo-router `Link`, which navigates through the router's own `linkTo`; this
// screen renders outside a router, so the test reads the navigation it asks for there.
const mockLinkTo = jest.fn();
jest.mock('expo-router/build/global-state/routing', () => ({
  ...jest.requireActual('expo-router/build/global-state/routing'),
  linkTo: (...args: unknown[]) => mockLinkTo(...args),
}));

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
        itemHref={() => '/'}
        onRetry={() => undefined}
        state={{ status: 'loading' }}
      />
    </TestProviders>,
  );

  const loading = result.getByTestId('wardrobe-loading');
  expect(loading.props.accessibilityRole).toBe('progressbar');
  // The label is spoken only when the view is an accessibility element.
  expect(loading.props.accessible).toBe(true);
  expect(result.getByLabelText(messages.en.wardrobe.loadingLabel)).toBeOnTheScreen();
});

test('error state retries and shows no category tabs', async () => {
  const onRetry = jest.fn();
  const result = await render(
    <TestProviders>
      <WardrobeListScreen
        onAdd={() => undefined}
        itemHref={() => '/'}
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
        itemHref={() => '/'}
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
        itemHref={() => '/'}
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
        itemHref={() => '/'}
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
        itemHref={() => '/'}
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
        itemHref={() => '/'}
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
        itemHref={() => '/'}
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

test('tiles under one guard open one piece, however quickly a second tap or another tile follows', async () => {
  const otherItem = { ...ownedItem, id: '218f0f4d-1d45-4ae7-a8f1-796e8297d3b4', name: 'Second' };
  function GuardedCloset() {
    const tap = useSingleTap();
    return (
      <WardrobeListScreen
        onAdd={() => undefined}
        itemHref={(id) => `/wardrobe/${id}`}
        onItemPress={tap.linkPress}
        onRetry={() => undefined}
        state={readyState([ownedItem, otherItem])}
      />
    );
  }
  const result = await render(
    <TestProviders>
      <GuardedCloset />
    </TestProviders>,
  );
  // A plain push of the piece's form; on iOS the link adds the id of the tile it zooms out of.
  const openedWithZoom = (id: string) =>
    expect.stringMatching(new RegExp(`^/wardrobe/${id}\\?\\w*zoom_transition_source_id=`));
  // The press event says whether the tile let its link navigate (`Link` skips a prevented one).
  const press = async (id: string) => {
    let prevented = false;
    await fireEvent.press(result.getByTestId(`wardrobe-item-${id}`), {
      defaultPrevented: false,
      preventDefault(this: { defaultPrevented: boolean }) {
        this.defaultPrevented = true;
        prevented = true;
      },
    });
    return prevented;
  };
  const now = jest.spyOn(Date, 'now').mockReturnValue(10_000);

  try {
    expect(await press(ownedItem.id)).toBe(false);
    expect(await press(ownedItem.id)).toBe(true);
    expect(await press(otherItem.id)).toBe(true);
    expect(mockLinkTo).toHaveBeenCalledTimes(1);
    expect(mockLinkTo).toHaveBeenCalledWith(
      openedWithZoom(ownedItem.id),
      expect.objectContaining({ event: 'PUSH' }),
    );

    // Once the form's transition has had its time, the next tap opens a piece again.
    now.mockReturnValue(10_000 + PUSH_WINDOW_MS);
    expect(await press(otherItem.id)).toBe(false);
    expect(mockLinkTo).toHaveBeenLastCalledWith(
      openedWithZoom(otherItem.id),
      expect.objectContaining({ event: 'PUSH' }),
    );
  } finally {
    now.mockRestore();
  }
});

test('a held tile dims while it is pressed and returns when the finger leaves', async () => {
  const result = await render(
    <TestProviders>
      <WardrobeListScreen
        onAdd={() => undefined}
        itemHref={() => '/'}
        onRetry={() => undefined}
        state={readyState([ownedItem])}
      />
    </TestProviders>,
  );

  // Law 7's press feedback. The scale rides a shared value, which the Reanimated test mock
  // rebuilds on every render, so the visible half of the response is what is read here:
  // the tile dims, and motion is never the only indication that it is held.
  const tile = result.getByTestId(`wardrobe-item-${ownedItem.id}`);
  const contentOpacity = () =>
    StyleSheet.flatten(result.getByTestId(`wardrobe-item-${ownedItem.id}-content`).props.style)
      .opacity;
  expect(contentOpacity()).toBe(1);

  fireEvent(tile, 'pressIn');
  await waitFor(() => {
    expect(contentOpacity()).toBe(lightTheme.interaction.pressedOpacity);
  });

  fireEvent(tile, 'pressOut');
  await waitFor(() => {
    expect(contentOpacity()).toBe(1);
  });
});

test('a photo tile falls back to the silhouette after a load failure', async () => {
  const withPhoto = { ...ownedItem, photoRelativePath: 'kuyara/wardrobe/photos/a.jpg' };
  const result = await render(
    <TestProviders>
      <WardrobeListScreen
        onAdd={() => undefined}
        itemHref={() => '/'}
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
        itemHref={() => '/'}
        onRetry={() => undefined}
        state={readyState([ownedItem, legacyItem, wantedItem])}
      />
    </TestProviders>,
  );

  // iOS (Jest's platform): a tab bar container of buttons, the roles VoiceOver honours.
  const strip = result.getByTestId('wardrobe-category-tabs');
  expect(strip.props.accessibilityRole).toBe('tabbar');
  const tabs = within(strip).getAllByRole('button');
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
  [1, 3, false],
  [1.353, 2, false],
  // O13: Easier to see keeps two columns at the default size.
  [1, 2, true],
] as const)('at fontScale %s the grid has %s columns (Easier to see %s)', async (fontScale, columns, easierToSee) => {
  Dimensions.set({ window: { ...originalWindowDimensions, fontScale } });
  const tops = Array.from({ length: 4 }, (_, index) => ({
    ...legacyItem,
    id: `00000000-0000-4000-8000-00000000000${index}`,
    createdAt: `2026-07-2${index}T10:00:00.000Z`,
  }));
  const result = await render(
    <TestProviders>
      <EasierToSeeContext value={easierToSee}>
        <WardrobeListScreen
          onAdd={() => undefined}
          itemHref={() => '/'}
          onRetry={() => undefined}
          state={readyState(tops)}
        />
      </EasierToSeeContext>
    </TestProviders>,
  );

  // The newest tile leads the first row, and that row holds exactly `columns` tiles.
  const first = result.getByTestId(`wardrobe-item-${tops[3].id}`);
  const width = StyleSheet.flatten(result.getByTestId(`wardrobe-item-${tops[3].id}-frame`).props.style).width;
  expect(first).toBeOnTheScreen();
  expect(width).toBeCloseTo(resolveGridGeometry(originalWindowDimensions.width, columns).width, 5);
});

// O13 (render 21): while "Easier to see" or iOS Increase Contrast is on,
// an unselected category chip and every tile take the 2-point strong edge; the wanted tile
// keeps its dashed frame in that ink. Off, both keep their ordinary boundary.
test.each([
  ['the switch', true, false],
  ['Increase Contrast', false, true],
  ['neither', false, false],
] as const)('with %s on, the strong edge on Closet chips and tiles follows the switch or Increase Contrast', async (_name, switchOn, increaseContrast) => {
  Dimensions.set({ window: { ...originalWindowDimensions, fontScale: 1 } });
  const ownedTop = legacyItem;
  const wantedTop: WardrobeItem = { ...legacyItem, id: '418f0f4d-1d45-4ae7-a8f1-796e8297d3b4', entryState: 'wanted' };
  const result = await render(
    <TestProviders>
      <EasierToSeeContext value={switchOn}>
        <SystemVisibilityContext value={{ boldText: false, increaseContrast }}>
          <WardrobeListScreen
            onAdd={() => undefined}
            itemHref={() => '/'}
            onRetry={() => undefined}
            state={readyState([ownedTop, wantedTop])}
          />
        </SystemVisibilityContext>
      </EasierToSeeContext>
    </TestProviders>,
  );

  const edged = switchOn || increaseContrast;
  // The top tab is selected and keeps its accent fill; the outerwear tab is the plain chip.
  const chip = StyleSheet.flatten(result.getByTestId('wardrobe-category-tab-outerwear').props.style);
  const owned = StyleSheet.flatten(result.getByTestId(`wardrobe-item-${ownedTop.id}-frame`).props.style);
  const wanted = StyleSheet.flatten(result.getByTestId(`wardrobe-item-${wantedTop.id}-frame`).props.style);
  if (edged) {
    expect(chip).toMatchObject({ borderColor: lightTheme.colors.borderStrong, borderWidth: 2 });
    expect(owned).toMatchObject({ borderColor: lightTheme.colors.borderStrong, borderWidth: 2 });
    expect(wanted).toMatchObject({ borderColor: lightTheme.colors.borderStrong, borderStyle: 'dashed', borderWidth: 2 });
  } else {
    expect(chip).toMatchObject({ borderColor: lightTheme.colors.borderDefined, borderWidth: 1 });
    expect(owned.borderWidth).toBeUndefined();
    expect(wanted).toMatchObject({ borderColor: lightTheme.colors.borderDefined, borderWidth: 1.5 });
  }
  expect(chip.minHeight).toBe(switchOn ? 48 : 40);
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
  // VoiceOver ignores the alert role, so the line is also spoken.
  const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
  announce.mockClear();
  const result = await render(
    <TestProviders>
      <WardrobeListScreen
        onAdd={() => undefined}
        itemHref={() => '/'}
        onRetry={onRetry}
        state={readyState([ownedItem], { refreshFailure: 'unavailable' })}
      />
    </TestProviders>,
  );

  expect(result.getByTestId('wardrobe-refresh-error')).toBeOnTheScreen();
  expect(announce).toHaveBeenCalledTimes(1);
  expect(announce).toHaveBeenLastCalledWith(messages.en.wardrobe.loadErrorBody);
  announce.mockRestore();
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
        <WardrobeListScreen onAdd={() => undefined} itemHref={() => '/'} onRetry={() => undefined}
          initialCategory={item.category} state={readyState(items)} />
      </TestProviders>,
    );
    expect(result.getByTestId(`wardrobe-silhouette-${item.id}`, hidden)).toBeOnTheScreen();
    expect(result.queryByTestId(`wardrobe-photo-placeholder-${item.id}`, hidden)).toBeNull();
    await result.unmount();
  }
  const result = await render(
    <TestProviders>
      <WardrobeListScreen onAdd={() => undefined} itemHref={() => '/'} onRetry={() => undefined}
        initialCategory="top" state={readyState(items)} />
    </TestProviders>,
  );
  expect(result.getByTestId(`wardrobe-photo-placeholder-${legacyItem.id}`, hidden)).toBeOnTheScreen();
  expect(result.queryByTestId(`wardrobe-silhouette-${legacyItem.id}`, hidden)).toBeNull();
});

// Law 7: opening the Closet is an arrival, so the grid of its first render enters in
// reading order; a tile mounting later and a return from a save are not, so only the item
// that was just saved does. The tile's own presence in the list is the indication either
// way, never the motion alone.
test('the first render arrives, a later mount rests, and only the saved tile arrives after an add', () => {
  expect(tileEntranceIndex('a', 0, null, true)).toBe(0);
  expect(tileEntranceIndex('b', 3, undefined, true)).toBe(3);
  // Scrolled into view or refilled after a delete: drawn at rest.
  expect(tileEntranceIndex('b', 3, null, false)).toBeNull();

  // The list orders newest first, so the saved item is the first tile; it still arrives
  // at the head of the stagger rather than inheriting its neighbours' delay, whenever it mounts.
  expect(tileEntranceIndex('b', 0, 'b', true)).toBe(0);
  expect(tileEntranceIndex('b', 9, 'b', false)).toBe(0);
  expect(tileEntranceIndex('a', 1, 'b', true)).toBeNull();
  // A saved id the list no longer holds leaves every tile at rest rather than replaying
  // the whole grid.
  expect(tileEntranceIndex('a', 0, 'gone', true)).toBeNull();
});

test('deleting a piece refills the grid at rest instead of replaying its arrival', async () => {
  const withDelay = jest.spyOn(Reanimated, 'withDelay');
  const at = (id: string, day: number) => ({ ...legacyItem, id, createdAt: `2026-07-1${day}T10:00:00.000Z` });
  const pieces = [at('a', 1), at('b', 2), at('c', 3), at('d', 4), at('e', 5)];
  const screen = (items: readonly WardrobeItem[]) => (
    <TestProviders>
      <WardrobeListScreen initialCategory="top" onAdd={() => undefined} itemHref={() => '/'}
        onRetry={() => undefined} state={readyState(items)} />
    </TestProviders>
  );
  const result = await render(screen(pieces));
  // The first render arrives: every tile starts its entrance.
  expect(withDelay).toHaveBeenCalled();

  withDelay.mockClear();
  // Deleting the newest piece moves every later tile up a place, across a row boundary.
  await result.rerender(screen(pieces.filter((item) => item.id !== 'e')));
  expect(result.getByTestId('wardrobe-item-d')).toBeOnTheScreen();
  expect(withDelay).not.toHaveBeenCalled();
  withDelay.mockRestore();
});

test('the category follows the route, so a return from the add flow reselects it', async () => {
  const result = await render(
    <TestProviders>
      <WardrobeListScreen
        initialCategory="outerwear"
        onAdd={() => undefined}
        itemHref={() => '/'}
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
        itemHref={() => '/'}
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

// O10: after a save, the Closet names the piece above the grid, rings its tile, and offers
// Undo; the row leaves with the piece, and a failed Undo says so and keeps the piece.
test('the saved piece is named with Undo and ringed, and Undo removes it or reports a failure', async () => {
  const plainPiece: WardrobeItem = { ...ownedItem, name: null };
  let rejectUndo: ((error: Error) => void) | undefined;
  const onUndoSaved = jest.fn(
    () => new Promise<void>((_resolve, reject) => {
      rejectUndo = reject;
    }),
  );
  const render_ = (items: readonly WardrobeItem[]) => (
    <TestProviders>
      <WardrobeListScreen
        initialCategory="outerwear"
        onAdd={() => undefined}
        itemHref={() => '/'}
        onRetry={() => undefined}
        onUndoSaved={onUndoSaved}
        savedItemId={plainPiece.id}
        state={readyState(items)}
      />
    </TestProviders>
  );
  const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
  announce.mockClear();
  const result = await render(render_([plainPiece]));

  expect(result.getByTestId('wardrobe-saved-confirmation')).toHaveTextContent(
    messages.en.wardrobe.savedOwnedConfirmation('Rain jacket'),
    { exact: false },
  );
  const frame = StyleSheet.flatten(result.getByTestId(`wardrobe-item-${plainPiece.id}-frame`).props.style);
  expect(frame.borderColor).toBe(lightTheme.colors.brandAccent);

  await fireEvent.press(result.getByTestId('wardrobe-saved-undo'));
  expect(onUndoSaved).toHaveBeenCalledWith(plainPiece.id);
  await act(async () => rejectUndo?.(new Error('write failed')));
  await waitFor(() => expect(result.getByTestId('wardrobe-undo-error')).toBeOnTheScreen());
  // VoiceOver ignores the alert role, so the failed Undo is also spoken, once.
  expect(announce).toHaveBeenCalledTimes(1);
  expect(announce).toHaveBeenLastCalledWith(messages.en.wardrobe.deleteError);
  announce.mockRestore();
  expect(result.getByTestId('wardrobe-saved-confirmation')).toBeOnTheScreen();

  // The piece is gone once the removal lands, and the confirmation goes with it.
  await result.rerender(render_([]));
  expect(result.queryByTestId('wardrobe-saved-confirmation')).not.toBeOnTheScreen();

  // A plain open names nothing and rings nothing.
  const plain = await render(
    <TestProviders>
      <WardrobeListScreen
        initialCategory="outerwear"
        onAdd={() => undefined}
        itemHref={() => '/'}
        onRetry={() => undefined}
        state={readyState([plainPiece])}
      />
    </TestProviders>,
  );
  expect(plain.queryByTestId('wardrobe-saved-confirmation')).not.toBeOnTheScreen();
});

test('a wanted piece is confirmed as added to the wanted pieces, in Turkish too', async () => {
  const result = await render(
    <TestProviders language="tr">
      <WardrobeListScreen
        initialCategory="footwear"
        onAdd={() => undefined}
        itemHref={() => '/'}
        onRetry={() => undefined}
        savedItemId={wantedItem.id}
        state={readyState([wantedItem])}
      />
    </TestProviders>,
  );
  expect(result.getByTestId('wardrobe-saved-confirmation')).toHaveTextContent(
    messages.tr.wardrobe.savedWantedConfirmation(messages.tr.catalog['catalog.garment_type.weather_boots.name']),
    { exact: false },
  );
  expect(result.getByRole('button', { name: messages.tr.wardrobe.undoAction })).toBeOnTheScreen();
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
        itemHref={() => '/'}
        onRetry={onRetry}
        state={readyState([ownedItem])}
      />
    </TestProviders>,
  );

  await act(async () => {
    result.getByTestId('wardrobe-list').props.onRefresh();
  });
  expect(onRetry).toHaveBeenCalledTimes(1);
  expect(onRetry).toHaveBeenCalledWith('pull');
});

// `filter=wanted` stays in the route params after Profile's Wanted row opens the Closet, and a
// tab switch only swaps `category` (router.setParams merges), so the reveal must not re-fire.
test('the Wanted reveal happens once per request, not again on every tab switch', async () => {
  const scrollToIndex = jest.spyOn(FlatList.prototype, 'scrollToIndex').mockImplementation(() => undefined);
  const piece = (id: string, category: StructuralCategory, entryState: 'owned' | 'wanted'): WardrobeItem => ({
    ...ownedItem, id, category, entryState,
    garmentTypeId: category === 'footwear' ? 'weather_boots' : 'rain_jacket',
  });
  const items = [
    piece('a1', 'outerwear', 'owned'), piece('a2', 'outerwear', 'wanted'),
    piece('b1', 'footwear', 'owned'), piece('b2', 'footwear', 'wanted'),
  ];
  function Route() {
    const [category, setCategory] = useState<StructuralCategory>('outerwear');
    return (
      <TestProviders>
        <WardrobeListScreen initialCategory={category} onAdd={() => undefined}
          onCategoryChange={setCategory} itemHref={() => '/'} onRetry={() => undefined}
          revealWanted state={readyState(items)} />
      </TestProviders>
    );
  }
  const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 60)); });
  const result = await render(<Route />);
  await waitFor(() => expect(scrollToIndex).toHaveBeenCalledTimes(1));
  await settle();

  await fireEvent.press(result.getByTestId('wardrobe-category-tab-footwear'));
  await settle();
  await fireEvent.press(result.getByTestId('wardrobe-category-tab-outerwear'));
  await settle();
  expect(scrollToIndex).toHaveBeenCalledTimes(1);
  scrollToIndex.mockRestore();
});
