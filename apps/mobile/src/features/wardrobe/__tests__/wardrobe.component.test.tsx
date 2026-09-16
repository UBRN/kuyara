import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { Dimensions, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ProductAnalyticsProvider } from '@/features/analytics/application/product-analytics-provider';
import { InMemoryFirstUseStore } from '@/features/analytics/data/in-memory-first-use-store';
import { RecordingProductAnalytics } from '@/features/analytics/data/recording-product-analytics';
import {
  ageBucketProperty,
  dressStyleProperty,
} from '@/features/analytics/domain/analytics-mappers';
import {
  ProfileApplicationContext,
  type ProfileApplicationValue,
} from '@/features/profile/application/profile-context';
import type { LocalProfile } from '@/features/profile/domain/profile';
import {
  WardrobeApplicationContext,
  type WardrobeApplicationValue,
} from '@/features/wardrobe/application/wardrobe-application-context';
import type { WardrobeItem } from '@/features/wardrobe/domain/wardrobe-item';
import type { StagedWardrobePhoto } from '@/features/wardrobe/data/wardrobe-photo-adapters';
import type { WardrobeConfirmation } from '@/features/wardrobe/presentation/wardrobe-confirmation';
import { WardrobeItemFormScreen } from '@/features/wardrobe/presentation/wardrobe-item-form-screen';
import {
  WardrobeEditItemRoute,
  WardrobeNewItemRoute,
  WardrobeRouteStatus,
} from '@/features/wardrobe/presentation/wardrobe-item-routes';
import { LocalizationContext } from '@/localization/localization-context';
import { messages, type SupportedLanguage } from '@/localization/messages';
import { darkTheme, lightTheme, spacing } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

jest.mock('expo-symbols', () => ({
  SymbolView: () => null,
}));

// The type sheet presents native views, which do not mount under Jest (ADR 0019). The
// mock keeps the `index` contract the `NativeSheet` primitive drives: below zero the
// sheet is dismissed and its content is unmounted.
jest.mock('@expo/ui/community/bottom-sheet', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');

  return {
    BottomSheet: ({
      children,
      index,
    }: {
      children: React.ReactNode;
      index: number;
    }) => (index >= 0 ? React.createElement(View, null, children) : null),
  };
});

let mockFocusEffects: (() => void | (() => void))[] = [];
let mockSearchParams: Record<string, string | string[] | undefined> = {};

jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => void | (() => void)) => {
    mockFocusEffects.push(effect);
  },
  useNavigation: () => ({
    addListener: () => () => undefined,
    dispatch: () => undefined,
  }),
  useLocalSearchParams: () => mockSearchParams,
  useRouter: () => ({
    back: () => undefined,
    dismissTo: () => undefined,
    push: () => undefined,
    replace: () => undefined,
    setParams: () => undefined,
  }),
}));

const profile: LocalProfile = {
  id: 'profile-id',
  gender: 'woman',
  dressStyle: 'casual',
  birthDate: '1996-06-01',
  clothingPreference: 'womens',
  languagePreference: 'en',
  themePreference: 'light',
  onboardingCompleted: true,
  notificationsOptIn: true,
  weatherAlertOfferShown: false,
  analyticsConsent: 'undecided',
  createdAt: '2026-07-01T08:00:00.000Z',
  updatedAt: '2026-07-01T08:00:00.000Z',
};

function readyProfileApplication(
  overrides: Partial<LocalProfile> = {},
): ProfileApplicationValue {
  return {
    state: { status: 'ready', profile: { ...profile, ...overrides }, isSaving: false },
    retry: async () => undefined,
    completeOnboarding: async () => undefined,
    updateGender: async () => undefined,
    updateDressStyle: async () => undefined,
    updateBirthDate: async () => undefined,
    updateLanguagePreference: async () => undefined,
    updateThemePreference: async () => undefined,
    updateNotificationsOptIn: async () => undefined,
    markWeatherAlertOfferShown: async () => undefined,
    updateAnalyticsConsent: async () => undefined,
  };
}

function AnalyticsProviders({
  analytics,
  children,
}: PropsWithChildren<{ analytics?: RecordingProductAnalytics }>) {
  return (
    <ProductAnalyticsProvider
      analytics={analytics ?? new RecordingProductAnalytics()}
      firstUseStore={new InMemoryFirstUseStore()}>
      <ProfileApplicationContext.Provider value={readyProfileApplication()}>
        {children}
      </ProfileApplicationContext.Provider>
    </ProductAnalyticsProvider>
  );
}

const initialMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, right: 0, bottom: 34, left: 0 },
};

const originalWindowDimensions = Dimensions.get('window');

afterEach(() => {
  Dimensions.set({ window: originalWindowDimensions });
});

beforeEach(() => {
  mockFocusEffects = [];
  mockSearchParams = {};
});

const item: WardrobeItem = {
  id: '118f0f4d-1d45-4ae7-a8f1-796e8297d3b4',
  localProfileId: '018f0f4d-1d45-4ae7-a8f1-796e8297d3b4',
  name: 'City shell',
  category: 'outerwear',
  entryState: 'owned',
  garmentTypeId: 'rain_jacket',
  color: 'Legacy petrol',
  colorFamily: 'blue',
  thermalLevelOverride: 'moderate',
  waterProtectionOverride: 'water_resistant',
  windProtectionOverride: null,
  breathabilityOverride: 'high',
  armCoverageOverride: 'partial',
  legCoverageOverride: null,
  tractionSuitabilityOverride: null,
  photoRelativePath: null,
  createdAt: '2026-07-30T10:00:00.000Z',
  updatedAt: '2026-07-30T10:05:00.000Z',
  deletedAt: null,
};

