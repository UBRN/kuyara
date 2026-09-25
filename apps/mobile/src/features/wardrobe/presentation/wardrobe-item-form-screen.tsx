import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import {
  AppText,
  Button,
  colorFamilyFills,
  GarmentTileArtwork,
  haptics,
  Icon,
  PhotoPlaceholder,
  Screen,
  Surface,
} from '@/components/ui';
import type { ClothingPreference } from '@/domain/preferences';
import { getGarmentType } from '@/features/catalog/domain/garment-catalog';
import type {
  ColorFamily,
  GarmentTypeId,
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
import {
  showWardrobeConfirmation,
  type WardrobeConfirmation,
} from '@/features/wardrobe/presentation/wardrobe-confirmation';
import { GarmentTypeSheet } from '@/features/wardrobe/presentation/garment-type-sheet';
import { WardrobeOption } from '@/features/wardrobe/presentation/wardrobe-option';
import { useMessages } from '@/localization/use-messages';
import { borderWidths, interaction, layout, radii, spacing, typography } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

type WardrobeItemFormScreenProps = Readonly<{
  mode: 'create' | 'edit';
  item?: WardrobeItem;
  /** Filters the type sheet's catalogue; `null` until the profile resolves one. */
  clothingPreference?: ClothingPreference | null;
  /**
   * Where a new item lands: the Closet list's own segment, so a piece added from Wanted
   * is filed as wanted. An existing item's stored state always wins over it.
   */
  defaultEntryState?: WardrobeEntryState;
  isBusy: boolean;
  confirmation?: WardrobeConfirmation;
  photoPreviewUri?: string | null;
  onDirtyChange: (isDirty: boolean) => void;
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

function FormSectionLabel({
  heading,
  description,
}: Readonly<{ heading: string; description?: string }>) {
  return (
    <View style={styles.sectionLabel}>
      <AppText colorRole="textPrimary" variant="bodyStrong">
        {heading}
      </AppText>
      {description ? (
        <AppText colorRole="textSecondary">{description}</AppText>
      ) : null}
    </View>
  );
}

// The colour family is a colour, so the control shows the colour rather than naming it
// fourteen times. The fills are ADR 0028 section 6's approved content colours, read
// through the one mapper; the enum value is never passed as a colour.
//
// Selection is a 2 point `brandAccent` ring, never a fill: Law 1 allows one accent-filled
// element per viewport and the Save button spends it. The ring is drawn in both states so
// selecting never moves the row, and it doubles as the `borderDefined` boundary Law 4
// requires of an interactive component, which a white swatch on a white surface needs.
// Colour is not the only signal: the selected family's name sits under the row and the
// radio state carries it for assistive technology.
function ColorSwatch({
  colorFamily,
  disabled,
  label,
  onPress,
  selected,
}: Readonly<{
  colorFamily: ColorFamily;
  disabled: boolean;
  label: string;
  onPress: () => void;
  selected: boolean;
}>) {
  const theme = useKuyaraTheme();
  const fill = colorFamilyFills[theme.colorScheme][colorFamily];
  // `multicolor` is the one two-stop family, and it keeps its own treatment rather than
  // borrowing an interface colour (ADR 0029 section 5).
  const secondStop = typeof fill === 'string' ? null : fill[1];

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="radio"
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.swatch,
        {
          backgroundColor: typeof fill === 'string' ? fill : fill[0],
          borderColor: selected
            ? theme.colors.brandAccent
            : theme.colors.borderDefined,
        },
        pressed && !disabled && styles.pressed,
        disabled && styles.disabled,
      ]}
      testID={`wardrobe-color-${colorFamily}`}>
      {secondStop ? (
        <View
          style={[styles.swatchTrailingHalf, { backgroundColor: secondStop }]}
        />
      ) : null}
    </Pressable>
  );
}

