import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { Dimensions, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import {
  garmentCatalog,
  getGarmentType,
} from '@/features/catalog/domain/garment-catalog';
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
import { GarmentTypePickerScreen } from '@/features/wardrobe/presentation/garment-type-picker-screen';
import {
  WardrobeEditItemRoute,
  WardrobeGarmentTypePickerRoute,
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
  analyticsConsent: 'undecided',
  createdAt: '2026-07-01T08:00:00.000Z',
  updatedAt: '2026-07-01T08:00:00.000Z',
};

function readyProfileApplication(
  overrides: Partial<LocalProfile> = {},
): ProfileApplicationValue {
  return {
    state: { status: 'ready', profile: { ...profile, ...overrides }, isSaving: false },
    completeOnboarding: async () => undefined,
    updateGender: async () => undefined,
    updateDressStyle: async () => undefined,
    updateBirthDate: async () => undefined,
    updateLanguagePreference: async () => undefined,
    updateThemePreference: async () => undefined,
    updateNotificationsOptIn: async () => undefined,
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

function mockFontScale(fontScale: number) {
  Dimensions.set({ window: { ...originalWindowDimensions, fontScale } });
}

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

function requireGarmentType(typeId: string) {
  const garmentType = getGarmentType(typeId);
  if (!garmentType) {
    throw new Error(`Missing test garment type: ${typeId}`);
  }
  return garmentType;
}

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
  confirmation,
  garmentTypeSelection,
  onBackRequested = () => undefined,
  onCreate = async () => undefined,
  onOpenGarmentTypePicker = () => undefined,
}: Readonly<{
  confirmation?: WardrobeConfirmation;
  garmentTypeSelection?: ReturnType<typeof getGarmentType>;
  onBackRequested?: (dirty: boolean) => void;
  onCreate?: (input: Record<string, unknown>) => Promise<void>;
  onOpenGarmentTypePicker?: (selectedTypeId: string | null) => void;
}>) {
  return (
    <TestProviders>
      <WardrobeItemFormScreen
        confirmation={confirmation}
        garmentTypeSelection={garmentTypeSelection}
        isBusy={false}
        mode="create"
        onBackRequested={onBackRequested}
        onCreate={onCreate}
        onDirtyChange={() => undefined}
        onOpenGarmentTypePicker={onOpenGarmentTypePicker}
      />
    </TestProviders>
  );
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
        onBackRequested={() => undefined}
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
  const onOpenGarmentTypePicker = jest.fn();
  const result = await render(
    <CreateForm
      onCreate={onCreate}
      onOpenGarmentTypePicker={onOpenGarmentTypePicker}
    />,
  );

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
  await fireEvent.press(result.getByTestId('wardrobe-type-picker-row'));
  expect(onOpenGarmentTypePicker).toHaveBeenCalledWith(null);
  expect(result.queryByTestId('wardrobe-delete-button')).not.toBeOnTheScreen();
  expect(result.getByTestId('wardrobe-entry-state-owned').props.accessibilityState.selected).toBe(true);
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
        onBackRequested={() => undefined}
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
        onBackRequested={() => undefined}
        onCreate={async () => undefined}
        onDirtyChange={() => undefined}
        onUpdate={async () => undefined}
      />
    </TestProviders>,
  );
  expect(resolvable.queryByTestId('wardrobe-type-error')).not.toBeOnTheScreen();
});

test('garment type picker groups preference-filtered options with accessible radio state', async () => {
  const onSelect = jest.fn();
  const result = await render(
    <TestProviders>
      <GarmentTypePickerScreen
        clothingPreference="mens"
        garmentTypes={garmentCatalog.garmentTypes}
        onBack={() => undefined}
        onSelect={onSelect}
        selectedTypeId="rain_jacket"
      />
    </TestProviders>,
  );

  expect(result.getAllByRole('header')).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ props: expect.objectContaining({ children: 'Top' }) }),
      expect.objectContaining({ props: expect.objectContaining({ children: 'Bottom' }) }),
      expect.objectContaining({ props: expect.objectContaining({ children: 'One-piece' }) }),
      expect.objectContaining({ props: expect.objectContaining({ children: 'Outerwear' }) }),
      expect.objectContaining({ props: expect.objectContaining({ children: 'Footwear' }) }),
      expect.objectContaining({ props: expect.objectContaining({ children: 'Accessory' }) }),
    ]),
  );
  expect(result.queryByRole('radio', { name: 'Blouse' })).not.toBeOnTheScreen();
  expect(result.getByRole('radio', { name: 'Rain jacket' }).props.accessibilityState).toEqual(
    expect.objectContaining({ selected: true }),
  );
  expect(
    StyleSheet.flatten(
      result.getByTestId('wardrobe-garment-type-picker').props.contentContainerStyle,
    ).paddingBottom,
  ).toBe(spacing.md);
  await fireEvent.press(result.getByRole('radio', { name: 'T-shirt' }));
  expect(onSelect).toHaveBeenCalledWith('t_shirt');
});

