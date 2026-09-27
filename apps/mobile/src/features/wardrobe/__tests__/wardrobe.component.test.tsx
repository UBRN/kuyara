import { act, fireEvent, render, waitFor, within } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { Dimensions, Linking, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import WardrobeRoute from '@/app/(tabs)/(profile)/wardrobe/index';
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
import { nearestFamilyForHex } from '@/features/wardrobe/domain/closet-color-options';
import type { WardrobeItem } from '@/features/wardrobe/domain/wardrobe-item';
import {
  WardrobeCameraAccessError,
  type WardrobePhotoSource,
} from '@/features/wardrobe/domain/wardrobe-photo';
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

// The system colour well is the `components/ui` wrapper's business; a press here stands in
// for the user picking `mockPickedHex` in the system picker (O8).
let mockPickedHex = '#3C8D2F';
jest.mock('@/components/ui/native-color-well', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { Pressable } = jest.requireActual('react-native') as typeof import('react-native');
  return {
    NativeColorWell: (props: {
      accessibilityLabel: string; disabled?: boolean; selected: boolean;
      onChange: (hex: string) => void; testID: string;
    }) => React.createElement(Pressable, {
      accessibilityLabel: props.accessibilityLabel,
      accessibilityRole: 'radio',
      accessibilityState: { disabled: props.disabled, selected: props.selected },
      onPress: () => props.onChange(mockPickedHex),
      testID: props.testID,
    }),
  };
});

let mockFocusEffects: (() => void | (() => void))[] = [];
let mockSearchParams: Record<string, string | string[] | undefined> = {};
let mockReplace = jest.fn();
let mockDismissTo = jest.fn();
let mockBack = jest.fn();

// O10: the form's Cancel/Save pair is the native header's. The mock renders both toolbar
// buttons (and Android's header slots) into the tree, so a test presses them as a user
// presses the bar items.
jest.mock('expo-router', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { Pressable, View } = jest.requireActual('react-native') as typeof import('react-native');
  const Toolbar = ({ children }: { children: React.ReactNode }) =>
    React.createElement(View, null, children);
  Toolbar.Button = function ToolbarButton({
    accessibilityLabel,
    disabled,
    icon,
    onPress,
    variant,
  }: {
    accessibilityLabel: string;
    disabled?: boolean;
    icon: string;
    onPress: () => void;
    variant?: string;
  }) {
    return React.createElement(Pressable, {
      accessibilityLabel,
      accessibilityRole: 'button',
      accessibilityState: { disabled: Boolean(disabled) },
      accessibilityValue: variant ? { text: variant } : undefined,
      disabled,
      onPress,
      testID: `wardrobe-toolbar-${icon}`,
    });
  };
  const Screen = ({ options }: { options?: { headerLeft?: () => React.ReactNode; headerRight?: () => React.ReactNode } }) =>
    React.createElement(View, null, options?.headerLeft?.(), options?.headerRight?.());
  return {
    Stack: { Screen, Toolbar },
    useFocusEffect: (effect: () => void | (() => void)) => {
    mockFocusEffects.push(effect);
  },
  useNavigation: () => ({
    addListener: () => () => undefined,
    dispatch: () => undefined,
  }),
  useIsFocused: () => true,
  useLocalSearchParams: () => mockSearchParams,
  useRouter: () => ({
    back: (...args: unknown[]) => mockBack(...args),
    dismissTo: (...args: unknown[]) => mockDismissTo(...args),
    push: () => undefined,
    replace: (...args: unknown[]) => mockReplace(...args),
    setParams: () => undefined,
  }),
  };
});

const profile: LocalProfile = {
  id: 'profile-id',
  gender: 'woman',
  dressStyle: 'casual',
  birthDate: '1996-06-01',
  displayName: null,
  namePromptVersion: 0,
  clothingPreference: 'womens',
  languagePreference: 'en',
  themePreference: 'light',
  onboardingCompleted: true,
  notificationsOptIn: true,
  weatherAlertOfferShown: false,
  morningBriefingOptIn: false,
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
    updateDisplayName: async () => undefined,
    updateLanguagePreference: async () => undefined,
    updateThemePreference: async () => undefined,
    updateNotificationsOptIn: async () => undefined,
    updateMorningBriefingOptIn: async () => undefined,
    markWeatherAlertOfferShown: async () => undefined,
    updateAnalyticsConsent: async () => undefined,
  };
}

