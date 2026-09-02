import { fireEvent, render } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
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

const item: WardrobeItem = {
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

function application(items: readonly WardrobeItem[]): WardrobeApplicationValue {
  return {
    state: {
      status: 'ready',
      items,
      isRefreshing: false,
      isMutating: false,
      hasRefreshError: false,
    },
    refresh: async () => undefined,
    getItem: async () => null,
    preparePhoto: async () => null,
    discardStagedPhoto: async () => undefined,
    resolvePhotoUri: () => null,
    createItem: async () => item,
    updateItem: async () => item,
    softDeleteItem: async () => item,
  };
}

function TestProviders({
  children,
  items,
}: PropsWithChildren<{ items: readonly WardrobeItem[] }>) {
  return (
    <WardrobeApplicationContext.Provider value={application(items)}>
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

test('Profile settings entry point is reachable and wardrobe counts render', async () => {
  const onOpenSettings = jest.fn();
  const result = await render(
    <TestProviders
      items={[
        item,
        { ...item, id: '218f0f4d-1d45-4ae7-a8f1-796e8297d3b4' },
        {
          ...item,
          id: '318f0f4d-1d45-4ae7-a8f1-796e8297d3b4',
          entryState: 'wanted',
        },
      ]}>
      <ProfileScreen
        activePlaceName="Istanbul"
        onOpenSettings={onOpenSettings}
        onOpenWardrobe={() => undefined}
        onOpenWeather={() => undefined}
      />
    </TestProviders>,
  );

  await fireEvent.press(
    result.getByRole('button', { name: messages.en.profile.settingsAction }),
  );
  expect(onOpenSettings).toHaveBeenCalledTimes(1);
  expect(result.getByTestId('profile-owned-count')).toHaveTextContent('2');
  expect(result.getByTestId('profile-wanted-count')).toHaveTextContent('1');
  expect(result.getByTestId('profile-category-outerwear-count')).toHaveTextContent('3');
  expect(
    result.getByRole('header', { name: messages.en.profile.wardrobeTitle }),
  ).toBeOnTheScreen();
  for (const category of ['top', 'bottom', 'outerwear', 'footwear'] as const) {
    const categoryLabel =
      messages.en.catalog[`catalog.attribute.structural_category.${category}`];
    const count = category === 'outerwear' ? 3 : 0;
    expect(result.getByText(categoryLabel)).toBeOnTheScreen();
    expect(result.getByLabelText(
      messages.en.profile.categoryCountAccessibilityLabel({ category: categoryLabel, count }),
    )).toBeOnTheScreen();
  }
});

test('Profile renders the localized empty wardrobe state', async () => {
  const result = await render(
    <TestProviders items={[]}>
      <ProfileScreen
        activePlaceName={null}
        onOpenSettings={() => undefined}
        onOpenWardrobe={() => undefined}
        onOpenWeather={() => undefined}
      />
    </TestProviders>,
  );

  expect(result.getByText(messages.en.profile.wardrobeEmpty)).toBeOnTheScreen();
});

test('Profile opens the active location and reports working recommendations', async () => {
  const onOpenWeather = jest.fn();
  const result = await render(
    <TestProviders items={[item]}>
      <ProfileScreen
        activePlaceName="Istanbul"
        onOpenSettings={() => undefined}
        onOpenWardrobe={() => undefined}
        onOpenWeather={onOpenWeather}
      />
    </TestProviders>,
  );

  expect(
    result.getByRole('header', { name: messages.en.profile.locationTitle }),
  ).toBeOnTheScreen();
  await fireEvent.press(
    result.getByRole('button', {
      name: `Istanbul, ${messages.en.weather.approximateLocation}`,
    }),
  );
  expect(onOpenWeather).toHaveBeenCalledTimes(1);
  expect(result.getByText(messages.en.profile.recommendationsWorking)).toBeOnTheScreen();
});

test('Profile renders the unset location without an approximate caption', async () => {
  const result = await render(
    <TestProviders items={[]}>
      <ProfileScreen
        activePlaceName={null}
        onOpenSettings={() => undefined}
        onOpenWardrobe={() => undefined}
        onOpenWeather={() => undefined}
      />
    </TestProviders>,
  );

  expect(
    result.getByRole('button', { name: messages.en.profile.locationUnset }),
  ).toBeOnTheScreen();
  expect(result.queryByText(messages.en.weather.approximateLocation)).not.toBeOnTheScreen();
  expect(
    result.getByText(messages.en.profile.recommendationsNeedLocation),
  ).toBeOnTheScreen();
});