test.each([
  [1, 'row'],
  [3.12, 'column'],
] as const)(
  'the garment type picker header at fontScale %s uses a %s layout and options reserve the mark',
  async (fontScale, flexDirection) => {
    mockFontScale(fontScale);
    const result = await render(
      <TestProviders language="tr">
        <GarmentTypePickerScreen
          clothingPreference="mens"
          garmentTypes={garmentCatalog.garmentTypes}
          onBack={() => undefined}
          onSelect={() => undefined}
          selectedTypeId="rain_jacket"
        />
      </TestProviders>,
    );

    expect(
      StyleSheet.flatten(
        result.getByTestId('wardrobe-garment-type-picker-header-content').props.style,
      ),
    ).toMatchObject({ flexDirection });
    expect(result.getByRole('header', { name: messages.tr.wardrobe.typeTitle }))
      .toBeOnTheScreen();
    expect(
      StyleSheet.flatten(result.getByTestId('wardrobe-type-rain_jacket-label').props.style),
    ).toMatchObject({ flex: 1, flexShrink: 1 });
    expect(
      StyleSheet.flatten(result.getByTestId(
        'wardrobe-type-rain_jacket-mark',
        { includeHiddenElements: true },
      ).props.style),
    ).toMatchObject({ flexShrink: 0, width: 24 });

    fireEvent(result.getByTestId('wardrobe-garment-type-picker-header'), 'layout', {
      nativeEvent: { layout: { height: 120 } },
    });
    await waitFor(() => {
      expect(
        StyleSheet.flatten(
          result.getByTestId('wardrobe-garment-type-picker').props.contentContainerStyle,
        ).paddingTop,
      ).toBe(97);
    });
  },
);

