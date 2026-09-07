import { fireEvent, render } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { WardrobeApplicationState } from '@/features/wardrobe/application/wardrobe-application-controller';
import type { WardrobeItem } from '@/features/wardrobe/domain/wardrobe-item';
import {
  WardrobeListScreen,
  resolveGridGeometry,
} from '@/features/wardrobe/presentation/wardrobe-list-screen';
import { LocalizationContext } from '@/localization/localization-context';
import { messages, type SupportedLanguage } from '@/localization/messages';
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
            accessibilityLabel={option.label}
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

const initialMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, right: 0, bottom: 34, left: 0 },
};

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
    <LocalizationContext.Provider value={{ language, messages: messages[language] }}>
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
    hasRefreshError: false,
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

test('error state retries and shows no chips', async () => {
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
  expect(result.queryByTestId('wardrobe-category-chips')).not.toBeOnTheScreen();
  await fireEvent.press(result.getByTestId('wardrobe-retry-button'));
  expect(onRetry).toHaveBeenCalledTimes(1);
});

test('an empty filter reuses Profile\'s empty sentence and add-a-piece action', async () => {
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

  expect(result.getByText(messages.en.profile.wardrobeEmpty)).toBeOnTheScreen();
  await fireEvent.press(
    result.getByRole('button', { name: messages.en.profile.addPieceAction }),
  );
  expect(onAdd).toHaveBeenCalledTimes(1);
});

test('the wanted segment shows its own empty state when only owned items exist', async () => {
  const result = await render(
    <TestProviders>
      <WardrobeListScreen
        initialEntryState="wanted"
        onAdd={() => undefined}
        onEdit={() => undefined}
        onRetry={() => undefined}
        state={readyState([ownedItem])}
      />
    </TestProviders>,
  );

  expect(result.getByTestId('wardrobe-empty')).toBeOnTheScreen();
  expect(result.queryByTestId(`wardrobe-item-${ownedItem.id}`)).not.toBeOnTheScreen();
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

test('a photo tile falls back to the category glyph after a load failure', async () => {
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
  await fireEvent(photo, 'error');
  expect(
    result.queryByTestId(`wardrobe-photo-${ownedItem.id}`),
  ).not.toBeOnTheScreen();
  expect(
    result.getByTestId(`wardrobe-photo-placeholder-${ownedItem.id}`, {
      includeHiddenElements: true,
    }),
  ).toBeOnTheScreen();
});

test('category chips list only the categories present in the current segment, catalogue order, and filter the grid', async () => {
  const result = await render(
    <TestProviders>
      <WardrobeListScreen
        onAdd={() => undefined}
        onEdit={() => undefined}
        onRetry={() => undefined}
        state={readyState([ownedItem, legacyItem])}
      />
    </TestProviders>,
  );

  expect(result.getByTestId('wardrobe-category-chip-all')).toBeOnTheScreen();
  // `ownedItem` is outerwear and `legacyItem` is top; catalogue order is top before
  // outerwear, and footwear (only on the wanted item) must not appear here.
  expect(result.getByTestId('wardrobe-category-chip-top')).toBeOnTheScreen();
  expect(result.getByTestId('wardrobe-category-chip-outerwear')).toBeOnTheScreen();
  expect(result.queryByTestId('wardrobe-category-chip-footwear')).not.toBeOnTheScreen();

  await fireEvent.press(result.getByTestId('wardrobe-category-chip-outerwear'));
  expect(result.getByTestId(`wardrobe-item-${ownedItem.id}`)).toBeOnTheScreen();
  expect(result.queryByTestId(`wardrobe-item-${legacyItem.id}`)).not.toBeOnTheScreen();
  expect(
    result.getByTestId('wardrobe-category-chip-outerwear').props.accessibilityState.selected,
  ).toBe(true);
});

test('switching the segmented control changes which items are shown', async () => {
  const result = await render(
    <TestProviders>
      <WardrobeListScreen
        onAdd={() => undefined}
        onEdit={() => undefined}
        onRetry={() => undefined}
        state={readyState([ownedItem, wantedItem])}
      />
    </TestProviders>,
  );

  expect(result.getByTestId(`wardrobe-item-${ownedItem.id}`)).toBeOnTheScreen();
  expect(result.queryByTestId(`wardrobe-item-${wantedItem.id}`)).not.toBeOnTheScreen();

  await fireEvent.press(result.getByTestId('wardrobe-entry-filter-segment-1'));

  expect(result.getByTestId(`wardrobe-item-${wantedItem.id}`)).toBeOnTheScreen();
  expect(result.queryByTestId(`wardrobe-item-${ownedItem.id}`)).not.toBeOnTheScreen();
});

test('a background refresh failure shows a retryable banner without discarding the grid', async () => {
  const onRetry = jest.fn();
  const result = await render(
    <TestProviders>
      <WardrobeListScreen
        onAdd={() => undefined}
        onEdit={() => undefined}
        onRetry={onRetry}
        state={readyState([ownedItem], { hasRefreshError: true })}
      />
    </TestProviders>,
  );

  expect(result.getByTestId('wardrobe-refresh-error')).toBeOnTheScreen();
  expect(result.getByTestId(`wardrobe-item-${ownedItem.id}`)).toBeOnTheScreen();
  await fireEvent.press(
    result.getByRole('button', { name: messages.en.wardrobe.retryAction }),
  );
  expect(onRetry).toHaveBeenCalledTimes(1);
});

test('grid geometry follows the window width and reproduces ADR 0029 at the 393 point reference', () => {
  const twoColumns = resolveGridGeometry(393, false);
  expect(twoColumns.numColumns).toBe(2);
  expect(twoColumns.geometry.width).toBe(174.5);
  expect(twoColumns.geometry.height).toBeCloseTo(218, 5);

  const oneColumn = resolveGridGeometry(393, true);
  expect(oneColumn.numColumns).toBe(1);
  expect(oneColumn.geometry.width).toBe(361);
  expect(oneColumn.geometry.height).toBeCloseTo(280, 5);

  // A 375 point device: two tiles plus the gap still fit inside the 343 point content box.
  const narrow = resolveGridGeometry(375, false);
  expect(narrow.geometry.width * 2 + 12).toBe(343);
});