const wantedItem: WardrobeItem = {
  ...item,
  id: '218f0f4d-1d45-4ae7-a8f1-796e8297d3b4',
  name: 'Trail boots',
  entryState: 'wanted',
};

const stagedPhoto: StagedWardrobePhoto = {
  id: '218f0f4d-1d45-4ae7-a8f1-796e8297d3b4',
  previewUri: 'file:///private/cache/staged-photo.jpg',
};

function TestProviders({
  children,
  dark = false,
  language = 'en',
}: PropsWithChildren<{ dark?: boolean; language?: SupportedLanguage }>) {
  return (
    <LocalizationContext.Provider value={{ language, messages: messages[language], hour12: false }}>
      <KuyaraThemeContext.Provider value={dark ? darkTheme : lightTheme}>
        <SafeAreaProvider initialMetrics={initialMetrics}>
          {children}
        </SafeAreaProvider>
      </KuyaraThemeContext.Provider>
    </LocalizationContext.Provider>
  );
}

test('missing items show a localized safe return instead of crashing', async () => {
  const onBack = jest.fn();
  const result = await render(
    <TestProviders language="tr">
      <WardrobeRouteStatus onBack={onBack} status="not-found" />
    </TestProviders>,
  );
  expect(result.getByText(messages.tr.wardrobe.notFoundTitle)).toBeOnTheScreen();
  await fireEvent.press(
    result.getByRole('button', {
      name: messages.tr.wardrobe.returnToWardrobeAction,
    }),
  );
  expect(onBack).toHaveBeenCalledTimes(1);
});

test('create route shows initialization status instead of the form until wardrobe is ready', async () => {
  const refresh = jest.fn(async () => undefined);
  const application = {
    refresh,
    getItem: async () => null,
    preparePhoto: async () => null,
    discardStagedPhoto: async () => undefined,
    resolvePhotoUri: () => null,
    createItem: async () => item,
    updateItem: async () => item,
    softDeleteItem: async () => item,
  };
  const renderRoute = (state: WardrobeApplicationValue['state']) =>
    render(
      <WardrobeApplicationContext.Provider value={{ ...application, state }}>
        <TestProviders>
          <AnalyticsProviders>
            <WardrobeNewItemRoute />
          </AnalyticsProviders>
        </TestProviders>
      </WardrobeApplicationContext.Provider>,
    );

  const loading = await renderRoute({ status: 'loading' });
  expect(loading.getByTestId('wardrobe-item-loading')).toBeOnTheScreen();
  expect(loading.queryByTestId('wardrobe-save-button')).not.toBeOnTheScreen();
  await loading.unmount();

  const error = await renderRoute({ status: 'error' });
  expect(error.getByTestId('wardrobe-item-error')).toBeOnTheScreen();
  expect(error.queryByTestId('wardrobe-save-button')).not.toBeOnTheScreen();
  await fireEvent.press(
    error.getByRole('button', { name: messages.en.wardrobe.retryAction }),
  );
  expect(refresh).toHaveBeenCalledTimes(1);
});

function CreateForm({
  clothingPreference = null,
  confirmation,
  onCreate = async () => undefined,
  onDirtyChange = () => undefined,
}: Readonly<{
  clothingPreference?: 'womens' | 'mens' | null;
  confirmation?: WardrobeConfirmation;
  onCreate?: (input: Record<string, unknown>) => Promise<void>;
  onDirtyChange?: (dirty: boolean) => void;
}>) {
  return (
    <TestProviders>
      <WardrobeItemFormScreen
        clothingPreference={clothingPreference}
        confirmation={confirmation}
        isBusy={false}
        mode="create"
        onCreate={onCreate}
        onDirtyChange={onDirtyChange}
      />
    </TestProviders>
  );
}

// The Drawer replaces the pushed picker route: the form's type row opens a sheet over
// the form, and the tile inside it is the selection. Pressing the category chip first
// is a no-op when the sheet already opens on that category.
async function chooseType(
  result: Awaited<ReturnType<typeof render>>,
  category: string,
  typeId: string,
) {
  await fireEvent.press(result.getByTestId('wardrobe-type-picker-row'));
  await fireEvent.press(result.getByTestId(`wardrobe-type-category-${category}`));
  await fireEvent.press(result.getByTestId(`wardrobe-type-${typeId}`));
}

test('create and edit forms leave the top safe area to the platform instead of a fixed offset', async () => {
  const createResult = await render(<CreateForm />);
  const createForm = createResult.getByTestId('wardrobe-create-form');
  const createContentStyle = StyleSheet.flatten(createForm.props.contentContainerStyle);
  // The form reserves no clearance of its own, so iOS resolves the top safe area
  // through the content inset. A non-zero padding here would mean a fixed offset
  // crept back in and would double the inset.
  expect(createForm.props.contentInsetAdjustmentBehavior).toBe('automatic');
  expect(createContentStyle.paddingTop).toBe(0);

  const editResult = await render(
    <TestProviders>
      <WardrobeItemFormScreen
        isBusy={false}
        item={item}
        mode="edit"
        onCreate={async () => undefined}
        onDirtyChange={() => undefined}
        onUpdate={async () => undefined}
      />
    </TestProviders>,
  );
  const editForm = editResult.getByTestId('wardrobe-edit-form');
  const editContentStyle = StyleSheet.flatten(editForm.props.contentContainerStyle);
  expect(editForm.props.contentInsetAdjustmentBehavior).toBe('automatic');
  expect(editContentStyle.paddingTop).toBe(0);
  // iOS leaves the bottom safe area and the tab bar to the automatic content inset.
  expect([createContentStyle.paddingBottom, editContentStyle.paddingBottom]).toEqual([
    spacing.md,
    spacing.md,
  ]);
});

