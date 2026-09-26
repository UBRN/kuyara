import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, TextInput, View, type LayoutChangeEvent } from 'react-native';
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
import type { ClothingPreference } from '@/domain/preferences';
import { getGarmentType } from '@/features/catalog/domain/garment-catalog';
import type {
  ColorFamily,
  GarmentTypeId,
  StructuralCategory,
} from '@/features/catalog/domain/garment-taxonomy';
import {
  colorFamilies,
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
import type {
  WardrobeEntryState,
  WardrobeItem,
} from '@/features/wardrobe/domain/wardrobe-item';
import { ColorSwatch } from '@/features/wardrobe/presentation/color-swatch';
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
  onSelectPhoto?: () => Promise<StagedWardrobePhoto | null>;
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
  return (
    <View style={styles.errorRow}>
      <Icon color={theme.colors.dangerInk} name="error" size={20} />
      <AppText
        accessibilityLiveRegion="assertive"
        accessibilityRole="alert"
        colorRole="dangerInk"
        style={styles.errorCopy}
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
  const [isProcessingPhoto, setIsProcessingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState(false);
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
  const busy = isBusy || isSaving || isDeleting || isProcessingPhoto;
  const selectedType = values.garmentTypeId
    ? getGarmentType(values.garmentTypeId)
    : null;
  const selectedTypeLabel = selectedType
    ? messages.catalog[selectedType.nameKey]
    : null;
  const colorLabel = (family: ColorFamily | null) =>
    family ? messages.catalog[`catalog.color_family.${family}`] : copy.colorUnspecified;
  const usualColors = selectedType ? garmentUsualColorFamilies(selectedType.typeId) : [];
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

  const chooseColor = (colorFamily: ColorFamily) => {
    colorChosenRef.current = true;
    updateValues((current) => ({ ...current, colorFamily }));
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

  const selectPhoto = () => {
    if (operationRef.current || busy) {
      return;
    }

    setPhotoError(false);
    setIsProcessingPhoto(true);
    void onSelectPhoto()
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
        changePhoto({ kind: 'replace', stagedPhoto });
      })
      .catch(() => {
        if (mountedRef.current) {
          setPhotoError(true);
        }
      })
      .finally(() => {
        if (mountedRef.current) {
          setIsProcessingPhoto(false);
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
    setPhotoError(false);
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
          const payload = mapWardrobeUpdateValues(values);
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
            colorFamily={piece.colorFamily}
            disabled={isSaving || isDeleting || isBusy}
            garmentTypeId={piece.garmentTypeId}
            hasPhoto={hasPhoto}
            isProcessing={isProcessingPhoto}
            onPhotoError={() => setUnreadablePhotoUri(visiblePreviewUri)}
            onRemovePhoto={removePhoto}
            onSelectPhoto={selectPhoto}
            photoUri={visiblePreviewUri}
            removeDisabled={busy}
            typeLabel={selectedTypeLabel}
          />
          {hasPhoto ? null : (
            <AppText colorRole="textSecondary" variant="caption">
              {copy.photoHint}
            </AppText>
          )}
          {photoError ? (
            <ErrorLine message={copy.photoError} testID="wardrobe-photo-error" />
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
                {colorLabel(values.colorFamily)}
              </AppText>
            </View>
            <AppText colorRole="textSecondary" variant="label">
              {copy.usualColorsLabel}
            </AppText>
            <View
              accessibilityLabel={copy.usualColorsLabel}
              accessibilityRole="radiogroup"
              style={styles.swatchRow}>
              {usualColors.map((family) => (
                <View key={family} style={styles.namedSwatch}>
                  <ColorSwatch
                    colorFamily={family}
                    disabled={busy}
                    label={colorLabel(family)}
                    onPress={() => chooseColor(family)}
                    selected={values.colorFamily === family}
                  />
                  <AppText
                    accessibilityElementsHidden
                    importantForAccessibility="no-hide-descendants"
                    numberOfLines={2}
                    style={styles.swatchName}
                    variant="caption">
                    {colorLabel(family)}
                  </AppText>
                </View>
              ))}
            </View>
            <AppText colorRole="textSecondary" variant="label">
              {copy.allColorsLabel}
            </AppText>
            <View
              accessibilityLabel={copy.allColorsLabel}
              accessibilityRole="radiogroup"
              style={styles.swatchRow}>
              {colorFamilies
                .filter((family) => !usualColors.includes(family))
                .map((family) => (
                  <ColorSwatch
                    colorFamily={family}
                    disabled={busy}
                    key={family}
                    label={colorLabel(family)}
                    onPress={() => chooseColor(family)}
                    selected={values.colorFamily === family}
                  />
                ))}
            </View>
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

// A named swatch column is the swatch's own 44 plus room for a two-line name.
const NAMED_SWATCH_WIDTH = 72;

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
  errorRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  errorCopy: {
    flex: 1,
  },
  swatchRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  namedSwatch: {
    alignItems: 'center',
    gap: spacing.xs,
    width: NAMED_SWATCH_WIDTH,
  },
  swatchName: {
    textAlign: 'center',
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