test('create and edit forms persist the selected wardrobe state', async () => {
  const onCreate = jest.fn(async () => undefined);
  const createResult = await render(
    <CreateForm
      garmentTypeSelection={requireGarmentType('t_shirt')}
      onCreate={onCreate}
    />,
  );
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
        onBackRequested={() => undefined}
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

test('type selection exposes only catalog-supported attributes and selected state', async () => {
  const result = await render(
    <CreateForm garmentTypeSelection={requireGarmentType('umbrella')} />,
  );

  expect(result.getByTestId('wardrobe-type-picker-row')).toHaveAccessibilityValue({
    text: 'Umbrella',
  });
  expect(result.queryByTestId('wardrobe-attribute-waterProtectionOverride')).not.toBeOnTheScreen();
  await fireEvent.press(result.getByTestId('wardrobe-details-toggle'));
  expect(result.getByTestId('wardrobe-attribute-waterProtectionOverride')).toBeOnTheScreen();
  expect(result.queryByTestId('wardrobe-attribute-thermalLevelOverride')).not.toBeOnTheScreen();
});

test('valid create maps values, blocks rapid duplicate presses, and reports dirty back intent', async () => {
  let resolveSave: (() => void) | undefined;
  const onCreate = jest.fn(
    () => new Promise<void>((resolve) => {
      resolveSave = resolve;
    }),
  );
  const onBack = jest.fn();
  const result = await render(
    <CreateForm
      garmentTypeSelection={requireGarmentType('umbrella')}
      onBackRequested={onBack}
      onCreate={onCreate}
    />,
  );

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
  await fireEvent.press(result.getByRole('button', { name: messages.en.wardrobe.backAction }));
  expect(onBack).toHaveBeenCalledWith(true);
});

test('create failure preserves entries and allows retry', async () => {
  const onCreate = jest
    .fn<Promise<void>, [Record<string, unknown>]>()
    .mockRejectedValueOnce(new Error('write failed'))
    .mockResolvedValueOnce(undefined);
  const result = await render(
    <CreateForm
      garmentTypeSelection={requireGarmentType('t_shirt')}
      onCreate={onCreate}
    />,
  );
  await fireEvent.changeText(result.getByTestId('wardrobe-name-input'), 'My tee');
  await fireEvent.press(result.getByTestId('wardrobe-save-button'));

  await waitFor(() => expect(result.getByTestId('wardrobe-save-error')).toBeOnTheScreen());
  expect(result.getByTestId('wardrobe-name-input').props.value).toBe('My tee');
  await fireEvent.press(result.getByTestId('wardrobe-save-button'));
  await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(2));
});

test('unchanged and changed forms report distinct back intents', async () => {
  const onBack = jest.fn();
  const result = await render(<CreateForm onBackRequested={onBack} />);
  await fireEvent.press(result.getByRole('button', { name: messages.en.wardrobe.backAction }));
  expect(onBack).toHaveBeenLastCalledWith(false);
  await fireEvent.changeText(result.getByTestId('wardrobe-name-input'), 'Changed');
  await fireEvent.press(result.getByRole('button', { name: messages.en.wardrobe.backAction }));
  expect(onBack).toHaveBeenLastCalledWith(true);
});

test('picker cancellation leaves the form unchanged and photo errors preserve other values', async () => {
  const onBack = jest.fn();
  const onSelectPhoto = jest
    .fn<Promise<StagedWardrobePhoto | null>, []>()
    .mockResolvedValueOnce(null)
    .mockRejectedValueOnce(new Error('picker unavailable'));
  const result = await render(
    <TestProviders>
      <WardrobeItemFormScreen
        isBusy={false}
        mode="create"
        onBackRequested={onBack}
        onCreate={async () => undefined}
        onDirtyChange={() => undefined}
        onSelectPhoto={onSelectPhoto}
      />
    </TestProviders>,
  );

  await fireEvent.press(result.getByTestId('wardrobe-photo-select-button'));
  await waitFor(() => expect(onSelectPhoto).toHaveBeenCalledTimes(1));
  await fireEvent.press(result.getByRole('button', { name: messages.en.wardrobe.backAction }));
  expect(onBack).toHaveBeenLastCalledWith(false);

  await fireEvent.changeText(result.getByTestId('wardrobe-name-input'), 'My shell');
  await fireEvent.press(result.getByTestId('wardrobe-photo-select-button'));
  await waitFor(() => expect(result.getByTestId('wardrobe-photo-error')).toBeOnTheScreen());
  expect(result.getByTestId('wardrobe-name-input').props.value).toBe('My shell');
  expect(result.getByRole('button', { name: messages.en.wardrobe.selectPhotoAction })).toBeEnabled();
});

test('photo processing exposes busy state and selected photo participates in dirty save state', async () => {
  let resolveSelection: ((photo: StagedWardrobePhoto) => void) | undefined;
  const onCreate = jest.fn(async () => undefined);
  const onBack = jest.fn();
  const result = await render(
    <TestProviders>
      <WardrobeItemFormScreen
        garmentTypeSelection={requireGarmentType('rain_jacket')}
        isBusy={false}
        mode="create"
        onBackRequested={onBack}
        onCreate={onCreate}
        onDirtyChange={() => undefined}
        onSelectPhoto={() =>
          new Promise((resolve) => {
            resolveSelection = resolve;
          })
        }
      />
    </TestProviders>,
  );

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
  await fireEvent.press(result.getByRole('button', { name: messages.en.wardrobe.backAction }));
  expect(onBack).toHaveBeenLastCalledWith(true);
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
        onBackRequested={() => undefined}
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
        onBackRequested={() => undefined}
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
        onBackRequested={() => undefined}
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
        onBackRequested={() => undefined}
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
  await fireEvent.press(result.getByTestId('wardrobe-details-toggle'));
  expect(result.getByTestId('wardrobe-attribute-thermalLevelOverride')).toBeOnTheScreen();
  await result.rerender(
    <TestProviders>
      <WardrobeItemFormScreen
        confirmation={confirmation}
        garmentTypeSelection={requireGarmentType('umbrella')}
        isBusy={false}
        item={item}
        mode="edit"
        onBackRequested={() => undefined}
        onCreate={async () => undefined}
        onDelete={async () => undefined}
        onDirtyChange={() => undefined}
        onUpdate={async () => undefined}
      />
    </TestProviders>,
  );
  expect(confirmation).toHaveBeenCalledWith(
    expect.objectContaining({ title: messages.en.wardrobe.typeChangeTitle }),
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
  expect(result.queryByTestId('wardrobe-attribute-thermalLevelOverride')).not.toBeOnTheScreen();
  expect(result.getByTestId('wardrobe-attribute-waterProtectionOverride')).toBeOnTheScreen();
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
        onBackRequested={() => undefined}
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
        onBackRequested={() => undefined}
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
// `screen_viewed('closet_item_form')` and `screen_viewed('closet_garment_type_picker')`.
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
  mockSearchParams = { garmentTypeId: 'rain_jacket' };
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

  await fireEvent.press(result.getByTestId('wardrobe-save-button'));
  await waitFor(() => expect(application.createItem).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(analytics.names()).toContain('feature_used_first_time'));

  expect(analytics.captures).toEqual(
    expect.arrayContaining([
      {
        name: 'closet_item_created',
        properties: {
          schema_version: 1,
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
        properties: { schema_version: 1, feature_name: 'closet' },
        options: undefined,
      },
    ]),
  );
});

test('a create with no consent captures nothing', async () => {
  mockSearchParams = { garmentTypeId: 'rain_jacket' };
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
          schema_version: 1,
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
        properties: { schema_version: 1, state: 'owned', had_photo: true },
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
      properties: { schema_version: 1, screen_name: 'closet_item_form' },
      options: undefined,
    },
  ]);
});

test('one screen_viewed for closet_garment_type_picker fires on focus', async () => {
  mockSearchParams = {};
  const analytics = new RecordingProductAnalytics();
  await render(
    <TestProviders>
      <AnalyticsProviders analytics={analytics}>
        <WardrobeGarmentTypePickerRoute />
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
      properties: { schema_version: 1, screen_name: 'closet_garment_type_picker' },
      options: undefined,
    },
  ]);
});