test('create form keeps only the required picker and entry state options visible by default', async () => {
  const onCreate = jest.fn(async () => undefined);
  const result = await render(<CreateForm onCreate={onCreate} />);

  expect(result.getAllByRole('radio')).toHaveLength(2);
  expect(result.queryByRole('radio', { name: 'T-shirt' })).not.toBeOnTheScreen();
  expect(result.getByTestId('wardrobe-type-picker-row')).toHaveAccessibilityValue({
    text: messages.en.wardrobe.unclassifiedType,
  });
  expect(result.getByTestId('wardrobe-details-toggle').props.accessibilityState).toEqual(
    expect.objectContaining({ expanded: false }),
  );
  expect(result.queryByTestId('wardrobe-color-unspecified')).not.toBeOnTheScreen();
  expect(result.getByText(messages.en.wardrobe.detailsCaption)).toBeOnTheScreen();
  // The sheet is not mounted until the row opens it, and it dismisses itself on the tile.
  expect(result.queryByTestId('wardrobe-garment-type-picker')).not.toBeOnTheScreen();
  await fireEvent.press(result.getByTestId('wardrobe-type-picker-row'));
  expect(result.getByTestId('wardrobe-garment-type-picker')).toBeOnTheScreen();
  await fireEvent.press(result.getByTestId('wardrobe-type-t_shirt'));
  expect(result.queryByTestId('wardrobe-garment-type-picker')).not.toBeOnTheScreen();
  expect(result.getByTestId('wardrobe-type-picker-row')).toHaveAccessibilityValue({
    text: 'T-shirt',
  });
  expect(result.queryByTestId('wardrobe-delete-button')).not.toBeOnTheScreen();
  expect(result.getByTestId('wardrobe-entry-state-owned').props.accessibilityState.selected).toBe(true);
});

test('saving with no clothing type shows the hint instead of creating an item', async () => {
  const onCreate = jest.fn(async () => undefined);
  const result = await render(<CreateForm onCreate={onCreate} />);

  await fireEvent.press(result.getByTestId('wardrobe-save-button'));
  expect(result.getByTestId('wardrobe-type-error')).toHaveTextContent(
    messages.en.wardrobe.typeRequiredError,
  );
  expect(result.getByTestId('wardrobe-type-error')).toHaveProp(
    'accessibilityLiveRegion',
    'assertive',
  );
  expect(onCreate).not.toHaveBeenCalled();
});

// A legacy entry saved before the catalog, or one whose type was removed from it, cannot be
// saved as it stands, so the edit form says so on arrival rather than at the first Save.
test('the edit form shows the type hint on arrival for an entry with no resolvable type', async () => {
  const legacy = await render(
    <TestProviders>
      <WardrobeItemFormScreen
        isBusy={false}
        item={{ ...item, garmentTypeId: null }}
        mode="edit"
        onCreate={async () => undefined}
        onDirtyChange={() => undefined}
        onUpdate={async () => undefined}
      />
    </TestProviders>,
  );
  expect(legacy.getByTestId('wardrobe-type-error')).toHaveTextContent(
    messages.en.wardrobe.typeRequiredError,
  );

  const resolvable = await render(
    <TestProviders>
      <WardrobeItemFormScreen
        isBusy={false}
        item={item}
        mode="edit"
        onCreate={async () => undefined}
        onDirtyChange={() => undefined}
        onUpdate={async () => undefined}
      />
    </TestProviders>,
  );
  expect(resolvable.queryByTestId('wardrobe-type-error')).not.toBeOnTheScreen();
});

test('the type sheet lists only preference-filtered active types and marks the selection', async () => {
  const result = await render(<CreateForm clothingPreference="mens" />);
  await fireEvent.press(result.getByTestId('wardrobe-type-picker-row'));

  // Both one-piece garments are womens-only since catalog version 4, so the mens sheet
  // has no One-piece chip at all, and a womens-only top never reaches the Tops grid.
  expect(result.queryByTestId('wardrobe-type-category-one_piece')).not.toBeOnTheScreen();
  expect(result.getByTestId('wardrobe-type-category-top')).toBeOnTheScreen();
  expect(result.queryByTestId('wardrobe-type-blouse')).not.toBeOnTheScreen();
  expect(result.getByTestId('wardrobe-type-t_shirt')).toBeOnTheScreen();
  // The rail is the filter: a type from another category is not in the grid until its
  // chip is selected.
  expect(result.queryByTestId('wardrobe-type-rain_jacket')).not.toBeOnTheScreen();

  await fireEvent.press(result.getByTestId('wardrobe-type-category-outerwear'));
  const rainJacket = result.getByTestId('wardrobe-type-rain_jacket');
  expect(rainJacket.props.accessibilityRole).toBe('radio');
  expect(rainJacket.props.accessibilityState).toEqual(
    expect.objectContaining({ selected: false }),
  );
  await fireEvent.press(rainJacket);
  expect(result.getByTestId('wardrobe-type-picker-row')).toHaveAccessibilityValue({
    text: 'Rain jacket',
  });

  // Reopening lands on the selected type's own category with its tile already marked.
  await fireEvent.press(result.getByTestId('wardrobe-type-picker-row'));
  expect(
    result.getByTestId('wardrobe-type-rain_jacket').props.accessibilityState,
  ).toEqual(expect.objectContaining({ selected: true }));
});