function AnalyticsProviders({
  analytics,
  children,
}: PropsWithChildren<{ analytics?: RecordingProductAnalytics }>) {
  return (
    <ProfileApplicationContext.Provider value={readyProfileApplication({
      analyticsConsent: analytics?.isApplied() === false ? 'undecided' : 'granted',
    })}>
      <ProductAnalyticsProvider
        analytics={analytics ?? new RecordingProductAnalytics()}
        firstUseStore={new InMemoryFirstUseStore()}>
        {children}
      </ProductAnalyticsProvider>
    </ProfileApplicationContext.Provider>
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
  expect(loading.queryByTestId('wardrobe-toolbar-checkmark')).not.toBeOnTheScreen();
  await loading.unmount();

  const error = await renderRoute({ status: 'error' });
  expect(error.getByTestId('wardrobe-item-error')).toBeOnTheScreen();
  expect(error.queryByTestId('wardrobe-toolbar-checkmark')).not.toBeOnTheScreen();
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

// O10: the type is chosen inline. A chosen type collapses to a row with Change; the
// category tiles lead to the chip rail and its grid, where the tile is the selection.
// Pressing the chip of the category already shown is a no-op.
async function chooseType(
  result: Awaited<ReturnType<typeof render>>,
  category: string,
  typeId: string,
) {
  const change = result.queryByTestId('wardrobe-type-change-button');
  if (change) await fireEvent.press(change);
  const tile = result.queryByTestId(`wardrobe-type-category-tile-${category}`);
  await fireEvent.press(tile ?? result.getByTestId(`wardrobe-type-category-${category}`));
  await fireEvent.press(result.getByTestId(`wardrobe-type-${typeId}`));
}

const SAVE = 'wardrobe-toolbar-checkmark';
const CANCEL = 'wardrobe-toolbar-xmark';

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

test('a new piece opens on the preview, the two ownership cards and six category tiles (O10)', async () => {
  const result = await render(<CreateForm clothingPreference="womens" />);

  // The stage holds the dashed placeholder in a viewfinder, with the camera and library
  // actions on it, and the hint under it.
  expect(result.getByTestId('wardrobe-preview-placeholder', { includeHiddenElements: true })).toBeOnTheScreen();
  expect(result.getByText(messages.en.wardrobe.photoHint)).toBeOnTheScreen();
  expect(result.getByRole('button', { name: messages.en.wardrobe.takePhotoAction })).toBeOnTheScreen();
  expect(result.getByRole('button', { name: messages.en.wardrobe.selectPhotoAction })).toBeOnTheScreen();
  // Owned is preselected; the cards are the only radios until a category opens.
  expect(result.getAllByRole('radio')).toHaveLength(2);
  expect(result.getByTestId('wardrobe-entry-state-owned').props.accessibilityState.selected).toBe(true);
  expect(result.getByLabelText(messages.en.wardrobe.entryStateTitle)).toHaveProp('accessibilityRole', 'radiogroup');
  for (const category of ['top', 'bottom', 'one_piece', 'outerwear', 'footwear', 'accessory']) {
    expect(result.getByTestId(`wardrobe-type-category-tile-${category}`)).toBeOnTheScreen();
  }
  expect(result.getByTestId('wardrobe-type-required')).toHaveTextContent(messages.en.wardrobe.requiredTag);
  // Colour appears only once a type is chosen; the name stays last and optional.
  expect(result.queryByTestId('wardrobe-color-section')).not.toBeOnTheScreen();
  expect(result.getByText(messages.en.wardrobe.optionalTag)).toBeOnTheScreen();
  expect(result.queryByTestId('wardrobe-delete-button')).not.toBeOnTheScreen();

  // Two taps: a category, then a type. The picker collapses to one row with Change.
  await fireEvent.press(result.getByTestId('wardrobe-type-category-tile-bottom'));
  expect(result.getByTestId('wardrobe-type-category-bottom').props.accessibilityState).toEqual(
    expect.objectContaining({ selected: true }),
  );
  await fireEvent.press(result.getByTestId('wardrobe-type-jeans'));
  expect(result.getByTestId('wardrobe-type-row-name')).toHaveTextContent('Jeans');
  expect(result.queryByTestId('wardrobe-type-jeans')).not.toBeOnTheScreen();
  expect(result.getByTestId('wardrobe-preview-drawing', { includeHiddenElements: true })).toBeOnTheScreen();
  expect(result.getByTestId('wardrobe-color-section')).toBeOnTheScreen();
  await fireEvent.press(result.getByTestId('wardrobe-type-change-button'));
  expect(result.getByTestId('wardrobe-type-jeans').props.accessibilityState).toEqual(
    expect.objectContaining({ selected: true }),
  );
});

test('the toolbar pair names where the piece goes and Cancel leaves through the guard', async () => {
  const result = await render(<CreateForm />);
  expect(result.getByTestId(SAVE)).toHaveProp('accessibilityLabel', messages.en.wardrobe.saveOwnedAction);
  expect(result.getByTestId(SAVE)).toHaveAccessibilityValue({ text: 'prominent' });
  await fireEvent.press(result.getByTestId('wardrobe-entry-state-wanted'));
  expect(result.getByTestId(SAVE)).toHaveProp('accessibilityLabel', messages.en.wardrobe.saveWantedAction);
  expect(result.getByTestId(CANCEL)).toHaveProp('accessibilityLabel', messages.en.wardrobe.cancelAction);

  const edit = await render(
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
  expect(edit.getByTestId(SAVE)).toHaveProp('accessibilityLabel', messages.en.wardrobe.saveAction);

  // The route wires Cancel to a pop, which the `beforeRemove` guard confirms when dirty.
  mockBack = jest.fn();
  const route = await render(
    <TestProviders>
      <AnalyticsProviders>
        <WardrobeApplicationContext.Provider value={wardrobeApplication()}>
          <WardrobeNewItemRoute />
        </WardrobeApplicationContext.Provider>
      </AnalyticsProviders>
    </TestProviders>,
  );
  await fireEvent.press(route.getByTestId(CANCEL));
  expect(mockBack).toHaveBeenCalledTimes(1);
});

test('a chosen type starts on its most natural colour family, and a palette pick sticks', async () => {
  const onCreate = jest.fn(async () => undefined);
  const result = await render(<CreateForm onCreate={onCreate} />);
  await chooseType(result, 'bottom', 'jeans');

  const selectedName = () =>
    result.getByTestId('wardrobe-color-selected', { includeHiddenElements: true });
  // The type's usual family is named and drawn; it names no palette shade, so no swatch is on.
  expect(selectedName()).toHaveTextContent(messages.en.catalog['catalog.color_family.blue']);
  expect(result.getByLabelText(messages.en.wardrobe.solidColorsLabel)).toHaveProp('accessibilityRole', 'radiogroup');
  expect(result.getAllByRole('radio').filter((radio) => radio.props.accessibilityState?.selected)
    .map((radio) => radio.props.testID)).toEqual(['wardrobe-entry-state-owned']);
  // The user's own pick survives a later type change; only the untouched default follows it.
  await fireEvent.press(result.getByTestId('wardrobe-color-tomato_red'));
  await chooseType(result, 'top', 't_shirt');
  expect(selectedName()).toHaveTextContent(messages.en.wardrobe.colorOptionNames.tomato_red);
  expect(result.getByTestId('wardrobe-color-tomato_red').props.accessibilityState.selected).toBe(true);
  await fireEvent.press(result.getByTestId(SAVE));
  expect(onCreate).toHaveBeenCalledWith(
    expect.objectContaining({
      colorFamily: 'red', colorChoice: { kind: 'option', id: 'tomato_red' }, garmentTypeId: 't_shirt',
    }),
  );
  // The photo stays optional: a piece saves with no photo change at all.
  expect(onCreate.mock.calls[0]).toHaveLength(1);
});

test('saving with no clothing type shows the hint instead of creating an item', async () => {
  const onCreate = jest.fn(async () => undefined);
  const result = await render(<CreateForm onCreate={onCreate} />);

  await fireEvent.press(result.getByTestId('wardrobe-toolbar-checkmark'));
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

test('the type picker lists only preference-filtered active types and marks the selection', async () => {
  const result = await render(<CreateForm clothingPreference="mens" />);

  // Both one-piece garments are womens-only since catalog version 4, so the mens picker
  // has no One-piece tile or chip at all, and a womens-only top never reaches the Tops grid.
  expect(result.queryByTestId('wardrobe-type-category-tile-one_piece')).not.toBeOnTheScreen();
  await fireEvent.press(result.getByTestId('wardrobe-type-category-tile-top'));
  expect(result.queryByTestId('wardrobe-type-category-one_piece')).not.toBeOnTheScreen();
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
  expect(result.getByTestId('wardrobe-type-row-name')).toHaveTextContent('Rain jacket');

  // Change reopens on the selected type's own category with its tile already marked.
  await fireEvent.press(result.getByTestId('wardrobe-type-change-button'));
  expect(
    result.getByTestId('wardrobe-type-rain_jacket').props.accessibilityState,
  ).toEqual(expect.objectContaining({ selected: true }));
});

test('the Closet category a piece is added from opens the type grid on it (O9)', async () => {
  const result = await render(
    <TestProviders>
      <WardrobeItemFormScreen
        defaultCategory="footwear"
        isBusy={false}
        mode="create"
        onCreate={async () => undefined}
        onDirtyChange={() => undefined}
      />
    </TestProviders>,
  );
  expect(result.queryByTestId('wardrobe-type-category-tile-top')).not.toBeOnTheScreen();
  expect(result.getByTestId('wardrobe-type-category-footwear').props.accessibilityState).toEqual(
    expect.objectContaining({ selected: true }),
  );
  expect(result.getByTestId('wardrobe-type-sneakers')).toBeOnTheScreen();
});

test('the type picker is localized from catalog and wardrobe keys', async () => {
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

  expect(
    result.getByRole('header', { name: messages.tr.wardrobe.typeTitle }),
  ).toBeOnTheScreen();
  expect(result.getByText(messages.tr.wardrobe.requiredTag)).toBeOnTheScreen();
  expect(
    result.getByText(messages.tr.wardrobe.categoryFilterLabels.one_piece),
  ).toBeOnTheScreen();
  expect(result.getByText(messages.tr.today.ownershipOwnedAction)).toBeOnTheScreen();
  expect(result.getByText(messages.tr.today.ownershipWantedAction)).toBeOnTheScreen();
  await fireEvent.press(result.getByTestId('wardrobe-type-category-tile-top'));
  expect(result.getByTestId('wardrobe-type-t_shirt').props.accessibilityLabel).toBe(
    messages.tr.catalog['catalog.garment_type.t_shirt.name'],
  );
  expect(result.getByTestId(SAVE)).toHaveProp('accessibilityLabel', messages.tr.wardrobe.saveOwnedAction);
});

test('create and edit forms persist the selected wardrobe state', async () => {
  const onCreate = jest.fn(async () => undefined);
  const createResult = await render(<CreateForm onCreate={onCreate} />);
  await chooseType(createResult, 'top', 't_shirt');
  await fireEvent.press(createResult.getByTestId('wardrobe-entry-state-wanted'));
  await fireEvent.press(createResult.getByTestId('wardrobe-toolbar-checkmark'));
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
  await fireEvent.press(editResult.getByTestId('wardrobe-toolbar-checkmark'));
  expect(onUpdate).toHaveBeenCalledWith(
    expect.objectContaining({ entryState: 'owned' }),
  );
});

// The seven property overrides stay stored fields and never appear in the form; colour
// is the one detail, offered once a type is chosen.
test('the colour section offers the palette, one choice at a time, and no property pickers', async () => {
  const result = await render(<CreateForm />);
  await chooseType(result, 'accessory', 'umbrella');

  expect(result.getByTestId('wardrobe-type-row-name')).toHaveTextContent('Umbrella');
  expect(result.queryByTestId('wardrobe-attribute-waterProtectionOverride')).not.toBeOnTheScreen();
  expect(result.queryByTestId('wardrobe-attribute-thermalLevelOverride')).not.toBeOnTheScreen();

  const copy = messages.en.wardrobe;
  expect(within(result.getByLabelText(copy.solidColorsLabel)).getAllByRole('radio')).toHaveLength(34);
  expect(within(result.getByLabelText(copy.patternColorsLabel)).getAllByRole('radio')).toHaveLength(14);
  const swatch = result.getByTestId('wardrobe-color-dusty_rose');
  expect(swatch.props.accessibilityRole).toBe('radio');
  expect(swatch.props.accessibilityLabel).toBe(copy.colorOptionNames.dusty_rose);
  expect(result.getByTestId('wardrobe-color-custom')).toHaveProp('accessibilityLabel', copy.moreColorsLabel);

  // The name line is hidden from the accessibility tree on purpose: the swatches already
  // carry their names, so it is the sighted reader's confirmation only.
  const selectedName = () =>
    result.getByTestId('wardrobe-color-selected', { includeHiddenElements: true });
  const selected = () => result.getAllByRole('radio')
    .filter((radio) => radio.props.accessibilityState?.selected && radio.props.testID !== 'wardrobe-entry-state-owned')
    .map((radio) => radio.props.testID);
  await fireEvent.press(swatch);
  expect(selectedName()).toHaveTextContent(copy.colorOptionNames.dusty_rose);
  expect(selected()).toEqual(['wardrobe-color-dusty_rose']);
  // Law 1: selection is a `brandAccent` ring, never a fill.
  const selectedStyle = StyleSheet.flatten(result.getByTestId('wardrobe-color-dusty_rose').props.style);
  expect(selectedStyle.borderColor).toBe(lightTheme.colors.brandAccent);
  expect(selectedStyle.backgroundColor).not.toBe(lightTheme.colors.brandAccent);

  await fireEvent.press(result.getByTestId('wardrobe-color-polka_dots'));
  expect(selected()).toEqual(['wardrobe-color-polka_dots']);
  expect(selectedName()).toHaveTextContent(copy.colorOptionNames.polka_dots);
  mockPickedHex = '#8A2BE2';
  await fireEvent.press(result.getByTestId('wardrobe-color-custom'));
  expect(selected()).toEqual(['wardrobe-color-custom']);
  // A custom colour is named by the family it is nearest to.
  expect(selectedName()).toHaveTextContent(
    messages.en.catalog[`catalog.color_family.${nearestFamilyForHex('#8A2BE2')}`]);
});

// O8: the preview stage draws the piece in the chosen solid, pattern or custom colour.
test('the preview stage draws the chosen solid, pattern and custom colour', async () => {
  const result = await render(<CreateForm />);
  await chooseType(result, 'top', 't_shirt');
  type HostNode = { type: unknown; props: Record<string, unknown>; children: readonly (HostNode | string)[] };
  const fills = (node: HostNode): unknown[] => [
    ...(String(node.type).includes('Path') && node.props.fill != null ? [node.props.fill] : []),
    ...(node.children ?? []).flatMap((child) => (typeof child === 'string' ? [] : fills(child))),
  ];
  const preview = () => fills(result.getByTestId('wardrobe-preview-drawing', { includeHiddenElements: true }) as never);
  const patterned = () => preview().some((fill) => (fill as { brushRef?: string }).brushRef != null);

  await fireEvent.press(result.getByTestId('wardrobe-color-cobalt'));
  expect(patterned()).toBe(false);
  const cobalt = preview();
  await fireEvent.press(result.getByTestId('wardrobe-color-red_gingham'));
  expect(patterned()).toBe(true);
  mockPickedHex = '#8A2BE2';
  await fireEvent.press(result.getByTestId('wardrobe-color-custom'));
  expect(patterned()).toBe(false);
  expect(preview()).not.toEqual(cobalt);
});

// A record saved before build 16 (a family and no palette choice) opens named and drawn in
// its family with no swatch on, and an unrelated edit sends no colour choice, so the stored
// colour data stays as it is.
test.each([
  ['a legacy family-only record', null],
  ['a record with a stored pattern', { kind: 'option', id: 'navy_stripes' } as const],
])('%s survives an unrelated edit unchanged', async (_label, colorChoice) => {
  const onUpdate = jest.fn(async (_input: Record<string, unknown>) => undefined);
  const stored: WardrobeItem = colorChoice ? { ...item, colorFamily: 'white', colorChoice } : item;
  const result = await render(
    <TestProviders>
      <WardrobeItemFormScreen isBusy={false} item={stored} mode="edit" onCreate={async () => undefined}
        onDirtyChange={() => undefined} onUpdate={onUpdate} />
    </TestProviders>,
  );
  const selectedName = () =>
    result.getByTestId('wardrobe-color-selected', { includeHiddenElements: true });
  expect(selectedName()).toHaveTextContent(colorChoice
    ? messages.en.wardrobe.colorOptionNames.navy_stripes
    : messages.en.catalog['catalog.color_family.blue']);
  expect(result.getAllByRole('radio').filter((radio) => radio.props.accessibilityState?.selected)
    .map((radio) => radio.props.testID).filter((id) => id.startsWith('wardrobe-color-')))
    .toEqual(colorChoice ? ['wardrobe-color-navy_stripes'] : []);

  await fireEvent.changeText(result.getByTestId('wardrobe-name-input'), 'Renamed');
  await fireEvent.press(result.getByTestId(SAVE));
  expect(onUpdate).toHaveBeenCalledTimes(1);
  const [payload] = onUpdate.mock.calls[0];
  expect(payload).toMatchObject({ name: 'Renamed', colorFamily: stored.colorFamily });
  expect(payload).not.toHaveProperty('colorChoice');

  // Picking a colour does send it, with the family it belongs to.
  await fireEvent.press(result.getByTestId('wardrobe-color-olive'));
  await fireEvent.press(result.getByTestId(SAVE));
  expect(onUpdate.mock.calls[1][0]).toMatchObject({ colorFamily: 'green', colorChoice: { kind: 'option', id: 'olive' } });
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
  await fireEvent.press(result.getByTestId('wardrobe-color-cobalt'));
  await fireEvent.press(result.getByTestId('wardrobe-toolbar-checkmark'));
  await fireEvent.press(result.getByTestId('wardrobe-toolbar-checkmark'));
  expect(onCreate).toHaveBeenCalledTimes(1);
  expect(onCreate).toHaveBeenCalledWith(
    expect.objectContaining({
      name: 'City umbrella',
      garmentTypeId: 'umbrella',
      colorFamily: 'blue',
    }),
  );
  expect(result.getByTestId(SAVE).props.accessibilityState).toEqual(
    expect.objectContaining({ disabled: true }),
  );
  resolveSave?.();
  await waitFor(() =>
    expect(result.getByTestId(SAVE).props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: false }),
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
  await fireEvent.press(result.getByTestId('wardrobe-toolbar-checkmark'));

  await waitFor(() => expect(result.getByTestId('wardrobe-save-error')).toBeOnTheScreen());
  expect(result.getByTestId('wardrobe-name-input').props.value).toBe('My tee');
  await fireEvent.press(result.getByTestId('wardrobe-toolbar-checkmark'));
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
  expect(result.queryByRole('button', { name: messages.en.common.back })).not.toBeOnTheScreen();
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

function PhotoForm({
  language = 'en',
  onCreate = async () => undefined,
  onDirtyChange = () => undefined,
  onSelectPhoto,
}: Readonly<{
  language?: SupportedLanguage;
  onCreate?: (input: Record<string, unknown>, photoChange?: unknown) => Promise<void>;
  onDirtyChange?: (dirty: boolean) => void;
  onSelectPhoto: (source: WardrobePhotoSource) => Promise<StagedWardrobePhoto | null>;
}>) {
  return (
    <TestProviders language={language}>
      <WardrobeItemFormScreen
        isBusy={false}
        mode="create"
        onCreate={onCreate}
        onDirtyChange={onDirtyChange}
        onSelectPhoto={onSelectPhoto}
      />
    </TestProviders>
  );
}

// README section 1: both actions sit on the stage, and above text factor 1.2 they leave it
// and wrap under it (iOS XXXL, the largest standard size, is 1.353).
test.each([
  ['en', 1, true],
  ['tr', 1, true],
  ['tr', 1.353, false],
] as const)(
  'in %s at text factor %s Take photo sits beside Choose photo, on the stage: %s',
  async (language, fontScale, onStage) => {
    Dimensions.set({ window: { ...originalWindowDimensions, fontScale } });
    const copy = messages[language].wardrobe;
    const result = await render(<PhotoForm language={language} onSelectPhoto={async () => null} />);
    const stage = within(result.getByTestId('wardrobe-preview-stage'));
    const camera = result.getByTestId('wardrobe-photo-camera-button');
    expect(camera).toHaveProp('accessibilityLabel', copy.takePhotoAction);
    expect(camera).toHaveProp('accessibilityRole', 'button');
    expect(within(camera).getByText(copy.takePhotoAction, { includeHiddenElements: true })).toBeTruthy();
    expect(result.getByTestId('wardrobe-photo-select-button')).toHaveProp(
      'accessibilityLabel',
      copy.selectPhotoAction,
    );
    expect(stage.queryByTestId('wardrobe-photo-camera-button') !== null).toBe(onStage);
    expect(stage.queryByTestId('wardrobe-photo-select-button') !== null).toBe(onStage);
  },
);

test('Take photo asks for the camera, and a captured photo saves like a chosen one with Retake', async () => {
  const onSelectPhoto = jest.fn(async (_source: WardrobePhotoSource) => stagedPhoto);
  const onCreate = jest.fn(async () => undefined);
  const result = await render(<PhotoForm onCreate={onCreate} onSelectPhoto={onSelectPhoto} />);
  await chooseType(result, 'outerwear', 'rain_jacket');

  await fireEvent.press(result.getByTestId('wardrobe-photo-camera-button'));
  await waitFor(() => expect(result.getByTestId('wardrobe-photo-preview')).toBeOnTheScreen());
  expect(onSelectPhoto).toHaveBeenCalledWith('camera');
  // A captured photo is replaced by the camera again; the library stays one Remove away.
  expect(result.getByRole('button', { name: messages.en.wardrobe.retakePhotoAction })).toBeOnTheScreen();
  expect(result.getByRole('button', { name: messages.en.wardrobe.removePhotoAction })).toBeOnTheScreen();
  expect(result.queryByTestId('wardrobe-photo-select-button')).not.toBeOnTheScreen();

  await fireEvent.press(result.getByTestId(SAVE));
  expect(onCreate).toHaveBeenCalledWith(
    expect.objectContaining({ garmentTypeId: 'rain_jacket' }),
    { kind: 'replace', stagedPhoto },
  );

  await fireEvent.press(result.getByTestId('wardrobe-photo-remove-button'));
  expect(result.getByTestId('wardrobe-photo-camera-button')).toHaveProp(
    'accessibilityLabel',
    messages.en.wardrobe.takePhotoAction,
  );
  expect(result.getByTestId('wardrobe-photo-select-button')).toBeOnTheScreen();
});

test.each(['en', 'tr'] as const)(
  'a denied camera explains itself with a Settings link in %s, and Choose photo still works',
  async (language) => {
    const copy = messages[language].wardrobe;
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
    const onSelectPhoto = jest.fn(async (source: WardrobePhotoSource) => {
      if (source === 'camera') throw new WardrobeCameraAccessError('denied');
      return stagedPhoto;
    });
    const result = await render(<PhotoForm language={language} onSelectPhoto={onSelectPhoto} />);

    await fireEvent.press(result.getByTestId('wardrobe-photo-camera-button'));
    await waitFor(() =>
      expect(result.getByTestId('wardrobe-camera-denied')).toHaveTextContent(copy.cameraDeniedMessage),
    );
    // Not a failure: no error line and no danger ink.
    expect(result.queryByTestId('wardrobe-photo-error')).not.toBeOnTheScreen();
    expect(StyleSheet.flatten(result.getByTestId('wardrobe-camera-denied').props.style).color).toBe(
      lightTheme.colors.textSecondary,
    );
    await fireEvent.press(result.getByRole('button', { name: copy.openSettingsAction }));
    expect(openSettings).toHaveBeenCalledTimes(1);

    await fireEvent.press(result.getByTestId('wardrobe-photo-select-button'));
    await waitFor(() => expect(result.getByTestId('wardrobe-photo-preview')).toBeOnTheScreen());
    expect(onSelectPhoto).toHaveBeenLastCalledWith('library');
    expect(result.queryByTestId('wardrobe-camera-denied')).not.toBeOnTheScreen();
    expect(result.getByRole('button', { name: copy.changePhotoAction })).toBeOnTheScreen();
    openSettings.mockRestore();
  },
);

test('in the edit form, a Retake that meets denied access offers Change, which the note points to', async () => {
  const secondPhoto: StagedWardrobePhoto = {
    id: '318f0f4d-1d45-4ae7-a8f1-796e8297d3b4',
    previewUri: 'file:///private/cache/second-photo.jpg',
  };
  let cameraCalls = 0;
  const onSelectPhoto = jest.fn(async (source: WardrobePhotoSource) => {
    if (source === 'library') return secondPhoto;
    cameraCalls += 1;
    if (cameraCalls > 1) throw new WardrobeCameraAccessError('denied');
    return stagedPhoto;
  });
  const onDiscard = jest.fn(async () => undefined);
  const onUpdate = jest.fn(async () => undefined);
  const result = await render(
    <TestProviders>
      <WardrobeItemFormScreen
        isBusy={false}
        item={item}
        mode="edit"
        onCreate={async () => undefined}
        onDiscardStagedPhoto={onDiscard}
        onDirtyChange={() => undefined}
        onSelectPhoto={onSelectPhoto}
        onUpdate={onUpdate}
      />
    </TestProviders>,
  );
  const copy = messages.en.wardrobe;

  await fireEvent.press(result.getByTestId('wardrobe-photo-camera-button'));
  await waitFor(() => expect(result.getByRole('button', { name: copy.retakePhotoAction })).toBeOnTheScreen());
  await fireEvent.press(result.getByRole('button', { name: copy.retakePhotoAction }));
  await waitFor(() => expect(result.getByTestId('wardrobe-camera-denied')).toBeOnTheScreen());
  // The note says a photo can be chosen instead, so the library action is on the stage.
  expect(result.getByRole('button', { name: copy.changePhotoAction })).toBeOnTheScreen();
  expect(result.queryByRole('button', { name: copy.retakePhotoAction })).not.toBeOnTheScreen();
  expect(result.getByRole('button', { name: copy.openSettingsAction })).toBeOnTheScreen();

  await fireEvent.press(result.getByRole('button', { name: copy.changePhotoAction }));
  await waitFor(() =>
    expect(result.getByTestId('wardrobe-photo-preview').props.source.uri).toBe(secondPhoto.previewUri),
  );
  expect(onSelectPhoto).toHaveBeenLastCalledWith('library');
  expect(onDiscard).toHaveBeenCalledWith(stagedPhoto);
  expect(result.queryByTestId('wardrobe-camera-denied')).not.toBeOnTheScreen();
  await fireEvent.press(result.getByTestId(SAVE));
  expect(onUpdate).toHaveBeenCalledWith(expect.any(Object), { kind: 'replace', stagedPhoto: secondPhoto });
});

test('a device without a camera says so calmly, with no Settings link and no error', async () => {
  const onSelectPhoto = jest.fn(async (source: WardrobePhotoSource) => {
    if (source === 'camera') throw new WardrobeCameraAccessError('unavailable');
    return null;
  });
  const result = await render(<PhotoForm language="tr" onSelectPhoto={onSelectPhoto} />);

  await fireEvent.press(result.getByTestId('wardrobe-photo-camera-button'));
  await waitFor(() =>
    expect(result.getByTestId('wardrobe-camera-unavailable')).toHaveTextContent(
      messages.tr.wardrobe.cameraUnavailableMessage,
    ),
  );
  expect(result.queryByTestId('wardrobe-photo-error')).not.toBeOnTheScreen();
  expect(result.queryByRole('button', { name: messages.tr.wardrobe.openSettingsAction })).not.toBeOnTheScreen();
  expect(result.getByTestId('wardrobe-photo-select-button')).toBeEnabled();
  expect(result.getByTestId('wardrobe-photo-camera-button')).toBeEnabled();
});

test('cancelling the camera leaves the form unchanged', async () => {
  const onDirtyChange = jest.fn();
  const onSelectPhoto = jest.fn(async (_source: WardrobePhotoSource) => null);
  const result = await render(<PhotoForm onDirtyChange={onDirtyChange} onSelectPhoto={onSelectPhoto} />);

  await fireEvent.press(result.getByTestId('wardrobe-photo-camera-button'));
  await waitFor(() => expect(onSelectPhoto).toHaveBeenCalledWith('camera'));
  expect(onDirtyChange).not.toHaveBeenCalledWith(true);
  expect(result.queryByTestId('wardrobe-photo-preview')).not.toBeOnTheScreen();
  expect(result.queryByTestId('wardrobe-camera-denied')).not.toBeOnTheScreen();
  expect(result.queryByTestId('wardrobe-camera-unavailable')).not.toBeOnTheScreen();
  expect(result.queryByTestId('wardrobe-photo-error')).not.toBeOnTheScreen();
  expect(result.getByTestId('wardrobe-photo-camera-button')).toBeEnabled();
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
  expect(result.getByTestId('wardrobe-toolbar-checkmark').props.accessibilityState.disabled).toBe(true);
  await act(async () => resolveSelection?.(stagedPhoto));
  await waitFor(() => expect(result.getByTestId('wardrobe-photo-preview')).toBeOnTheScreen());
  expect(result.getByTestId('wardrobe-photo-preview').props.accessibilityLabel).toBe(
    messages.en.wardrobe.photoAccessibilityLabel('Rain jacket'),
  );
  // On a photo, the stage names the chosen type in a badge with its drawing.
  expect(result.getByTestId('wardrobe-photo-type-badge', { includeHiddenElements: true }))
    .toHaveTextContent('Rain jacket');
  await fireEvent.press(result.getByTestId('wardrobe-toolbar-checkmark'));
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
  await fireEvent.press(result.getByTestId('wardrobe-toolbar-checkmark'));
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
  expect(result.getByTestId('wardrobe-type-row-name')).toHaveTextContent('Rain jacket');
  await chooseType(result, 'accessory', 'umbrella');
  expect(confirmation).toHaveBeenCalledWith(
    expect.objectContaining({
      title: messages.en.wardrobe.typeChangeTitle,
      colorScheme: 'light',
    }),
    expect.any(Function),
  );
  expect(result.getByTestId('wardrobe-type-row-name')).toHaveTextContent('Rain jacket');
  await act(async () => {
    pendingConfirm.current?.();
  });
  expect(result.getByTestId('wardrobe-type-row-name')).toHaveTextContent('Umbrella');
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
  expect(result.getByTestId('wardrobe-type-row-name')).toHaveTextContent('Umbrella');
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
  await fireEvent.press(result.getByTestId('wardrobe-toolbar-checkmark'));
  await waitFor(() => expect(result.getByTestId('wardrobe-save-error')).toBeOnTheScreen());
  expect(result.getByTestId('wardrobe-name-input').props.value).toBe('Updated shell');
  await fireEvent.press(result.getByTestId('wardrobe-toolbar-checkmark'));
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

  await fireEvent.press(result.getByTestId('wardrobe-toolbar-checkmark'));
  await waitFor(() => expect(application.createItem).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(analytics.names()).toContain('feature_used_first_time'));

  expect(analytics.captures).toEqual(
    expect.arrayContaining([
      {
        name: 'closet_item_created',
        properties: {
          schema_version: 3,
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
        properties: { schema_version: 3, feature_name: 'closet' },
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

  await fireEvent.press(result.getByTestId('wardrobe-toolbar-checkmark'));
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
  await fireEvent.press(result.getByTestId('wardrobe-toolbar-checkmark'));
  await waitFor(() => expect(application.updateItem).toHaveBeenCalledTimes(1));

  expect(analytics.captures).toEqual(
    expect.arrayContaining([
      {
        name: 'closet_item_updated',
        properties: {
          schema_version: 3,
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
        properties: { schema_version: 3, state: 'owned', had_photo: true },
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
      properties: { schema_version: 3, screen_name: 'closet_item_form' },
      options: undefined,
    },
  ]);
});

test('a piece added from the Wanted list is filed as wanted and returns to that list, naming the saved tile', async () => {
  mockSearchParams = {};
  mockReplace = jest.fn();
  mockDismissTo = jest.fn();
  const created: WardrobeItem = { ...plainItem, entryState: 'wanted' };
  const application = wardrobeApplication({ createItem: jest.fn(async () => created) });

  const result = await render(
    <TestProviders>
      <AnalyticsProviders>
        <WardrobeApplicationContext.Provider value={application}>
          <WardrobeNewItemRoute defaultEntryState="wanted" />
        </WardrobeApplicationContext.Provider>
      </AnalyticsProviders>
    </TestProviders>,
  );

  // The one field whose default was silently wrong: the form opens on the list the user
  // pressed plus from, not on owned.
  expect(
    result.getByTestId('wardrobe-entry-state-wanted').props.accessibilityState.selected,
  ).toBe(true);

  await chooseType(result, 'outerwear', 'rain_jacket');
  await fireEvent.press(result.getByTestId('wardrobe-toolbar-checkmark'));
  await waitFor(() => expect(application.createItem).toHaveBeenCalledTimes(1));
  expect(application.createItem).toHaveBeenCalledWith(
    expect.objectContaining({ entryState: 'wanted' }),
    undefined,
  );
  // Back to the category and section the item actually joined, with the saved tile named
  // so it alone arrives there: popped back to, never replaced into a second Closet.
  await waitFor(() =>
    expect(mockDismissTo).toHaveBeenCalledWith({
      params: { added: created.id, category: created.category, filter: 'wanted' },
      pathname: '/wardrobe',
    }),
  );
  expect(mockReplace).not.toHaveBeenCalled();
});

// A finished add pops back to the Closet it was pushed from and swaps the route's params,
// so a Closet that was already mounted must still name the piece just saved.
test('a Closet popped back to with a newly saved piece names that piece', async () => {
  const saved: WardrobeItem = { ...plainItem, id: '418f0f4d-1d45-4ae7-a8f1-796e8297d3b4' };
  const draw = (items: WardrobeItem[]) => (
    <TestProviders>
      <AnalyticsProviders>
        <WardrobeApplicationContext.Provider value={wardrobeApplication({
          state: { status: 'ready', items, isRefreshing: false, isMutating: false, refreshFailure: null },
        })}>
          <WardrobeRoute />
        </WardrobeApplicationContext.Provider>
      </AnalyticsProviders>
    </TestProviders>
  );
  mockSearchParams = { category: plainItem.category };
  const result = await render(draw([plainItem]));
  expect(result.queryByTestId('wardrobe-saved-confirmation')).toBeNull();

  mockSearchParams = { added: saved.id, category: saved.category, filter: saved.entryState };
  await result.rerender(draw([plainItem, saved]));
  expect(result.getByTestId('wardrobe-saved-confirmation')).toBeOnTheScreen();
});

test('a Save with no type marks Required in the danger ink with a glyph, and a type clears it', async () => {
  const result = await render(<CreateForm />);

  await fireEvent.press(result.getByTestId(SAVE));
  const tag = result.getByTestId('wardrobe-type-required');
  expect(tag).toHaveTextContent(messages.en.wardrobe.requiredTag);
  expect(StyleSheet.flatten(within(tag).getByText(messages.en.wardrobe.requiredTag).props.style).color)
    .toBe(lightTheme.colors.dangerInk);
  await chooseType(result, 'outerwear', 'rain_jacket');
  expect(result.queryByTestId('wardrobe-type-error')).not.toBeOnTheScreen();
  expect(StyleSheet.flatten(within(result.getByTestId('wardrobe-type-required')).getByText(messages.en.wardrobe.requiredTag).props.style).color)
    .not.toBe(lightTheme.colors.dangerInk);
});
