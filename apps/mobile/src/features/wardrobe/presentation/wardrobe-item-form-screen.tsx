import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, StyleSheet, TextInput, View, type LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedRef } from 'react-native-reanimated';

import {
  AppText,
  Button,
  garmentUsualColorFamilies,
  haptics,
  Icon,
  Screen,
  Surface,
} from '@/components/ui';
import { useErrorAnnouncement } from '@/components/ui/use-error-announcement';
import type { ClothingPreference } from '@/domain/preferences';
import { getGarmentType } from '@/features/catalog/domain/garment-catalog';
import type {
  GarmentTypeId,
  StructuralCategory,
} from '@/features/catalog/domain/garment-taxonomy';
import {
  createWardrobeFormValues,
  hasWardrobeOverrides,
  mapWardrobeCreateValues,
  mapWardrobeUpdateValues,
  selectWardrobeGarmentType,
  validateWardrobeForm,
  wardrobeFormValuesEqual,
  type WardrobeFormValues,
} from '@/features/wardrobe/application/wardrobe-form';
import {
  unchangedWardrobePhoto,
  type WardrobePhotoChange,
} from '@/features/wardrobe/application/wardrobe-photo-manager';
import type { StagedWardrobePhoto } from '@/features/wardrobe/data/wardrobe-photo-adapters';
import {
  colorChoiceFamily,
  type ClosetColorChoice,
} from '@/features/wardrobe/domain/closet-color-options';
import type {
  WardrobeEntryState,
  WardrobeItem,
} from '@/features/wardrobe/domain/wardrobe-item';
import {
  WardrobeCameraAccessError,
  type WardrobePhotoSource,
} from '@/features/wardrobe/domain/wardrobe-photo';
import {
  closetColorName,
  ClosetColorPalette,
} from '@/features/wardrobe/presentation/closet-color-palette';
import { FormToolbar } from '@/features/wardrobe/presentation/form-toolbar';
import { GarmentTypePicker } from '@/features/wardrobe/presentation/garment-type-picker';
import { OwnershipChoice } from '@/features/wardrobe/presentation/ownership-choice';
import { PiecePreviewStage } from '@/features/wardrobe/presentation/piece-preview-stage';
import {
  showWardrobeConfirmation,
  type WardrobeConfirmation,
} from '@/features/wardrobe/presentation/wardrobe-confirmation';
import { useMessages } from '@/localization/use-messages';
import { borderWidths, radii, spacing, typography } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

type WardrobeItemFormScreenProps = Readonly<{
  mode: 'create' | 'edit';
  item?: WardrobeItem;
  /** Filters the type picker's catalogue; `null` until the profile resolves one. */
  clothingPreference?: ClothingPreference | null;
  /**
   * Where a new item lands: the Closet list's own segment, so a piece added from Wanted
   * is filed as wanted. An existing item's stored state always wins over it.
   */
  defaultEntryState?: WardrobeEntryState;
  /** The Closet category a new item was added from; the type picker opens on it (O9). */
  defaultCategory?: StructuralCategory;
  isBusy: boolean;
  confirmation?: WardrobeConfirmation;
  photoPreviewUri?: string | null;
  onDirtyChange: (isDirty: boolean) => void;
  /** The toolbar's Cancel; the route's exit guard confirms a dirty form. */
  onCancel?: () => void;
  onSelectPhoto?: (source: WardrobePhotoSource) => Promise<StagedWardrobePhoto | null>;
  onDiscardStagedPhoto?: (photo: StagedWardrobePhoto) => Promise<void>;
  onCreate: (
    input: NonNullable<ReturnType<typeof mapWardrobeCreateValues>>,
    photoChange?: WardrobePhotoChange,
  ) => Promise<void>;
  onUpdate?: (
    input: NonNullable<ReturnType<typeof mapWardrobeUpdateValues>>,
    photoChange?: WardrobePhotoChange,
  ) => Promise<void>;
  onDelete?: () => Promise<void>;
}>;

// A heading with its Required or Optional tag on the trailing edge. The tag is words, so
// the invalid state is ink, glyph and text together (Law 4).
function SectionHeading({
  heading,
  invalid = false,
  tag,
  testID,
  variant = 'title',
}: Readonly<{
  heading: string;
  tag?: string;
  invalid?: boolean;
  testID?: string;
  variant?: 'title' | 'bodyStrong';
}>) {
  const theme = useKuyaraTheme();
  return (
    <View style={styles.heading}>
      <AppText accessibilityRole="header" style={styles.headingText} variant={variant}>
        {heading}
      </AppText>
      {tag ? (
        <View style={styles.tag} testID={testID}>
          {invalid ? <Icon color={theme.colors.dangerInk} name="error" size={16} /> : null}
          <AppText colorRole={invalid ? 'dangerInk' : 'textSecondary'} variant="label">
            {tag}
          </AppText>
        </View>
      ) : null}
    </View>
  );
}