test('the type sheet is localized from catalog and wardrobe keys', async () => {
  const result = await render(
    <TestProviders language="tr">
      <WardrobeItemFormScreen
        clothingPreference="womens"
        isBusy={false}
        mode="create"
        onCreate={async () => undefined}
        onDirtyChange={() => undefined}
      />
    </TestProviders>,
  );
  await fireEvent.press(result.getByTestId('wardrobe-type-picker-row'));

  expect(
    result.getByRole('header', { name: messages.tr.wardrobe.typeTitle }),
  ).toBeOnTheScreen();
  expect(
    result.getByText(messages.tr.wardrobe.categoryFilterLabels.one_piece),
  ).toBeOnTheScreen();
  expect(result.getByTestId('wardrobe-type-t_shirt').props.accessibilityLabel).toBe(
    messages.tr.catalog['catalog.garment_type.t_shirt.name'],
  );
});

test('create and edit forms persist the selected wardrobe state', async () => {
  const onCreate = jest.fn(async () => undefined);
  const createResult = await render(<CreateForm onCreate={onCreate} />);
  await chooseType(createResult, 'top', 't_shirt');
  await fireEvent.press(createResult.getByTestId('wardrobe-entry-state-wanted'));
  await fireEvent.press(createResult.getByTestId('wardrobe-save-button'));
  expect(onCreate).toHaveBeenCalledWith(
    expect.objectContaining({ entryState: 'wanted', garmentTypeId: 't_shirt' }),
  );

  const onUpdate = jest.fn(async () => undefined);
  const editResult = await render(
    <TestProviders>
      <WardrobeItemFormScreen
        isBusy={false}
        item={wantedItem}
        mode="edit"
        onCreate={async () => undefined}
        onDirtyChange={() => undefined}
        onUpdate={onUpdate}
      />
    </TestProviders>,
  );
  expect(editResult.getByTestId('wardrobe-entry-state-wanted').props.accessibilityState.selected).toBe(true);
  await fireEvent.press(editResult.getByTestId('wardrobe-entry-state-owned'));
  await fireEvent.press(editResult.getByTestId('wardrobe-save-button'));
  expect(onUpdate).toHaveBeenCalledWith(
    expect.objectContaining({ entryState: 'owned' }),
  );
});

// The seven property overrides stay stored fields and leave the form entirely, so the
// Details disclosure holds the colour family alone.
test('the details disclosure offers colour swatches and no property pickers', async () => {
  const result = await render(<CreateForm />);
  await chooseType(result, 'accessory', 'umbrella');

  expect(result.getByTestId('wardrobe-type-picker-row')).toHaveAccessibilityValue({
    text: 'Umbrella',
  });
  await fireEvent.press(result.getByTestId('wardrobe-details-toggle'));
  expect(result.queryByTestId('wardrobe-attribute-waterProtectionOverride')).not.toBeOnTheScreen();
  expect(result.queryByTestId('wardrobe-attribute-thermalLevelOverride')).not.toBeOnTheScreen();

  // Fourteen family swatches plus the "Any" chip, each a radio carrying its own name.
  const swatch = result.getByTestId('wardrobe-color-blue');
  expect(swatch.props.accessibilityRole).toBe('radio');
  expect(swatch.props.accessibilityLabel).toBe(
    messages.en.catalog['catalog.color_family.blue'],
  );
  // The name line is hidden from the accessibility tree on purpose: the swatches already
  // carry their names, so it is the sighted reader's confirmation only.
  const selectedName = () =>
    result.getByTestId('wardrobe-color-selected', { includeHiddenElements: true });
  expect(selectedName()).toHaveTextContent(messages.en.wardrobe.colorUnspecified);
  await fireEvent.press(swatch);
  expect(selectedName()).toHaveTextContent(
    messages.en.catalog['catalog.color_family.blue'],
  );
  // Law 1: selection is a `brandAccent` ring, never a fill.
  const selectedStyle = StyleSheet.flatten(
    result.getByTestId('wardrobe-color-blue').props.style,
  );
  expect(selectedStyle.borderColor).toBe(lightTheme.colors.brandAccent);
  expect(selectedStyle.backgroundColor).not.toBe(lightTheme.colors.brandAccent);
});

