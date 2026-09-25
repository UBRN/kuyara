import { fireEvent, render } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { Dimensions, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ProfileScreen } from '@/features/profile/presentation/profile-screen';
import {
  WardrobeApplicationContext,
  type WardrobeApplicationValue,
} from '@/features/wardrobe/application/wardrobe-application-context';
import type { WardrobeItem } from '@/features/wardrobe/domain/wardrobe-item';
import { LocalizationContext } from '@/localization/localization-context';
import { messages } from '@/localization/messages';
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
  };
}

function TestProviders({
  children,
  items,
  status,
  resolvePhotoUri,
  language = 'en',
}: PropsWithChildren<{
  items: readonly WardrobeItem[];
  status?: 'ready' | 'loading' | 'error';
  resolvePhotoUri?: WardrobeApplicationValue['resolvePhotoUri'];
  language?: 'en' | 'tr';
}>) {
  return (
    <WardrobeApplicationContext.Provider value={{ ...application(items, status), ...(resolvePhotoUri ? { resolvePhotoUri } : {}) }}>
      <LocalizationContext.Provider value={{ language, messages: messages[language], hour12: false }}>
        <KuyaraThemeContext.Provider value={lightTheme}>
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
      <ProfileScreen onOpenCategory={() => undefined} onOpenHistory={() => undefined}

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
        <ProfileScreen onOpenCategory={() => undefined} onOpenHistory={() => undefined}

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
      <ProfileScreen
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
  expect(rack.props.accessibilityLabel).toBe("Deniz's Closet, 3 pieces: Tops 2, Outerwear 1.");
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
      <ProfileScreen onOpenCategory={onOpenCategory} onOpenHistory={() => undefined} onOpenWardrobe={() => undefined} />
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

test.each([
  [1, 3],
  [1.353, 2],
] as const)('at fontScale %s the category cells sit in %s columns', async (fontScale, columns) => {
  mockFontScale(fontScale);
  const result = await render(
    <TestProviders items={[baseItem]}>
      <ProfileScreen onOpenCategory={() => undefined} onOpenHistory={() => undefined} onOpenWardrobe={() => undefined} />
    </TestProviders>,
  );

  const rows = result.getByTestId('profile-category-cells').props.children;
  expect(rows).toHaveLength(6 / columns);
  for (const row of rows) {
    expect(row.props.children).toHaveLength(columns);
  }
});

test('the empty Closet shows the empty rack, the sentence and the Add a piece action, and hides the Wanted row', async () => {
  mockFontScale(1);
  const onOpenWardrobe = jest.fn();
  const result = await render(
    <TestProviders items={[]}>
      <ProfileScreen onOpenCategory={() => undefined} onOpenHistory={() => undefined}

        onOpenWardrobe={onOpenWardrobe}

      />
    </TestProviders>,
  );

  expect(result.getByText(messages.en.profile.wardrobeEmpty)).toBeOnTheScreen();
  // The empty rack keeps its place; a row of zeros is what ADR 0028 removed, so no cells.
  expect(result.getByTestId('profile-rack').props.accessibilityLabel).toBe('Closet, 0 pieces.');
  expect(result.queryByTestId('profile-category-cells')).toBeNull();
  expect(result.queryByTestId('profile-wanted-row')).toBeNull();
  await fireEvent.press(result.getByTestId('profile-add-piece-button'));
  expect(onOpenWardrobe).toHaveBeenCalledWith();
});

test('the Turkish empty Closet wraps its text within the window at fontScale 3.1', async () => {
  mockFontScale(3.1);
  const result = await render(
    <TestProviders items={[]} language="tr">
      <ProfileScreen onOpenCategory={() => undefined} onOpenHistory={() => undefined} displayName="Utku" onOpenWardrobe={() => undefined} />
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
      <ProfileScreen onOpenCategory={() => undefined} onOpenHistory={() => undefined}

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
      <ProfileScreen onOpenCategory={() => undefined} onOpenHistory={() => undefined}

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
      <ProfileScreen onOpenCategory={() => undefined} onOpenHistory={onOpenHistory} onOpenWardrobe={() => undefined} />
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
      <ProfileScreen onOpenCategory={() => undefined} onOpenHistory={() => undefined} displayName="Utku" onOpenWardrobe={() => undefined} />
    </TestProviders>,
  );
  expect(result.getByText("Utku's Closet")).toBeOnTheScreen();
  expect(result.getByTestId('profile-closet-heading').props.accessibilityLabel)
    .toBe("Utku's Closet, 1.");
});

test('Turkish keeps the name unchanged in the Closet heading at large text size', async () => {
  mockFontScale(3.12);
  const result = await render(
    <TestProviders items={[baseItem]} language="tr">
      <ProfileScreen onOpenCategory={() => undefined} onOpenHistory={() => undefined} displayName="Utku" onOpenWardrobe={() => undefined} />
    </TestProviders>,
  );
  expect(result.getByText('Gardırop · Utku')).toBeOnTheScreen();
  expect(result.getByTestId('profile-closet-heading').props.accessibilityLabel)
    .toBe('Gardırop · Utku, 1.');
});

test('a loading Closet shows the bare rack and the six cells without counts, spoken as loading', async () => {
  mockFontScale(1);
  const result = await render(
    <TestProviders items={[]} status="loading">
      <ProfileScreen onOpenCategory={() => undefined} onOpenHistory={() => undefined} onOpenWardrobe={() => undefined} />
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

test('a Closet that cannot load shows the bare rack and a retry that refreshes it', async () => {
  mockFontScale(1);
  const refresh = jest.fn(async () => undefined);
  const result = await render(
    <WardrobeApplicationContext.Provider value={{ ...application([], 'error'), refresh }}>
      <LocalizationContext.Provider value={{ language: 'en', messages: messages.en, hour12: false }}>
        <KuyaraThemeContext.Provider value={lightTheme}>
          <SafeAreaProvider initialMetrics={initialMetrics}>
            <ProfileScreen onOpenCategory={() => undefined} onOpenHistory={() => undefined} onOpenWardrobe={() => undefined} />
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
      <ProfileScreen onOpenCategory={() => undefined} onOpenHistory={() => undefined} onOpenWardrobe={() => undefined} />
    </TestProviders>,
  );
  const hidden = { includeHiddenElements: true };
  expect(result.getByTestId('profile-category-outerwear-drawing', hidden)).toBeOnTheScreen();
  expect(result.getByTestId('profile-category-accessory-drawing', hidden)).toBeOnTheScreen();
  expect(result.queryByTestId('profile-category-top-drawing', hidden)).toBeNull();
  expect(result.queryByTestId('profile-category-footwear-drawing', hidden)).toBeNull();
});
