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

// The native control layer (ADR 0019) renders native views that do not mount under
// Jest, and the wrapper already has its own coverage in
// `components/ui/__tests__/segmented-control.component.test.tsx`. This screen test
// mocks the wrapper itself rather than its native dependency, which also keeps
// `features/` clear of that dependency's name, the boundary this repository greps for.
jest.mock('@/components/ui/segmented-control', () => {
  const { Pressable: MockPressable, View: MockView } = jest.requireActual('react-native');

  function MockSegmentedControl({
    onChange,
    options,
    testID,
    value,
  }: Readonly<{
    onChange: (value: string) => void;
    options: readonly Readonly<{ label: string; value: string }>[];
    testID?: string;
    value: string;
  }>) {
    return (
      <MockView testID={testID}>
        {options.map((option, index) => (
          <MockPressable
            accessibilityRole="button"
            accessibilityState={{ selected: option.value === value }}
            key={option.value}
            onPress={() => onChange(option.value)}
            testID={testID ? `${testID}-segment-${index}` : undefined}
          />
        ))}
      </MockView>
    );
  }

  return { SegmentedControl: MockSegmentedControl };
});

jest.mock('expo-router', () => {
  const push = jest.fn();
  const back = jest.fn();

  return {
    useFocusEffect: () => undefined,
    useRouter: () => ({ back, push }),
    __mockBack: back,
    __mockPush: push,
  };
});

const { __mockBack: mockBack, __mockPush: mockPush } = jest.requireMock('expo-router') as {
  __mockBack: jest.Mock;
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
  mockBack.mockClear();
  mockPush.mockClear();
});

// The plus bar button that replaces this action lives in the route file's
// `Stack.Screen` `headerRight`, not in `WardrobeListRoute`'s own tree, exactly as
// `profile.tsx`'s settings gear is untested at the route level; only the empty state's
// own "Add a piece" button is this component's to test.
test('the empty state add action navigates to the absolute new-item route', async () => {
  const result = await renderRoute([]);
  await fireEvent.press(result.getByTestId('wardrobe-empty-add-button'));
  expect(mockPush).toHaveBeenLastCalledWith('/wardrobe/new');
});

test('selecting an item navigates to its absolute edit route', async () => {
  const result = await renderRoute([item]);
  const tile = result.getByTestId(`wardrobe-item-${item.id}`);
  // ADR 0029 section 1: the user's own name, then the type as the subline.
  expect(tile.props.accessibilityLabel).toBe(
    `${item.name}. ${messages.en.catalog['catalog.garment_type.rain_jacket.name']}`,
  );
  await fireEvent.press(tile);
  expect(mockPush).toHaveBeenCalledWith(`/wardrobe/${item.id}`);
});

test('an initial entry state, passed by the route for ADR 0028\'s Wanted row, selects that filter on first render', async () => {
  const wantedItem = { ...item, id: '218f0f4d-1d45-4ae7-a8f1-796e8297d3b4', entryState: 'wanted' as const };
  const result = await render(
    <TestProviders application={createApplication([item, wantedItem])}>
      <WardrobeListRoute initialEntryState="wanted" />
    </TestProviders>,
  );

  expect(
    result.getByTestId('wardrobe-entry-filter-segment-1').props.accessibilityState.selected,
  ).toBe(true);
  expect(
    result.getByTestId('wardrobe-entry-filter-segment-0').props.accessibilityState.selected,
  ).toBe(false);
});