test('valid create maps values, blocks rapid duplicate presses, and reports dirty state', async () => {
  let resolveSave: (() => void) | undefined;
  const onCreate = jest.fn(
    () => new Promise<void>((resolve) => {
      resolveSave = resolve;
    }),
  );
  const onDirtyChange = jest.fn();
  const result = await render(
    <CreateForm onCreate={onCreate} onDirtyChange={onDirtyChange} />,
  );
  await chooseType(result, 'accessory', 'umbrella');

  await fireEvent.changeText(result.getByTestId('wardrobe-name-input'), 'City umbrella');
  await fireEvent.press(result.getByTestId('wardrobe-details-toggle'));
  await fireEvent.press(result.getByTestId('wardrobe-color-blue'));
  await fireEvent.press(result.getByTestId('wardrobe-save-button'));
  await fireEvent.press(result.getByTestId('wardrobe-save-button'));
  expect(onCreate).toHaveBeenCalledTimes(1);
  expect(onCreate).toHaveBeenCalledWith(
    expect.objectContaining({
      name: 'City umbrella',
      garmentTypeId: 'umbrella',
      colorFamily: 'blue',
    }),
  );
  expect(result.getByTestId('wardrobe-save-button').props.accessibilityState).toEqual(
    expect.objectContaining({ busy: true, disabled: true }),
  );
  resolveSave?.();
  await waitFor(() =>
    expect(result.getByTestId('wardrobe-save-button').props.accessibilityState).toEqual(
      expect.objectContaining({ busy: false }),
    ),
  );
  // The form no longer draws its own back control: the route's native header owns it and
  // the exit guard reads this flag, so dirty state reaching the guard is what matters.
  expect(onDirtyChange).toHaveBeenLastCalledWith(true);
});

test('create failure preserves entries and allows retry', async () => {
  const onCreate = jest
    .fn<Promise<void>, [Record<string, unknown>]>()
    .mockRejectedValueOnce(new Error('write failed'))
    .mockResolvedValueOnce(undefined);
  const result = await render(<CreateForm onCreate={onCreate} />);
  await chooseType(result, 'top', 't_shirt');
  await fireEvent.changeText(result.getByTestId('wardrobe-name-input'), 'My tee');
  await fireEvent.press(result.getByTestId('wardrobe-save-button'));

  await waitFor(() => expect(result.getByTestId('wardrobe-save-error')).toBeOnTheScreen());
  expect(result.getByTestId('wardrobe-name-input').props.value).toBe('My tee');
  await fireEvent.press(result.getByTestId('wardrobe-save-button'));
  await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(2));
});

test('unchanged and changed forms report distinct dirty state to the exit guard', async () => {
  const onDirtyChange = jest.fn();
  const result = await render(<CreateForm onDirtyChange={onDirtyChange} />);
  await fireEvent.changeText(result.getByTestId('wardrobe-name-input'), 'Changed');
  expect(onDirtyChange).toHaveBeenLastCalledWith(true);
  await fireEvent.changeText(result.getByTestId('wardrobe-name-input'), '');
  expect(onDirtyChange).toHaveBeenLastCalledWith(false);
});

// The header is the platform's, so the form draws no title and no back control of its own.
test('the form draws no header of its own', async () => {
  const result = await render(<CreateForm />);
  expect(result.queryByText(messages.en.wardrobe.newTitle)).not.toBeOnTheScreen();
  expect(result.queryByRole('header')).not.toBeOnTheScreen();
});

test('picker cancellation leaves the form unchanged and photo errors preserve other values', async () => {
  const onDirtyChange = jest.fn();
  const onSelectPhoto = jest
    .fn<Promise<StagedWardrobePhoto | null>, []>()
    .mockResolvedValueOnce(null)
    .mockRejectedValueOnce(new Error('picker unavailable'));
  const result = await render(
    <TestProviders>
      <WardrobeItemFormScreen
        isBusy={false}
        mode="create"
        onCreate={async () => undefined}
        onDirtyChange={onDirtyChange}
        onSelectPhoto={onSelectPhoto}
      />
    </TestProviders>,
  );

  await fireEvent.press(result.getByTestId('wardrobe-photo-select-button'));
  await waitFor(() => expect(onSelectPhoto).toHaveBeenCalledTimes(1));
  // A cancelled picker leaves nothing to discard, so the guard is never armed.
  expect(onDirtyChange).not.toHaveBeenCalledWith(true);

  await fireEvent.changeText(result.getByTestId('wardrobe-name-input'), 'My shell');
  await fireEvent.press(result.getByTestId('wardrobe-photo-select-button'));
  await waitFor(() => expect(result.getByTestId('wardrobe-photo-error')).toBeOnTheScreen());
  expect(result.getByTestId('wardrobe-name-input').props.value).toBe('My shell');
  expect(result.getByRole('button', { name: messages.en.wardrobe.selectPhotoAction })).toBeEnabled();
});

test('photo processing exposes busy state and selected photo participates in dirty save state', async () => {
  let resolveSelection: ((photo: StagedWardrobePhoto) => void) | undefined;
  const onCreate = jest.fn(async () => undefined);
  const onDirtyChange = jest.fn();
  const result = await render(
    <TestProviders>
      <WardrobeItemFormScreen
        isBusy={false}
        mode="create"
        onCreate={onCreate}
        onDirtyChange={onDirtyChange}
        onSelectPhoto={() =>
          new Promise((resolve) => {
            resolveSelection = resolve;
          })
        }
      />
    </TestProviders>,
  );
  await chooseType(result, 'outerwear', 'rain_jacket');

  await fireEvent.press(result.getByTestId('wardrobe-photo-select-button'));
  expect(result.getByTestId('wardrobe-photo-select-button').props.accessibilityState).toEqual(
    expect.objectContaining({ busy: true, disabled: true }),
  );
  expect(result.getByTestId('wardrobe-save-button').props.accessibilityState.disabled).toBe(true);
  await act(async () => resolveSelection?.(stagedPhoto));
  await waitFor(() => expect(result.getByTestId('wardrobe-photo-preview')).toBeOnTheScreen());
  expect(result.getByTestId('wardrobe-photo-preview').props.accessibilityLabel).toBe(
    messages.en.wardrobe.photoAccessibilityLabel('Rain jacket'),
  );
  await fireEvent.press(result.getByTestId('wardrobe-save-button'));
  expect(onCreate).toHaveBeenCalledWith(
    expect.objectContaining({ garmentTypeId: 'rain_jacket' }),
    { kind: 'replace', stagedPhoto },
  );
  expect(onDirtyChange).toHaveBeenLastCalledWith(true);
});