export function WardrobeItemFormScreen({
  clothingPreference = null,
  confirmation = showWardrobeConfirmation,
  defaultEntryState = 'owned',
  isBusy,
  item,
  mode,
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
  // Law 7: the row's silhouette and name change in place, so the swap is effects motion
  // on `normal`. `motion.normal` is 0 under Reduce Motion and the row still reads.
  const typeRowOpacity = useSharedValue<number>(1);
  const typeRowStyle = useAnimatedStyle(() => ({ opacity: typeRowOpacity.get() }));
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
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const [typeSheetVisible, setTypeSheetVisible] = useState(false);
  const [photoChange, setPhotoChange] = useState<WardrobePhotoChange>(
    unchangedWardrobePhoto,
  );
  const [unreadablePhotoUri, setUnreadablePhotoUri] = useState<string | null>(null);
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
  const selectedColorLabel = values.colorFamily
    ? messages.catalog[`catalog.color_family.${values.colorFamily}`]
    : copy.colorUnspecified;
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
  const photoTypeLabel = selectedTypeLabel ?? copy.unclassifiedType;

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
      updateValues((current) => selectWardrobeGarmentType(current, typeId));
      setValidationError(false);
      typeRowOpacity.set(0);
      typeRowOpacity.set(withTiming(1, { duration: theme.motion.normal }));
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

  return (
    <>
      <Screen
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        testID={mode === 'create' ? 'wardrobe-create-form' : 'wardrobe-edit-form'}>
        {/* The title and the back control are the route's native large-title header, as
            on the Closet list; `Screen`'s automatic content inset clears it. */}
        <View style={styles.section}>
          <Pressable
            accessibilityHint={copy.typePickerHint}
            accessibilityLabel={copy.typeAccessibilityLabel(
              selectedTypeLabel ?? copy.typeChoosePrompt,
            )}
            accessibilityRole="button"
            accessibilityValue={{
              text: selectedTypeLabel ?? copy.unclassifiedType,
            }}
            disabled={busy}
            onPress={() => setTypeSheetVisible(true)}
            style={({ pressed }) => [
              styles.typePickerRow,
              {
                backgroundColor: theme.colors.surface,
                borderColor: validationError
                  ? theme.colors.dangerInk
                  : theme.colors.borderDefined,
              },
              pressed && !busy && styles.pressed,
              busy && styles.disabled,
            ]}
            testID="wardrobe-type-picker-row">
            {selectedType ? (
              // Law 6 exempts garment artwork from the icon ladder and sizes it from its
              // own drawn bounds; at 20 beside the label the silhouette's drawn box would
              // be about 12 points and unreadable as a garment. The row's leading element
              // is therefore the same small tile the Closet draws, at the row's own 44.
              <Animated.View
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                style={[
                  styles.typePickerTile,
                  typeRowStyle,
                  { backgroundColor: theme.colors.surfaceMuted },
                ]}>
                <GarmentTileArtwork
                  category={selectedType.structuralCategory}
                  colorFamily={null}
                  garmentTypeId={selectedType.typeId}
                  glyphSize={TYPE_ROW_TILE_SIZE * TYPE_ROW_GLYPH_RATIO}
                  height={TYPE_ROW_TILE_SIZE}
                  photoTestID="wardrobe-type-row-photo"
                  photoUri={null}
                  placeholderTestID="wardrobe-type-row-placeholder"
                  silhouetteTestID="wardrobe-type-row-silhouette"
                  width={TYPE_ROW_TILE_SIZE}
                />
              </Animated.View>
            ) : null}
            <View style={styles.typePickerCopy}>
              <AppText colorRole="textPrimary" variant="bodyStrong">
                {copy.typeTitle}
              </AppText>
              <Animated.View style={typeRowStyle}>
                <AppText variant="bodyStrong">
                  {selectedTypeLabel ?? copy.typeChoosePrompt}
                </AppText>
              </Animated.View>
              {selectedTypeLabel ? null : (
                // An instruction beside a filled answer reads as "you are not done", so
                // the hint leaves once the row carries a type.
                <AppText colorRole="textSecondary" variant="caption">
                  {copy.typeDescription}
                </AppText>
              )}
            </View>
            <Icon color={theme.colors.iconSecondary} name="chevronRight" size={20} />
          </Pressable>
          {validationError ? (
            <View style={styles.errorRow}>
              <Icon color={theme.colors.dangerInk} name="error" size={20} />
              <AppText
                accessibilityLiveRegion="assertive"
                accessibilityRole="alert"
                colorRole="dangerInk"
                style={styles.errorCopy}
                testID="wardrobe-type-error">
                {copy.typeRequiredError}
              </AppText>
            </View>
          ) : null}
        </View>

        <View accessibilityRole="radiogroup" style={styles.section}>
          <FormSectionLabel
            description={copy.entryStateDescription}
            heading={copy.entryStateTitle}
          />
          <View style={styles.options}>
            <WardrobeOption
              disabled={busy}
              label={copy.ownedLabel}
              onPress={() => updateEntryState('owned')}
              selected={entryState === 'owned'}
              testID="wardrobe-entry-state-owned"
            />
            <WardrobeOption
              disabled={busy}
              label={copy.wantedLabel}
              onPress={() => updateEntryState('wanted')}
              selected={entryState === 'wanted'}
              testID="wardrobe-entry-state-wanted"
            />
          </View>
        </View>

        <View style={styles.section}>
          <FormSectionLabel description={copy.nameDescription} heading={copy.nameLabel} />
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

        <View style={styles.section}>
          <FormSectionLabel description={copy.photoDescription} heading={copy.photoTitle} />
          {visiblePreviewUri ? (
            <Image
              accessible
              accessibilityLabel={copy.photoAccessibilityLabel(photoTypeLabel)}
              onError={() => setUnreadablePhotoUri(visiblePreviewUri)}
              resizeMode="cover"
              source={{ uri: visiblePreviewUri }}
              style={[
                styles.photoPreview,
                { backgroundColor: theme.colors.surfaceMuted },
              ]}
              testID="wardrobe-photo-preview"
            />
          ) : (
            <PhotoPlaceholder
              borderRadius={radii.card}
              height={140}
              label={copy.photoEmptyBody}
              testID="wardrobe-photo-empty"
              width="100%"
            />
          )}
          <View style={styles.photoActions}>
            <Button
              disabled={isSaving || isDeleting || isBusy}
              label={
                isProcessingPhoto
                  ? copy.photoProcessingLabel
                  : hasPhoto
                    ? copy.changePhotoAction
                    : copy.selectPhotoAction
              }
              icon="photo"
              loading={isProcessingPhoto}
              onPress={selectPhoto}
              testID="wardrobe-photo-select-button"
              variant="tonal"
            />
            {hasPhoto ? (
              <Button
                disabled={busy}
                label={copy.removePhotoAction}
                onPress={removePhoto}
                testID="wardrobe-photo-remove-button"
                variant="plain"
              />
            ) : null}
          </View>
          {photoError ? (
            <View style={styles.errorRow}>
              <Icon color={theme.colors.dangerInk} name="error" size={20} />
              <AppText
                accessibilityLiveRegion="assertive"
                accessibilityRole="alert"
                colorRole="dangerInk"
                style={styles.errorCopy}
                testID="wardrobe-photo-error">
                {copy.photoError}
              </AppText>
            </View>
          ) : null}
        </View>

        <Surface style={styles.detailsCard} variant="muted">
          <Pressable
            accessibilityHint={copy.detailsCaption}
            accessibilityLabel={copy.detailsTitle}
            accessibilityRole="button"
            accessibilityState={{ expanded: detailsExpanded }}
            disabled={busy}
            onPress={() => setDetailsExpanded((expanded) => !expanded)}
            style={({ pressed }) => [
              styles.detailsToggle,
              pressed && !busy && styles.pressed,
              busy && styles.disabled,
            ]}
            testID="wardrobe-details-toggle">
            <View style={styles.detailsCopy}>
              <AppText variant="bodyStrong">{copy.detailsTitle}</AppText>
              <AppText colorRole="textSecondary">{copy.detailsCaption}</AppText>
            </View>
            <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={detailsExpanded ? styles.expandedChevron : undefined}>
              <Icon color={theme.colors.iconSecondary} name="chevronRight" size={20} />
            </View>
          </Pressable>

          {detailsExpanded ? (
            <View style={styles.detailsContent} testID="wardrobe-details-content">
              <View style={styles.detailSection}>
                <FormSectionLabel description={copy.colorDescription} heading={copy.colorTitle} />
                <View accessibilityRole="radiogroup" style={styles.swatchRow}>
                  <Pressable
                    accessibilityLabel={copy.colorUnspecified}
                    accessibilityRole="radio"
                    accessibilityState={{
                      disabled: busy,
                      selected: values.colorFamily === null,
                    }}
                    disabled={busy}
                    onPress={() =>
                      updateValues((current) => ({ ...current, colorFamily: null }))
                    }
                    style={({ pressed }) => [
                      styles.anyColorChip,
                      {
                        backgroundColor: theme.colors.surface,
                        borderColor:
                          values.colorFamily === null
                            ? theme.colors.brandAccent
                            : theme.colors.borderDefined,
                      },
                      pressed && !busy && styles.pressed,
                      busy && styles.disabled,
                    ]}
                    testID="wardrobe-color-unspecified">
                    <AppText variant="label">{copy.colorUnspecified}</AppText>
                  </Pressable>
                  {colorFamilies.map((colorFamily) => (
                    <ColorSwatch
                      colorFamily={colorFamily}
                      disabled={busy}
                      key={colorFamily}
                      label={messages.catalog[`catalog.color_family.${colorFamily}`]}
                      onPress={() =>
                        updateValues((current) => ({ ...current, colorFamily }))
                      }
                      selected={values.colorFamily === colorFamily}
                    />
                  ))}
                </View>
                {/* The swatches already carry their names for assistive technology, so
                    this line is the sighted reader's confirmation only. */}
                <AppText
                  accessibilityElementsHidden
                  colorRole="textSecondary"
                  importantForAccessibility="no-hide-descendants"
                  testID="wardrobe-color-selected"
                  variant="caption">
                  {selectedColorLabel}
                </AppText>
              </View>
            </View>
          ) : null}
        </Surface>

        {saveError ? (
          <View style={styles.errorRow}>
            <Icon color={theme.colors.dangerInk} name="error" size={20} />
            <AppText
              accessibilityLiveRegion="assertive"
              accessibilityRole="alert"
              colorRole="dangerInk"
              style={styles.errorCopy}
              testID="wardrobe-save-error">
              {mode === 'create' ? copy.createError : copy.updateError}
            </AppText>
          </View>
        ) : null}
        <Button
          label={isSaving ? copy.savingLabel : copy.saveAction}
          loading={isSaving}
          disabled={isDeleting || isBusy || isProcessingPhoto}
          onPress={save}
          size="large"
          testID="wardrobe-save-button"
        />

        {mode === 'edit' && onDelete ? (
          <Surface style={styles.deleteSection} variant="muted">
            <FormSectionLabel description={copy.deleteSectionBody} heading={copy.deleteSectionTitle} />
            {deleteError ? (
              <View style={styles.errorRow}>
                <Icon color={theme.colors.dangerInk} name="error" size={20} />
                <AppText
                  accessibilityLiveRegion="assertive"
                  accessibilityRole="alert"
                  colorRole="dangerInk"
                  style={styles.errorCopy}
                  testID="wardrobe-delete-error">
                  {copy.deleteError}
                </AppText>
              </View>
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
      <GarmentTypeSheet
        clothingPreference={clothingPreference}
        onDismiss={() => setTypeSheetVisible(false)}
        onSelect={(typeId) => {
          setTypeSheetVisible(false);
          selectType(typeId);
        }}
        selectedTypeId={values.garmentTypeId}
        visible={typeSheetVisible}
      />
    </>
  );
}

// ADR 0029 section 1's rail ratio, reused rather than invented: a 72-point glyph inside
// a 136-wide tile.
const TYPE_ROW_TILE_SIZE = layout.minimumTouchTarget;
const TYPE_ROW_GLYPH_RATIO = 72 / 136;
// A swatch is its own touch target, so it is drawn at the 44 minimum rather than padded
// up to it.
const SWATCH_SIZE = layout.minimumTouchTarget;

const styles = StyleSheet.create({
  content: {
    gap: spacing.md,
  },
  section: {
    gap: spacing.sm,
  },
  typePickerRow: {
    alignItems: 'center',
    borderRadius: radii.control,
    borderWidth: borderWidths.subtle,
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: layout.minimumTouchTarget,
    padding: spacing.lg,
  },
  typePickerTile: {
    alignItems: 'center',
    borderRadius: radii.control,
    flexShrink: 0,
    height: TYPE_ROW_TILE_SIZE,
    justifyContent: 'center',
    overflow: 'hidden',
    width: TYPE_ROW_TILE_SIZE,
  },
  typePickerCopy: {
    flex: 1,
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
  sectionLabel: {
    gap: spacing.xs,
  },
  options: {
    gap: spacing.sm,
  },
  photoActions: {
    gap: spacing.sm,
  },
  photoPreview: {
    alignSelf: 'stretch',
    borderRadius: radii.card,
    height: 220,
    width: '100%',
  },
  swatchRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  swatch: {
    borderRadius: SWATCH_SIZE / 2,
    borderWidth: borderWidths.strong,
    height: SWATCH_SIZE,
    overflow: 'hidden',
    width: SWATCH_SIZE,
  },
  swatchTrailingHalf: {
    bottom: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    width: '50%',
  },
  anyColorChip: {
    alignItems: 'center',
    borderRadius: SWATCH_SIZE / 2,
    borderWidth: borderWidths.strong,
    justifyContent: 'center',
    // The round swatches beside it are fixed because they hold no text; this one holds a
    // word, so the touch target is a floor and the chip grows with the text size instead
    // of clipping it on Android or spilling over the swatches on iOS.
    minHeight: SWATCH_SIZE,
    paddingHorizontal: spacing.md,
  },
  detailsCard: {
    gap: spacing.md,
    padding: spacing.lg,
  },
  detailsToggle: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: layout.minimumTouchTarget,
  },
  detailsCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  detailsContent: {
    gap: spacing.md,
  },
  detailSection: {
    gap: spacing.sm,
  },
  expandedChevron: {
    transform: [{ rotate: '90deg' }],
  },
  pressed: {
    opacity: interaction.pressedOpacity,
  },
  disabled: {
    opacity: interaction.disabledOpacity,
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
