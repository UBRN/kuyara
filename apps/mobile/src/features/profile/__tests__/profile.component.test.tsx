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
      <ProfileScreen

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
        <ProfileScreen

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

test('the rail renders the newest owned pieces first, each as one accessible item with a position and total', async () => {
  mockFontScale(1);
  const older = itemWithId('218f0f4d-1d45-4ae7-a8f1-796e8297d3b4', {
    name: null,
    createdAt: '2026-07-29T10:00:00.000Z',
  });
  const newer = itemWithId('318f0f4d-1d45-4ae7-a8f1-796e8297d3b4', {
    createdAt: '2026-07-31T10:00:00.000Z',
  });
  const result = await render(
    <TestProviders items={[older, newer]}>
      <ProfileScreen

        onOpenWardrobe={() => undefined}

      />
    </TestProviders>,
  );

  expect(result.getByTestId(`profile-rail-item-${newer.id}`).props.accessibilityLabel).toBe(
    'City shell, 1 of 2.',
  );
  expect(result.getByTestId(`profile-rail-item-${older.id}`).props.accessibilityLabel).toBe(
    `${messages.en.catalog['catalog.garment_type.rain_jacket.name']}, 2 of 2.`,
  );
  expect(result.queryByTestId('profile-rail-all-pieces')).toBeNull();
});

test('a ninth owned piece adds the "All pieces" tile, which opens the closet with no filter', async () => {
  mockFontScale(1);
  const onOpenWardrobe = jest.fn();
  const items = Array.from({ length: 9 }, (_, index) =>
    itemWithId(`00000000-0000-0000-0000-00000000000${index}`, {
      createdAt: `2026-07-${20 + index}T10:00:00.000Z`,
    }),
  );
  const result = await render(
    <TestProviders items={items}>
      <ProfileScreen

        onOpenWardrobe={onOpenWardrobe}

      />
    </TestProviders>,
  );

  const tiles = result
    .queryAllByTestId(/^profile-rail-item-/)
    .filter((node) => !String(node.props.testID).endsWith('-tile'));

  expect(tiles).toHaveLength(8);
  await fireEvent.press(result.getByTestId('profile-rail-all-pieces'));
  expect(onOpenWardrobe).toHaveBeenCalledWith();
});

test('the rail tile scales by min(fontScale, 2) above 1.5 per ADR 0028 section 3', async () => {
  mockFontScale(3.12);
  const result = await render(
    <TestProviders items={[baseItem]}>
      <ProfileScreen

        onOpenWardrobe={() => undefined}

      />
    </TestProviders>,
  );

  const tile = result.getByTestId(`profile-rail-item-${baseItem.id}-tile`);
  const tileStyle = StyleSheet.flatten(tile.props.style);

  expect(tileStyle.width).toBe(272);
  expect(tileStyle.height).toBe(340);
  expect(tileStyle.borderRadius).toBe(14);
  const artwork = result.getByTestId(`profile-rail-silhouette-${baseItem.id}`, { includeHiddenElements: true });
  expect(artwork).toHaveProp('width', 272);
  expect(artwork).toHaveProp('height', 340);
});

test('the empty Closet shows the sentence and the Add a piece action, and hides the Wanted row', async () => {
  mockFontScale(1);
  const onOpenWardrobe = jest.fn();
  const result = await render(
    <TestProviders items={[]}>
      <ProfileScreen

        onOpenWardrobe={onOpenWardrobe}

      />
    </TestProviders>,
  );

  expect(result.getByText(messages.en.profile.wardrobeEmpty)).toBeOnTheScreen();
  expect(result.queryByTestId('profile-wanted-row')).toBeNull();
  await fireEvent.press(result.getByTestId('profile-add-piece-button'));
  expect(onOpenWardrobe).toHaveBeenCalledWith();
});

test('a wanted-only closet counts its pieces and falls back to the wanted rail', async () => {
  mockFontScale(1);
  const onOpenWardrobe = jest.fn();
  const result = await render(
    <TestProviders items={[itemWithId(baseItem.id, { entryState: 'wanted' })]}>
      <ProfileScreen

        onOpenWardrobe={onOpenWardrobe}

      />
    </TestProviders>,
  );

  // The empty state needs both lists empty, so a wanted-only Closet keeps a rail and a
  // count rather than reading zero beside nothing at all.
  expect(result.getByTestId('profile-rail')).toBeOnTheScreen();
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
      <ProfileScreen

        onOpenWardrobe={onOpenWardrobe}

      />
    </TestProviders>,
  );

  const wantedRow = result.getByTestId('profile-wanted-row');
  expect(wantedRow.props.accessibilityLabel).toBe(`${messages.en.profile.wantedLabel}, 0`);
  await fireEvent.press(wantedRow);
  expect(onOpenWardrobe).toHaveBeenCalledWith('wanted');
});