test('changing and removing an edit photo cleans staging and marks removal for normal save', async () => {
  const onDiscard = jest.fn(async () => undefined);
  const onUpdate = jest.fn(async () => undefined);
  const itemWithPhoto = {
    ...item,
    photoRelativePath:
      'kuyara/wardrobe/photos/318f0f4d-1d45-4ae7-a8f1-796e8297d3b4.jpg',
  };
  const result = await render(
    <TestProviders>
      <WardrobeItemFormScreen
        isBusy={false}
        item={itemWithPhoto}
        mode="edit"
        onCreate={async () => undefined}
        onDiscardStagedPhoto={onDiscard}
        onDirtyChange={() => undefined}
        onSelectPhoto={async () => stagedPhoto}
        onUpdate={onUpdate}
        photoPreviewUri="file:///private/documents/existing.jpg"
      />
    </TestProviders>,
  );

  expect(result.getByRole('button', { name: messages.en.wardrobe.changePhotoAction })).toBeOnTheScreen();
  await fireEvent.press(result.getByTestId('wardrobe-photo-select-button'));
  await waitFor(() =>
    expect(result.getByTestId('wardrobe-photo-preview').props.source.uri).toBe(
      stagedPhoto.previewUri,
    ),
  );
  await fireEvent.press(result.getByTestId('wardrobe-photo-remove-button'));
  expect(onDiscard).toHaveBeenCalledWith(stagedPhoto);
  expect(result.queryByTestId('wardrobe-photo-preview')).not.toBeOnTheScreen();
  await fireEvent.press(result.getByTestId('wardrobe-save-button'));
  expect(onUpdate).toHaveBeenCalledWith(expect.any(Object), { kind: 'remove' });
});

test('edit keeps replace and remove actions available when a stored photo file is missing', async () => {
  const itemWithMissingPhoto = {
    ...item,
    photoRelativePath:
      'kuyara/wardrobe/photos/318f0f4d-1d45-4ae7-a8f1-796e8297d3b4.jpg',
  };
  const result = await render(
    <TestProviders>
      <WardrobeItemFormScreen
        isBusy={false}
        item={itemWithMissingPhoto}
        mode="edit"
        onCreate={async () => undefined}
        onDirtyChange={() => undefined}
        onUpdate={async () => undefined}
        photoPreviewUri={null}
      />
    </TestProviders>,
  );

  expect(result.queryByTestId('wardrobe-photo-preview')).not.toBeOnTheScreen();
  expect(result.getByRole('button', { name: messages.en.wardrobe.changePhotoAction })).toBeOnTheScreen();
  expect(result.getByRole('button', { name: messages.en.wardrobe.removePhotoAction })).toBeOnTheScreen();
});

test('leaving a form discards its staged photo', async () => {
  const onDiscard = jest.fn(async () => undefined);
  const result = await render(
    <TestProviders>
      <WardrobeItemFormScreen
        isBusy={false}
        mode="create"
        onCreate={async () => undefined}
        onDiscardStagedPhoto={onDiscard}
        onDirtyChange={() => undefined}
        onSelectPhoto={async () => stagedPhoto}
      />
    </TestProviders>,
  );

  await fireEvent.press(result.getByTestId('wardrobe-photo-select-button'));
  await waitFor(() => expect(result.getByTestId('wardrobe-photo-preview')).toBeOnTheScreen());
  await result.unmount();
  await waitFor(() => expect(onDiscard).toHaveBeenCalledWith(stagedPhoto));
});

test('edit prefills values and cancels or confirms type-reset behavior', async () => {
  const pendingConfirm: { current?: () => void } = {};
  const confirmation = jest.fn((_request, onConfirm) => {
    pendingConfirm.current = onConfirm;
  });
  const result = await render(
    <TestProviders>
      <WardrobeItemFormScreen
        confirmation={confirmation}
        isBusy={false}
        item={item}
        mode="edit"
        onCreate={async () => undefined}
        onDelete={async () => undefined}
        onDirtyChange={() => undefined}
        onUpdate={async () => undefined}
      />
    </TestProviders>,
  );

  expect(result.getByTestId('wardrobe-name-input').props.value).toBe(item.name);
  expect(result.getByTestId('wardrobe-type-picker-row')).toHaveAccessibilityValue({
    text: 'Rain jacket',
  });
  await chooseType(result, 'accessory', 'umbrella');
  expect(confirmation).toHaveBeenCalledWith(
    expect.objectContaining({
      title: messages.en.wardrobe.typeChangeTitle,
      colorScheme: 'light',
    }),
    expect.any(Function),
  );
  expect(result.getByTestId('wardrobe-type-picker-row')).toHaveAccessibilityValue({
    text: 'Rain jacket',
  });
  await act(async () => {
    pendingConfirm.current?.();
  });
  expect(result.getByTestId('wardrobe-type-picker-row')).toHaveAccessibilityValue({
    text: 'Umbrella',
  });
});