function ErrorLine({ message, testID }: Readonly<{ message: string; testID: string }>) {
  const theme = useKuyaraTheme();
  useErrorAnnouncement(message);
  return (
    <View style={styles.statusRow}>
      <Icon color={theme.colors.dangerInk} name="error" size={20} />
      <AppText
        accessibilityLiveRegion="assertive"
        accessibilityRole="alert"
        colorRole="dangerInk"
        style={styles.statusCopy}
        testID={testID}>
        {message}
      </AppText>
    </View>
  );
}

// The camera could not open. That is not a failure of the form, so the line is secondary
// ink with an info glyph and words (Law 4), never the danger treatment.
function CameraNotice({ message, testID }: Readonly<{ message: string; testID: string }>) {
  const theme = useKuyaraTheme();
  return (
    <View style={styles.statusRow}>
      <Icon color={theme.colors.iconSecondary} name="infoOutline" size={20} />
      <AppText
        accessibilityLiveRegion="polite"
        colorRole="textSecondary"
        style={styles.statusCopy}
        testID={testID}>
        {message}
      </AppText>
    </View>
  );
}

export function WardrobeItemFormScreen({
  clothingPreference = null,
  confirmation = showWardrobeConfirmation,
  defaultCategory,
  defaultEntryState = 'owned',
  isBusy,
  item,
  mode,
  onCancel = () => undefined,
  onCreate,
  onDelete,
  onDiscardStagedPhoto = async () => undefined,
  onDirtyChange,
  onSelectPhoto = async () => {
    throw new Error('Photo selection is unavailable.');
  },
  onUpdate,
  photoPreviewUri = null,
}: WardrobeItemFormScreenProps) {
  const messages = useMessages();
  const copy = messages.wardrobe;
  const theme = useKuyaraTheme();
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const typeSectionY = useRef(0);
  const initialValues = useMemo(() => createWardrobeFormValues(item), [item]);
  const initialEntryState = item?.entryState ?? defaultEntryState;
  const [values, setValues] = useState(initialValues);
  const [entryState, setEntryState] = useState<WardrobeEntryState>(
    initialEntryState,
  );
  // An existing item whose type was never set or no longer resolves opens invalid, so the
  // hint is visible on arrival instead of waiting for a rejected Save.
  const [validationError, setValidationError] = useState(
    mode === 'edit' && validateWardrobeForm(initialValues) !== null,
  );
  const [saveError, setSaveError] = useState(false);
  const [deleteError, setDeleteError] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [processingSource, setProcessingSource] = useState<WardrobePhotoSource | null>(null);
  // `failed` is the photo pipeline's error; `denied` and `unavailable` are the camera's.
  const [photoProblem, setPhotoProblem] = useState<
    'failed' | WardrobeCameraAccessError['reason'] | null
  >(null);
  // Where the staged photo came from, so a camera photo is replaced by the camera again.
  const [photoSource, setPhotoSource] = useState<WardrobePhotoSource>('library');
  const [photoChange, setPhotoChange] = useState<WardrobePhotoChange>(
    unchangedWardrobePhoto,
  );
  const [unreadablePhotoUri, setUnreadablePhotoUri] = useState<string | null>(null);
  // O10: a new piece starts on its type's most natural colour until the user picks one.
  const colorChosenRef = useRef(mode === 'edit');
  const operationRef = useRef<Promise<void> | null>(null);
  const mountedRef = useRef(true);
  const stagedPhotoRef = useRef<StagedWardrobePhoto | null>(null);
  const discardStagedPhotoRef = useRef(onDiscardStagedPhoto);
  const isProcessingPhoto = processingSource !== null;
  const busy = isBusy || isSaving || isDeleting || isProcessingPhoto;
  const selectedType = values.garmentTypeId
    ? getGarmentType(values.garmentTypeId)
    : null;
  const selectedTypeLabel = selectedType
    ? messages.catalog[selectedType.nameKey]
    : null;
  const resolvedPreviewUri =
    photoChange.kind === 'replace'
      ? photoChange.stagedPhoto.previewUri
      : photoChange.kind === 'remove'
        ? null
        : photoPreviewUri;
  const hasPhoto =
    resolvedPreviewUri !== null ||
    (photoChange.kind === 'unchanged' && Boolean(item?.photoRelativePath));
  const visiblePreviewUri =
    resolvedPreviewUri === unreadablePhotoUri ? null : resolvedPreviewUri;
  const saveLabel =
    mode === 'edit'
      ? copy.saveAction
      : entryState === 'wanted'
        ? copy.saveWantedAction
        : copy.saveOwnedAction;

  useEffect(() => {
    discardStagedPhotoRef.current = onDiscardStagedPhoto;
  }, [onDiscardStagedPhoto]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      const stagedPhoto = stagedPhotoRef.current;
      if (stagedPhoto) {
        void discardStagedPhotoRef.current(stagedPhoto).catch(() => undefined);
      }
    };
  }, []);

  const changePhoto = (next: WardrobePhotoChange) => {
    stagedPhotoRef.current =
      next.kind === 'replace' ? next.stagedPhoto : null;
    setPhotoChange(next);
    setSaveError(false);
  };

  const updateValues = useCallback((
    updater: (current: WardrobeFormValues) => WardrobeFormValues,
  ) => {
    setValues(updater);
    setSaveError(false);
  }, []);

  const updateEntryState = (next: WardrobeEntryState) => {
    if (entryState !== next) haptics.selection();
    setEntryState(next);
    setSaveError(false);
  };

  // O8: one palette choice sets the family it belongs to, as the repository derives it.
  const chooseColor = (colorChoice: ClosetColorChoice) => {
    colorChosenRef.current = true;
    updateValues((current) => ({ ...current, colorChoice, colorFamily: colorChoiceFamily(colorChoice) }));
  };

  // The exit guard reads one derived fact. It is reported from an effect, never from
  // inside a state updater, because React runs updaters during render and a parent
  // setState from there is the "cannot update a component while rendering" error.
  const isDirty =
    !wardrobeFormValuesEqual(values, initialValues) ||
    entryState !== initialEntryState ||
    photoChange.kind !== 'unchanged';
  useEffect(() => {
    onDirtyChange(isDirty);
  }, [isDirty, onDirtyChange]);

  const selectPhoto = (source: WardrobePhotoSource) => {
    if (operationRef.current || busy) {
      return;
    }

    setPhotoProblem(null);
    setProcessingSource(source);
    void onSelectPhoto(source)
      .then(async (stagedPhoto) => {
        if (!stagedPhoto) {
          return;
        }

        if (!mountedRef.current) {
          await onDiscardStagedPhoto(stagedPhoto).catch(() => undefined);
          return;
        }

        const previous = stagedPhotoRef.current;
        if (previous) {
          await onDiscardStagedPhoto(previous).catch(() => undefined);
        }
        if (!mountedRef.current) {
          await onDiscardStagedPhoto(stagedPhoto).catch(() => undefined);
          return;
        }
        setUnreadablePhotoUri(null);
        setPhotoSource(source);
        changePhoto({ kind: 'replace', stagedPhoto });
      })
      .catch((error: unknown) => {
        if (mountedRef.current) {
          setPhotoProblem(error instanceof WardrobeCameraAccessError ? error.reason : 'failed');
        }
      })
      .finally(() => {
        if (mountedRef.current) {
          setProcessingSource(null);
        }
      });
  };

  const removePhoto = () => {
    if (operationRef.current || busy || !hasPhoto) {
      return;
    }

    const stagedPhoto = stagedPhotoRef.current;
    if (stagedPhoto) {
      void onDiscardStagedPhoto(stagedPhoto).catch(() => undefined);
    }
    setUnreadablePhotoUri(null);
    setPhotoProblem(null);
    changePhoto(item?.photoRelativePath ? { kind: 'remove' } : unchangedWardrobePhoto);
  };

  const selectType = (typeId: GarmentTypeId) => {
    if (typeId === values.garmentTypeId || busy) {
      return;
    }

    const applySelection = () => {
      updateValues((current) => {
        const next = selectWardrobeGarmentType(current, typeId);
        return colorChosenRef.current
          ? next
          : { ...next, colorFamily: garmentUsualColorFamilies(typeId)[0] ?? null };
      });
      setValidationError(false);
    };

    if (values.garmentTypeId && hasWardrobeOverrides(values)) {
      confirmation(
        {
          title: copy.typeChangeTitle,
          message: copy.typeChangeBody,
          cancelLabel: copy.keepTypeAction,
          confirmLabel: copy.changeTypeAction,
          colorScheme: theme.colorScheme,
        },
        applySelection,
      );
      return;
    }

    applySelection();
  };

  const save = () => {
    if (operationRef.current || busy) {
      return;
    }

    if (validateWardrobeForm(values)) {
      setValidationError(true);
      // Save sits in the toolbar, so the question it is waiting on is brought into view.
      scrollRef.current?.scrollTo({ animated: true, y: Math.max(typeSectionY.current - spacing.md, 0) });
      return;
    }

    setSaveError(false);
    setIsSaving(true);
    const operation = (mode === 'create'
      ? (() => {
          const payload = mapWardrobeCreateValues(values);
          return payload
            ? photoChange.kind === 'unchanged'
              ? onCreate({ ...payload, entryState })
              : onCreate({ ...payload, entryState }, photoChange)
            : Promise.reject(new Error('The form is invalid.'));
        })()
      : (() => {
          const payload = mapWardrobeUpdateValues(values, initialValues);
          return payload && onUpdate
            ? photoChange.kind === 'unchanged'
              ? onUpdate({ ...payload, entryState })
              : onUpdate({ ...payload, entryState }, photoChange)
            : Promise.reject(new Error('Update is unavailable.'));
        })())
      .catch(() => {
        setSaveError(true);
        // The failure line sits at the top, above the stage, where the toolbar's Save is.
        scrollRef.current?.scrollTo({ animated: true, y: 0 });
      })
      .finally(() => {
        setIsSaving(false);
        operationRef.current = null;
      });
    operationRef.current = operation;
  };

  const requestDelete = () => {
    if (!onDelete || operationRef.current || busy) {
      return;
    }

    confirmation(
      {
        title: copy.deleteConfirmTitle,
        message: copy.deleteConfirmBody,
        cancelLabel: copy.cancelDeleteAction,
        confirmLabel: copy.confirmDeleteAction,
        destructive: true,
        colorScheme: theme.colorScheme,
      },
      () => {
        setDeleteError(false);
        setIsDeleting(true);
        const operation = onDelete()
          .catch(() => {
            setDeleteError(true);
          })
          .finally(() => {
            setIsDeleting(false);
            operationRef.current = null;
          });
        operationRef.current = operation;
      },
    );
  };

  const piece = {
    category: selectedType?.structuralCategory ?? item?.category ?? 'top',
    colorFamily: values.colorFamily,
    garmentTypeId: selectedType?.typeId ?? null,
  } as const;
  const colorName = closetColorName(messages, values.colorChoice, values.colorFamily);

  return (
    <>
      <FormToolbar
        cancelDisabled={isSaving || isDeleting}
        cancelLabel={copy.cancelAction}
        onCancel={onCancel}
        onSave={save}
        saveDisabled={busy}
        saveLabel={saveLabel}
      />
      <Screen
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        ref={scrollRef}
        testID={mode === 'create' ? 'wardrobe-create-form' : 'wardrobe-edit-form'}>
        {/* The title and Cancel/Save are the route's native header; `Screen`'s automatic
            content inset clears it. */}
        {saveError ? (
          <ErrorLine
            message={mode === 'create' ? copy.createError : copy.updateError}
            testID="wardrobe-save-error"
          />
        ) : null}

        <View style={styles.section}>
          <PiecePreviewStage
            category={piece.category}
            colorChoice={values.colorChoice}
            colorFamily={piece.colorFamily}
            disabled={isSaving || isDeleting || isBusy}
            garmentTypeId={piece.garmentTypeId}
            hasPhoto={hasPhoto}
            onPhotoError={() => setUnreadablePhotoUri(visiblePreviewUri)}
            onRemovePhoto={removePhoto}
            onSelectPhoto={selectPhoto}
            // A camera photo offers Retake, unless the camera just could not open: then the
            // library's Change is what the note's "choose a photo instead" points to.
            photoSource={photoChange.kind === 'replace' && photoProblem === null ? photoSource : 'library'}
            photoUri={visiblePreviewUri}
            processingSource={processingSource}
            removeDisabled={busy}
            typeLabel={selectedTypeLabel}
          />
          {hasPhoto ? null : (
            <AppText colorRole="textSecondary" variant="caption">
              {copy.photoHint}
            </AppText>
          )}
          {photoProblem === 'failed' ? (
            <ErrorLine message={copy.photoError} testID="wardrobe-photo-error" />
          ) : null}
          {photoProblem === 'unavailable' ? (
            <CameraNotice
              message={copy.cameraUnavailableMessage}
              testID="wardrobe-camera-unavailable"
            />
          ) : null}
          {photoProblem === 'denied' ? (
            <>
              <CameraNotice message={copy.cameraDeniedMessage} testID="wardrobe-camera-denied" />
              {/* The platform's own link to kuyara's page in the system settings. */}
              <Button
                label={copy.openSettingsAction}
                onPress={() => void Linking.openSettings().catch(() => undefined)}
                size="small"
                style={styles.settingsLink}
                testID="wardrobe-camera-settings-button"
                variant="tonal"
              />
            </>
          ) : null}
        </View>

        <OwnershipChoice
          disabled={busy}
          entryState={entryState}
          onChange={updateEntryState}
          piece={piece}
        />

        <View
          onLayout={(event: LayoutChangeEvent) => {
            typeSectionY.current = event.nativeEvent.layout.y;
          }}
          style={styles.section}
          testID="wardrobe-type-section">
          <SectionHeading
            heading={copy.typeTitle}
            invalid={validationError}
            tag={copy.requiredTag}
            testID="wardrobe-type-required"
          />
          {validationError ? (
            <ErrorLine message={copy.typeRequiredError} testID="wardrobe-type-error" />
          ) : null}
          <GarmentTypePicker
            clothingPreference={clothingPreference}
            colorFamily={values.colorFamily}
            disabled={busy}
            initialCategory={item?.category ?? defaultCategory}
            onSelect={selectType}
            selectedTypeId={values.garmentTypeId}
          />
        </View>

        {selectedType ? (
          <View style={styles.section} testID="wardrobe-color-section">
            <View style={styles.heading}>
              <AppText accessibilityRole="header" style={styles.headingText} variant="title">
                {copy.colorTitle}
              </AppText>
              {/* The swatches carry their names for assistive technology, so this is the
                  sighted reader's confirmation: colour is never the only signal. */}
              <AppText
                accessibilityElementsHidden
                colorRole="textSecondary"
                importantForAccessibility="no-hide-descendants"
                testID="wardrobe-color-selected"
                variant="label">
                {colorName}
              </AppText>
            </View>
            <ClosetColorPalette choice={values.colorChoice} disabled={busy} onChange={chooseColor} />
          </View>
        ) : null}

        <View style={styles.section}>
          <SectionHeading heading={copy.nameLabel} tag={copy.optionalTag} variant="bodyStrong" />
          <TextInput
            accessibilityLabel={copy.nameLabel}
            editable={!busy}
            onChangeText={(name) => updateValues((current) => ({ ...current, name }))}
            placeholder={copy.namePlaceholder}
            placeholderTextColor={theme.colors.textSecondary}
            style={[
              styles.textInput,
              {
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.borderDefined,
                color: theme.colors.textPrimary,
              },
            ]}
            testID="wardrobe-name-input"
            value={values.name}
          />
        </View>

        {mode === 'edit' && onDelete ? (
          <Surface style={styles.deleteSection} variant="muted">
            <View style={styles.sectionLabel}>
              <AppText colorRole="textPrimary" variant="bodyStrong">
                {copy.deleteSectionTitle}
              </AppText>
              <AppText colorRole="textSecondary">{copy.deleteSectionBody}</AppText>
            </View>
            {deleteError ? (
              <ErrorLine message={copy.deleteError} testID="wardrobe-delete-error" />
            ) : null}
            <Button
              accessibilityHint={copy.deleteSectionBody}
              disabled={isSaving || isBusy}
              icon="trash"
              label={isDeleting ? copy.deletingLabel : copy.deleteAction}
              loading={isDeleting}
              onPress={requestDelete}
              testID="wardrobe-delete-button"
              variant="destructive"
            />
          </Surface>
        ) : null}
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.md,
  },
  section: {
    gap: spacing.sm,
  },
  sectionLabel: {
    gap: spacing.xs,
  },
  heading: {
    alignItems: 'baseline',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  headingText: {
    flex: 1,
  },
  tag: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  statusRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  statusCopy: {
    flex: 1,
  },
  settingsLink: {
    alignSelf: 'flex-start',
  },
  textInput: {
    borderRadius: radii.control,
    borderWidth: borderWidths.subtle,
    fontSize: typography.body.fontSize,
    minHeight: 52,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  deleteSection: {
    gap: spacing.md,
    padding: spacing.lg,
  },
});
