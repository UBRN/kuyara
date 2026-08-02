import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { garmentCatalog } from '@/features/catalog/domain/garment-catalog';
import type { WardrobeItem } from '@/features/wardrobe/domain/wardrobe-item';
import type { StagedWardrobePhoto } from '@/features/wardrobe/data/wardrobe-photo-adapters';
import type { WardrobeConfirmation } from '@/features/wardrobe/presentation/wardrobe-confirmation';
import { WardrobeItemFormScreen } from '@/features/wardrobe/presentation/wardrobe-item-form-screen';
import { WardrobeRouteStatus } from '@/features/wardrobe/presentation/wardrobe-item-routes';
import { WardrobeListScreen } from '@/features/wardrobe/presentation/wardrobe-list-screen';
import { LocalizationContext } from '@/localization/localization-context';
import { messages, type SupportedLanguage } from '@/localization/messages';
import { darkTheme, lightTheme } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

jest.mock('expo-symbols', () => ({
  SymbolView: () => null,
}));

jest.mock('expo-router', () => ({
  useNavigation: () => ({
    addListener: () => () => undefined,
    dispatch: () => undefined,
  }),
  useRouter: () => ({
    back: () => undefined,
    replace: () => undefined,
  }),
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

const formTypes = garmentCatalog.garmentTypes.filter(({ typeId }) =>
  ['t_shirt', 'rain_jacket', 'umbrella'].includes(typeId),
);

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
    <LocalizationContext.Provider value={{ language, messages: messages[language] }}>
      <KuyaraThemeContext.Provider value={dark ? darkTheme : lightTheme}>
        <SafeAreaProvider initialMetrics={initialMetrics}>
          {children}
        </SafeAreaProvider>
      </KuyaraThemeContext.Provider>
    </LocalizationContext.Provider>
  );
}

const readyState = {
  status: 'ready' as const,
  items: [],
  isRefreshing: false,
  isMutating: false,
  hasRefreshError: false,
};

describe.each(['en', 'tr'] as const)('%s wardrobe list', (language) => {
  test('shows the accessible empty state and emits the new-item intent', async () => {
    const onAdd = jest.fn();
    const result = await render(
      <TestProviders language={language}>
        <WardrobeListScreen
          onAdd={onAdd}
          onEdit={() => undefined}
          onRetry={() => undefined}
          state={readyState}
        />
      </TestProviders>,
    );

    expect(result.getByRole('header', { name: messages[language].wardrobe.title })).toBeOnTheScreen();
    expect(result.getByText(messages[language].wardrobe.emptyBody)).toBeOnTheScreen();
    await fireEvent.press(
      result.getByRole('button', { name: messages[language].wardrobe.emptyAction }),
    );
    expect(onAdd).toHaveBeenCalledTimes(1);
  });
});

test('list exposes accessible loading and retryable error states', async () => {
  const onRetry = jest.fn();
  const loading = await render(
    <TestProviders>
      <WardrobeListScreen
        onAdd={() => undefined}
        onEdit={() => undefined}
        onRetry={onRetry}
        state={{ status: 'loading' }}
      />
    </TestProviders>,
  );
  expect(loading.getByTestId('wardrobe-loading').props.accessibilityRole).toBe(
    'progressbar',
  );
  expect(
    loading.getByLabelText(messages.en.wardrobe.loadingLabel),
  ).toBeOnTheScreen();
  await loading.unmount();

  const error = await render(
    <TestProviders>
      <WardrobeListScreen
        onAdd={() => undefined}
        onEdit={() => undefined}
        onRetry={onRetry}
        state={{ status: 'error' }}
      />
    </TestProviders>,
  );
  await fireEvent.press(
    error.getByRole('button', { name: messages.en.wardrobe.retryAction }),
  );
  expect(
    StyleSheet.flatten(error.getByTestId('wardrobe-load-error').props.style)
      .paddingTop,
  ).toBe(initialMetrics.insets.top + 24);
  expect(onRetry).toHaveBeenCalledTimes(1);
});

test('list shows localized catalog values and emits the edit intent', async () => {
  const onEdit = jest.fn();
  const result = await render(
    <TestProviders language="tr">
      <WardrobeListScreen
        onAdd={() => undefined}
        onEdit={onEdit}
        onRetry={() => undefined}
        state={{ ...readyState, items: [item] }}
      />
    </TestProviders>,
  );

  expect(result.getByText('Yağmurluk')).toBeOnTheScreen();
  expect(result.getByText('Dış giyim · Mavi')).toBeOnTheScreen();
  expect(result.queryByText('rain_jacket')).not.toBeOnTheScreen();
  await fireEvent.press(result.getByTestId(`wardrobe-item-${item.id}`));
  expect(onEdit).toHaveBeenCalledWith(item.id);
});

test('ready list keeps virtualization and refresh below measured header clearance', async () => {
  const onRetry = jest.fn();
  const result = await render(
    <TestProviders>
      <WardrobeListScreen
        onAdd={() => undefined}
        onEdit={() => undefined}
        onRetry={onRetry}
        state={{ ...readyState, items: [item] }}
      />
    </TestProviders>,
  );

  await fireEvent(result.getByTestId('wardrobe-stretchy-header'), 'layout', {
    nativeEvent: { layout: { height: 151, width: 390, x: 0, y: 0 } },
  });

  const list = result.getByTestId('wardrobe-list');
  const contentStyle = StyleSheet.flatten(list.props.contentContainerStyle);
  expect(contentStyle.paddingTop).toBe(151 + 24);
  expect(list.props.progressViewOffset).toBe(151);
  expect(list.props.alwaysBounceVertical).toBe(true);
  expect(list.props.data).toEqual([item]);
  expect(list.props.keyExtractor(item)).toBe(item.id);

  await fireEvent(list, 'refresh');
  expect(onRetry).toHaveBeenCalledTimes(1);
});

test('list renders an accessible thumbnail and falls back safely after image failure', async () => {
  const itemWithPhoto = {
    ...item,
    photoRelativePath:
      'kuyara/wardrobe/photos/318f0f4d-1d45-4ae7-a8f1-796e8297d3b4.jpg',
  };
  const result = await render(
    <TestProviders>
      <WardrobeListScreen
        onAdd={() => undefined}
        onEdit={() => undefined}
        onRetry={() => undefined}
        resolvePhotoUri={() => 'file:///private/documents/photo.jpg'}
        state={{ ...readyState, items: [itemWithPhoto] }}
      />
    </TestProviders>,
  );

  const thumbnail = result.getByTestId(`wardrobe-photo-${item.id}`);
  expect(thumbnail.props.accessibilityLabel).toBe(
    messages.en.wardrobe.photoAccessibilityLabel('Rain jacket'),
  );
  await fireEvent(thumbnail, 'error');
  expect(result.queryByTestId(`wardrobe-photo-${item.id}`)).not.toBeOnTheScreen();
  expect(result.getByTestId(`wardrobe-item-${item.id}`)).toBeOnTheScreen();
});

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

function CreateForm({
  confirmation,
  onBackRequested = () => undefined,
  onCreate = async () => undefined,
}: Readonly<{
  confirmation?: WardrobeConfirmation;
  onBackRequested?: (dirty: boolean) => void;
  onCreate?: (input: Record<string, unknown>) => Promise<void>;
}>) {
  return (
    <TestProviders>
      <WardrobeItemFormScreen
        confirmation={confirmation}
        garmentTypes={formTypes}
        isBusy={false}
        mode="create"
        onBackRequested={onBackRequested}
        onCreate={onCreate}
        onDirtyChange={() => undefined}
      />
    </TestProviders>
  );
}

test('create form uses catalog options, reports required validation, and has no delete action', async () => {
  const onCreate = jest.fn(async () => undefined);
  const result = await render(<CreateForm onCreate={onCreate} />);

  expect(result.getByRole('radio', { name: 'T-shirt' })).toBeOnTheScreen();
  expect(result.getByRole('radio', { name: 'Rain jacket' })).toBeOnTheScreen();
  expect(result.queryByTestId('wardrobe-delete-button')).not.toBeOnTheScreen();
  await fireEvent.press(result.getByTestId('wardrobe-save-button'));
  expect(result.getByRole('alert')).toHaveTextContent(
    messages.en.wardrobe.typeRequiredError,
  );
  expect(onCreate).not.toHaveBeenCalled();
});

test('type selection exposes only catalog-supported attributes and selected state', async () => {
  const result = await render(<CreateForm />);
  await fireEvent.press(result.getByTestId('wardrobe-type-umbrella'));

  expect(result.getByTestId('wardrobe-type-umbrella').props.accessibilityState).toEqual({
    disabled: false,
    selected: true,
  });
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
    <CreateForm onBackRequested={onBack} onCreate={onCreate} />,
  );

  await fireEvent.changeText(result.getByTestId('wardrobe-name-input'), 'City umbrella');
  await fireEvent.press(result.getByTestId('wardrobe-type-umbrella'));
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
  const result = await render(<CreateForm onCreate={onCreate} />);
  await fireEvent.changeText(result.getByTestId('wardrobe-name-input'), 'My tee');
  await fireEvent.press(result.getByTestId('wardrobe-type-t_shirt'));
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
        garmentTypes={formTypes}
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
        garmentTypes={formTypes}
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

  await fireEvent.press(result.getByTestId('wardrobe-type-rain_jacket'));
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
        garmentTypes={formTypes}
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
        garmentTypes={formTypes}
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
        garmentTypes={formTypes}
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
        garmentTypes={formTypes}
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
  expect(result.getByTestId('wardrobe-type-rain_jacket').props.accessibilityState.selected).toBe(true);
  await fireEvent.press(result.getByTestId('wardrobe-type-umbrella'));
  expect(confirmation).toHaveBeenCalledWith(
    expect.objectContaining({ title: messages.en.wardrobe.typeChangeTitle }),
    expect.any(Function),
  );
  expect(result.getByTestId('wardrobe-type-rain_jacket').props.accessibilityState.selected).toBe(true);
  await act(async () => {
    pendingConfirm.current?.();
  });
  expect(result.getByTestId('wardrobe-type-umbrella').props.accessibilityState.selected).toBe(true);
  expect(result.queryByTestId('wardrobe-attribute-thermalLevelOverride')).not.toBeOnTheScreen();
});

test('edit update failure preserves values and remains retryable', async () => {
  const onUpdate = jest
    .fn<Promise<void>, [Record<string, unknown>]>()
    .mockRejectedValueOnce(new Error('failed'))
    .mockResolvedValueOnce(undefined);
  const result = await render(
    <TestProviders dark>
      <WardrobeItemFormScreen
        garmentTypes={formTypes}
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
        garmentTypes={formTypes}
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