// The form cannot produce an override any more, so the type-change confirmation is owed
// only to an item that already carries one; an item with none changes type straight away.
test('changing the type of an item with no stored override skips the confirmation', async () => {
  const confirmation = jest.fn();
  const withoutOverrides: WardrobeItem = {
    ...item,
    thermalLevelOverride: null,
    waterProtectionOverride: null,
    windProtectionOverride: null,
    breathabilityOverride: null,
    armCoverageOverride: null,
    legCoverageOverride: null,
    tractionSuitabilityOverride: null,
  };
  const result = await render(
    <TestProviders>
      <WardrobeItemFormScreen
        confirmation={confirmation}
        isBusy={false}
        item={withoutOverrides}
        mode="edit"
        onCreate={async () => undefined}
        onDirtyChange={() => undefined}
        onUpdate={async () => undefined}
      />
    </TestProviders>,
  );

  await chooseType(result, 'accessory', 'umbrella');
  expect(confirmation).not.toHaveBeenCalled();
  expect(result.getByTestId('wardrobe-type-picker-row')).toHaveAccessibilityValue({
    text: 'Umbrella',
  });
});

test('edit update failure preserves values and remains retryable', async () => {
  const onUpdate = jest
    .fn<Promise<void>, [Record<string, unknown>]>()
    .mockRejectedValueOnce(new Error('failed'))
    .mockResolvedValueOnce(undefined);
  const result = await render(
    <TestProviders dark>
      <WardrobeItemFormScreen
        isBusy={false}
        item={item}
        mode="edit"
        onCreate={async () => undefined}
        onDelete={async () => undefined}
        onDirtyChange={() => undefined}
        onUpdate={onUpdate}
      />
    </TestProviders>,
  );
  await fireEvent.changeText(result.getByTestId('wardrobe-name-input'), 'Updated shell');
  await fireEvent.press(result.getByTestId('wardrobe-save-button'));
  await waitFor(() => expect(result.getByTestId('wardrobe-save-error')).toBeOnTheScreen());
  expect(result.getByTestId('wardrobe-name-input').props.value).toBe('Updated shell');
  await fireEvent.press(result.getByTestId('wardrobe-save-button'));
  await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(2));
});

test('delete requires confirmation, reports failure, and allows retry', async () => {
  const confirmDelete: { current?: () => void } = {};
  const confirmation = jest.fn((_request, onConfirm) => {
    confirmDelete.current = onConfirm;
  });
  const onDelete = jest
    .fn<Promise<void>, []>()
    .mockRejectedValueOnce(new Error('failed'))
    .mockResolvedValueOnce(undefined);
  const result = await render(
    <TestProviders>
      <WardrobeItemFormScreen
        confirmation={confirmation}
        isBusy={false}
        item={item}
        mode="edit"
        onCreate={async () => undefined}
        onDelete={onDelete}
        onDirtyChange={() => undefined}
        onUpdate={async () => undefined}
      />
    </TestProviders>,
  );

  await fireEvent.press(result.getByTestId('wardrobe-delete-button'));
  expect(onDelete).not.toHaveBeenCalled();
  expect(confirmation).toHaveBeenCalledWith(
    expect.objectContaining({
      confirmLabel: messages.en.wardrobe.confirmDeleteAction,
      destructive: true,
      colorScheme: 'light',
    }),
    expect.any(Function),
  );
  await act(async () => {
    confirmDelete.current?.();
  });
  await waitFor(() => expect(result.getByTestId('wardrobe-delete-error')).toBeOnTheScreen());
  await fireEvent.press(result.getByTestId('wardrobe-delete-button'));
  await act(async () => {
    confirmDelete.current?.();
  });
  await waitFor(() => expect(onDelete).toHaveBeenCalledTimes(2));
});