test('Profile removes the location row and keeps a label-only History row', async () => {
  const result = await render(
    <TestProviders items={[baseItem]}>
      <ProfileScreen onOpenWardrobe={() => undefined} />
    </TestProviders>,
  );
  expect(result.queryByTestId('profile-location-row')).toBeNull();
  const history = result.getByTestId('profile-history-row');
  expect(history).toBeOnTheScreen();
  expect(result.getByText(messages.en.profile.historyLabel)).toBeOnTheScreen();
  expect(history.props.accessibilityRole).toBeUndefined();
});

test('the Closet heading uses the name while the rest of Profile stays the same', async () => {
  const result = await render(
    <TestProviders items={[baseItem]}>
      <ProfileScreen displayName="Utku" onOpenWardrobe={() => undefined} />
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
      <ProfileScreen displayName="Utku" onOpenWardrobe={() => undefined} />
    </TestProviders>,
  );
  expect(result.getByText('Gardırop · Utku')).toBeOnTheScreen();
  expect(result.getByTestId('profile-closet-heading').props.accessibilityLabel)
    .toBe('Gardırop · Utku, 1.');
});

test.each(['loading', 'error'] as const)(
  'a %s wardrobe status renders its status text instead of the rail or the group\'s Wanted row',
  async (status) => {
    mockFontScale(1);
    const result = await render(
      <TestProviders items={[]} status={status}>
        <ProfileScreen

          onOpenWardrobe={() => undefined}

        />
      </TestProviders>,
    );

    const expectedText =
      status === 'loading'
        ? messages.en.profile.wardrobeLoading
        : messages.en.profile.wardrobeUnavailable;

    expect(result.getByText(expectedText)).toBeOnTheScreen();
    expect(result.queryByTestId('profile-closet-heading-count')).toBeNull();
    expect(result.queryByTestId('profile-wanted-row')).toBeNull();
    expect(result.getByTestId('profile-history-row')).toBeOnTheScreen();
  },
);

// ADR 0025 gives the five accessories their own silhouettes, so an
// accessory draws like any typed garment; only a legacy entry without a type falls back
// to the category placeholder.
test('the rail draws coloured silhouettes for typed garments and accessories, and a glyph for legacy entries', async () => {
  const accessory = itemWithId('accessory', { garmentTypeId: 'beanie', category: 'accessory' });
  const legacy = itemWithId('legacy', { garmentTypeId: null });
  const result = await render(
    <TestProviders items={[baseItem, accessory, legacy]}>
      <ProfileScreen onOpenWardrobe={() => undefined} />
    </TestProviders>,
  );
  const hidden = { includeHiddenElements: true };
  for (const item of [baseItem, accessory]) {
    expect(result.getByTestId(`profile-rail-silhouette-${item.id}`, hidden)).toBeOnTheScreen();
    expect(result.queryByTestId(`profile-rail-photo-placeholder-${item.id}`, hidden)).toBeNull();
  }
  expect(result.getByTestId(`profile-rail-photo-placeholder-${legacy.id}`, hidden)).toBeOnTheScreen();
  expect(result.queryByTestId(`profile-rail-silhouette-${legacy.id}`, hidden)).toBeNull();
});

test('the rail prefers a photo, falling to the silhouette when the photo cannot load', async () => {
  const result = await render(
    <TestProviders items={[{ ...baseItem, photoRelativePath: 'photo.jpg' }]} resolvePhotoUri={() => 'file:///photo.jpg'}>
      <ProfileScreen onOpenWardrobe={() => undefined} />
    </TestProviders>,
  );
  const hidden = { includeHiddenElements: true };
  const photo = result.getByTestId(`profile-rail-photo-${baseItem.id}`, hidden);
  expect(photo).toHaveProp('resizeMode', 'cover');
  expect(result.queryByTestId(`profile-rail-silhouette-${baseItem.id}`, hidden)).toBeNull();
  await fireEvent(photo, 'error');
  expect(result.getByTestId(`profile-rail-silhouette-${baseItem.id}`, hidden)).toBeOnTheScreen();
  expect(result.queryByTestId(`profile-rail-photo-${baseItem.id}`, hidden)).toBeNull();
});
