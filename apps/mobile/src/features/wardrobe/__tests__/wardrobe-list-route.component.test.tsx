import { fireEvent, render } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import {
  WardrobeApplicationContext,
  type WardrobeApplicationValue,
} from '@/features/wardrobe/application/wardrobe-application-context';
import type { WardrobeItem } from '@/features/wardrobe/domain/wardrobe-item';
import { WardrobeListRoute } from '@/features/wardrobe/presentation/wardrobe-list-route';
import { LocalizationContext } from '@/localization/localization-context';
import { messages } from '@/localization/messages';
import { lightTheme } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

jest.mock('expo-symbols', () => ({
  SymbolView: () => null,
}));

jest.mock('expo-router', () => {
  const push = jest.fn();

  return {
    useFocusEffect: () => undefined,
    useRouter: () => ({ push }),
    __mockPush: push,
  };
});

const { __mockPush: mockPush } = jest.requireMock('expo-router') as {
  __mockPush: jest.Mock;
};

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

function createApplication(items: readonly WardrobeItem[]): WardrobeApplicationValue {
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
  application,
  children,
}: PropsWithChildren<{ application: WardrobeApplicationValue }>) {
  return (
    <WardrobeApplicationContext.Provider value={application}>
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

async function renderRoute(items: readonly WardrobeItem[]) {
  return render(
    <TestProviders application={createApplication(items)}>
      <WardrobeListRoute />
    </TestProviders>,
  );
}

beforeEach(() => {
  mockPush.mockClear();
});

test('empty and populated add actions navigate to the absolute new-item route', async () => {
  const empty = await renderRoute([]);
  await fireEvent.press(empty.getByTestId('wardrobe-empty-add-button'));
  expect(mockPush).toHaveBeenLastCalledWith('/wardrobe/new');
  await empty.unmount();

  const populated = await renderRoute([item]);
  await fireEvent.press(populated.getByTestId('wardrobe-add-button'));
  expect(mockPush).toHaveBeenLastCalledWith('/wardrobe/new');
});

test('selecting an item navigates to its absolute edit route', async () => {
  const result = await renderRoute([item]);
  await fireEvent.press(result.getByTestId(`wardrobe-item-${item.id}`));
  expect(mockPush).toHaveBeenCalledWith(`/wardrobe/${item.id}`);
});