// Milestone 10 phase 3: `closet_item_created`/`_updated`/`_deleted`,
// and `screen_viewed('closet_item_form')`.
const plainItem: WardrobeItem = {
  id: '318f0f4d-1d45-4ae7-a8f1-796e8297d3b4',
  localProfileId: '018f0f4d-1d45-4ae7-a8f1-796e8297d3b4',
  name: null,
  category: 'outerwear',
  entryState: 'owned',
  garmentTypeId: 'rain_jacket',
  color: null,
  colorFamily: null,
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

const autoConfirmDelete: WardrobeConfirmation = (_options, onConfirm) => onConfirm();

function wardrobeApplication(
  overrides: Partial<WardrobeApplicationValue> = {},
): WardrobeApplicationValue {
  return {
    state: {
      status: 'ready',
      items: [plainItem],
      isRefreshing: false,
      isMutating: false,
      refreshFailure: null,
    },
    refresh: async () => undefined,
    getItem: async () => plainItem,
    preparePhoto: async () => null,
    discardStagedPhoto: async () => undefined,
    resolvePhotoUri: () => null,
    createItem: async () => plainItem,
    updateItem: async () => plainItem,
    softDeleteItem: async () => plainItem,
    ...overrides,
  };
}

test('a successful create captures closet_item_created with profile segmentation and marks the closet feature used', async () => {
  const analytics = new RecordingProductAnalytics();
  const createdItem: WardrobeItem = { ...plainItem, entryState: 'owned' };
  const application = wardrobeApplication({
    createItem: jest.fn(async () => createdItem),
  });

  const result = await render(
    <TestProviders>
      <AnalyticsProviders analytics={analytics}>
        <WardrobeApplicationContext.Provider value={application}>
          <WardrobeNewItemRoute />
        </WardrobeApplicationContext.Provider>
      </AnalyticsProviders>
    </TestProviders>,
  );
  await chooseType(result, 'outerwear', 'rain_jacket');

  await fireEvent.press(result.getByTestId('wardrobe-save-button'));
  await waitFor(() => expect(application.createItem).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(analytics.names()).toContain('feature_used_first_time'));

  expect(analytics.captures).toEqual(
    expect.arrayContaining([
      {
        name: 'closet_item_created',
        properties: {
          schema_version: 2,
          state: 'owned',
          garment_type_id: 'rain_jacket',
          has_photo: false,
          entry_point: 'closet_list',
          dress_style: dressStyleProperty(profile.dressStyle),
          age_bucket: ageBucketProperty(profile.birthDate),
        },
        options: undefined,
      },
      {
        name: 'feature_used_first_time',
        properties: { schema_version: 2, feature_name: 'closet' },
        options: undefined,
      },
    ]),
  );
});

test('a create with no consent captures nothing', async () => {
  const analytics = new RecordingProductAnalytics('undecided');
  const application = wardrobeApplication({
    createItem: jest.fn(async () => plainItem),
  });

  const result = await render(
    <TestProviders>
      <AnalyticsProviders analytics={analytics}>
        <WardrobeApplicationContext.Provider value={application}>
          <WardrobeNewItemRoute />
        </WardrobeApplicationContext.Provider>
      </AnalyticsProviders>
    </TestProviders>,
  );
  await chooseType(result, 'outerwear', 'rain_jacket');

  await fireEvent.press(result.getByTestId('wardrobe-save-button'));
  await waitFor(() => expect(application.createItem).toHaveBeenCalledTimes(1));
  expect(analytics.captures).toEqual([]);
});

test('a successful update captures closet_item_updated with only the fields that changed', async () => {
  mockSearchParams = {};
  const analytics = new RecordingProductAnalytics();
  const updated: WardrobeItem = { ...plainItem, entryState: 'wanted' };
  const application = wardrobeApplication({
    updateItem: jest.fn(async () => updated),
  });

  const result = await render(
    <TestProviders>
      <AnalyticsProviders analytics={analytics}>
        <WardrobeApplicationContext.Provider value={application}>
          <WardrobeEditItemRoute itemId={plainItem.id} />
        </WardrobeApplicationContext.Provider>
      </AnalyticsProviders>
    </TestProviders>,
  );

  await waitFor(() => expect(result.getByTestId('wardrobe-edit-form')).toBeOnTheScreen());
  await fireEvent.press(result.getByTestId('wardrobe-entry-state-wanted'));
  await fireEvent.press(result.getByTestId('wardrobe-save-button'));
  await waitFor(() => expect(application.updateItem).toHaveBeenCalledTimes(1));

  expect(analytics.captures).toEqual(
    expect.arrayContaining([
      {
        name: 'closet_item_updated',
        properties: {
          schema_version: 2,
          fields_changed: ['state'],
          garment_type_id: plainItem.garmentTypeId,
          entry_point: 'closet_list',
        },
        options: undefined,
      },
    ]),
  );
});

test('a successful delete captures closet_item_deleted with the pre-delete state and photo presence', async () => {
  mockSearchParams = {};
  const analytics = new RecordingProductAnalytics();
  const deletedItem: WardrobeItem = { ...plainItem, photoRelativePath: 'wardrobe/photo.jpg' };
  const application = wardrobeApplication({
    getItem: async () => deletedItem,
    softDeleteItem: jest.fn(async () => ({
      ...deletedItem,
      photoRelativePath: null,
      deletedAt: '2026-09-10T00:00:00.000Z',
    })),
  });

  const result = await render(
    <TestProviders>
      <AnalyticsProviders analytics={analytics}>
        <WardrobeApplicationContext.Provider value={application}>
          <WardrobeEditItemRoute confirmation={autoConfirmDelete} itemId={deletedItem.id} />
        </WardrobeApplicationContext.Provider>
      </AnalyticsProviders>
    </TestProviders>,
  );

  await waitFor(() => expect(result.getByTestId('wardrobe-edit-form')).toBeOnTheScreen());
  await fireEvent.press(result.getByTestId('wardrobe-delete-button'));
  await waitFor(() => expect(application.softDeleteItem).toHaveBeenCalledTimes(1));

  expect(analytics.captures).toEqual(
    expect.arrayContaining([
      {
        name: 'closet_item_deleted',
        properties: { schema_version: 2, state: 'owned', had_photo: true },
        options: undefined,
      },
    ]),
  );
});

test('one screen_viewed for closet_item_form fires on focus for the edit route', async () => {
  mockSearchParams = {};
  const analytics = new RecordingProductAnalytics();
  await render(
    <TestProviders>
      <AnalyticsProviders analytics={analytics}>
        <WardrobeApplicationContext.Provider value={wardrobeApplication()}>
          <WardrobeEditItemRoute itemId={plainItem.id} />
        </WardrobeApplicationContext.Provider>
      </AnalyticsProviders>
    </TestProviders>,
  );

  expect(analytics.captures).toEqual([]);
  await act(() => {
    mockFocusEffects[0]();
  });
  expect(analytics.captures).toEqual([
    {
      name: 'screen_viewed',
      properties: { schema_version: 2, screen_name: 'closet_item_form' },
      options: undefined,
    },
  ]);
});
