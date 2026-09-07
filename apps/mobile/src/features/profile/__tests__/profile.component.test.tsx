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
            hasRefreshError: false,
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
}: PropsWithChildren<{
  items: readonly WardrobeItem[];
  status?: 'ready' | 'loading' | 'error';
}>) {
  return (
    <WardrobeApplicationContext.Provider value={application(items, status)}>
      <LocalizationContext.Provider value={{ language: 'en', messages: messages.en }}>
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

test('the Closet heading shows the owned count and opens the closet with no filter', async () => {
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
        activePlaceName="Istanbul"
        onOpenWardrobe={onOpenWardrobe}
        onOpenWeather={() => undefined}
      />
    </TestProviders>,
  );

  expect(result.getByTestId('profile-closet-heading-count')).toHaveTextContent('2');
  await fireEvent.press(result.getByTestId('profile-closet-heading'));
  expect(onOpenWardrobe).toHaveBeenCalledWith();
});

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
        activePlaceName={null}
        onOpenWardrobe={() => undefined}
        onOpenWeather={() => undefined}
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
        activePlaceName={null}
        onOpenWardrobe={onOpenWardrobe}
        onOpenWeather={() => undefined}
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
        activePlaceName={null}
        onOpenWardrobe={() => undefined}
        onOpenWeather={() => undefined}
      />
    </TestProviders>,
  );

  const tile = result.getByTestId(`profile-rail-item-${baseItem.id}-tile`);
  const tileStyle = StyleSheet.flatten(tile.props.style);

  expect(tileStyle.width).toBe(272);
  expect(tileStyle.height).toBe(340);
  expect(tileStyle.borderRadius).toBe(14);
});

test('the empty Closet shows the sentence and the Add a piece action, and hides the Wanted row', async () => {
  mockFontScale(1);
  const onOpenWardrobe = jest.fn();
  const result = await render(
    <TestProviders items={[]}>
      <ProfileScreen
        activePlaceName={null}
        onOpenWardrobe={onOpenWardrobe}
        onOpenWeather={() => undefined}
      />
    </TestProviders>,
  );

  expect(result.getByText(messages.en.profile.wardrobeEmpty)).toBeOnTheScreen();
  expect(result.queryByTestId('profile-wanted-row')).toBeNull();
  await fireEvent.press(result.getByTestId('profile-add-piece-button'));
  expect(onOpenWardrobe).toHaveBeenCalledWith();
});

test('a wanted-only closet keeps the Wanted row and skips the rail', async () => {
  mockFontScale(1);
  const onOpenWardrobe = jest.fn();
  const result = await render(
    <TestProviders items={[itemWithId(baseItem.id, { entryState: 'wanted' })]}>
      <ProfileScreen
        activePlaceName={null}
        onOpenWardrobe={onOpenWardrobe}
        onOpenWeather={() => undefined}
      />
    </TestProviders>,
  );

  expect(result.queryByTestId('profile-rail')).toBeNull();
  expect(result.queryByText(messages.en.profile.wardrobeEmpty)).toBeNull();
  const wantedRow = result.getByTestId('profile-wanted-row');
  expect(wantedRow.props.accessibilityLabel).toBe(`${messages.en.profile.wantedLabel}, 1`);
  await fireEvent.press(wantedRow);
  expect(onOpenWardrobe).toHaveBeenCalledWith('wanted');
});

test('the Location row shows the place at bodyStrong with an approximate caption and opens Weather', async () => {
  mockFontScale(1);
  const onOpenWeather = jest.fn();
  const result = await render(
    <TestProviders items={[baseItem]}>
      <ProfileScreen
        activePlaceName="Istanbul"
        onOpenWardrobe={() => undefined}
        onOpenWeather={onOpenWeather}
      />
    </TestProviders>,
  );

  const row = result.getByTestId('profile-location-row');
  expect(row.props.accessibilityLabel).toBe(
    `Istanbul, ${messages.en.weather.approximateLocation}`,
  );
  expect(result.getByText('Istanbul')).toBeOnTheScreen();
  expect(result.getByText(messages.en.weather.approximateLocation)).toBeOnTheScreen();
  await fireEvent.press(row);
  expect(onOpenWeather).toHaveBeenCalledTimes(1);
});

test('the Location row falls back to the unset label with no approximate caption', async () => {
  mockFontScale(1);
  const result = await render(
    <TestProviders items={[]}>
      <ProfileScreen
        activePlaceName={null}
        onOpenWardrobe={() => undefined}
        onOpenWeather={() => undefined}
      />
    </TestProviders>,
  );

  const row = result.getByTestId('profile-location-row');
  expect(row.props.accessibilityLabel).toBe(messages.en.profile.locationUnset);
  expect(result.queryByText(messages.en.weather.approximateLocation)).toBeNull();
});

test.each(['loading', 'error'] as const)(
  'a %s wardrobe status renders its status text instead of the rail or the group\'s Wanted row',
  async (status) => {
    mockFontScale(1);
    const result = await render(
      <TestProviders items={[]} status={status}>
        <ProfileScreen
          activePlaceName={null}
          onOpenWardrobe={() => undefined}
          onOpenWeather={() => undefined}
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
    expect(result.getByTestId('profile-location-row')).toBeOnTheScreen();
  },
);
