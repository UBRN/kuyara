import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { AppText, Button, Icon, PhotoPlaceholder, Screen, Surface } from '@/components/ui';
import { getGarmentType } from '@/features/catalog/domain/garment-catalog';
import type {
  CatalogMessageKey,
  GarmentType,
} from '@/features/catalog/domain/garment-taxonomy';
import {
  colorFamilies,
  createWardrobeFormValues,
  hasWardrobeOverrides,
  listSupportedWardrobeOverrides,
  mapWardrobeCreateValues,
  mapWardrobeUpdateValues,
  selectWardrobeGarmentType,
  setWardrobeOverrideValue,
  validateWardrobeForm,
  wardrobeFormValuesEqual,
  type WardrobeFormValues,
  type WardrobeOverrideDefinition,
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
import { WardrobeOption } from '@/features/wardrobe/presentation/wardrobe-option';
import { useMessages } from '@/localization/use-messages';
import { borderWidths, interaction, layout, radii, spacing, typography } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

type WardrobeItemFormScreenProps = Readonly<{
  mode: 'create' | 'edit';
  item?: WardrobeItem;
  garmentTypeSelection?: GarmentType | null;
  isBusy: boolean;
  confirmation?: WardrobeConfirmation;
  photoPreviewUri?: string | null;
  onBackRequested: (isDirty: boolean) => void;
  onDirtyChange: (isDirty: boolean) => void;
  onGarmentTypeSelectionHandled?: () => void;
  onOpenGarmentTypePicker?: (selectedTypeId: string | null) => void;
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

function attributeMessageKey(
  definition: WardrobeOverrideDefinition,
  value: string,
): CatalogMessageKey {
  return `catalog.attribute.${definition.catalogAttribute}.${value}` as CatalogMessageKey;
}

export function WardrobeItemFormScreen({
  confirmation = showWardrobeConfirmation,
  garmentTypeSelection = null,
  isBusy,
  item,
  mode,
  onBackRequested,
  onCreate,
  onDelete,
  onDiscardStagedPhoto = async () => undefined,
  onDirtyChange,
  onGarmentTypeSelectionHandled = () => undefined,
  onOpenGarmentTypePicker = () => undefined,
  onSelectPhoto = async () => {
    throw new Error('Photo selection is unavailable.');
  },
  onUpdate,
  photoPreviewUri = null,
}: WardrobeItemFormScreenProps) {
  const messages = useMessages();
  const copy = messages.wardrobe;
  const theme = useKuyaraTheme();
  const initialValues = useMemo(() => createWardrobeFormValues(item), [item]);
  const initialEntryState = item?.entryState ?? 'owned';
  const [values, setValues] = useState(initialValues);
  const [entryState, setEntryState] = useState<WardrobeEntryState>(
    initialEntryState,
  );
  const [validationError, setValidationError] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [deleteError, setDeleteError] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isProcessingPhoto, setIsProcessingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState(false);
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const [photoChange, setPhotoChange] = useState<WardrobePhotoChange>(
    unchangedWardrobePhoto,
  );
  const [unreadablePhotoUri, setUnreadablePhotoUri] = useState<string | null>(null);
  const operationRef = useRef<Promise<void> | null>(null);
  const mountedRef = useRef(true);
  const stagedPhotoRef = useRef<StagedWardrobePhoto | null>(null);
  const handledGarmentTypeSelectionRef = useRef<GarmentType | null>(null);
  const discardStagedPhotoRef = useRef(onDiscardStagedPhoto);
  const busy = isBusy || isSaving || isDeleting || isProcessingPhoto;
  const photoIsDirty = photoChange.kind !== 'unchanged';
  const isDirty =
    !wardrobeFormValuesEqual(values, initialValues) ||
    entryState !== initialEntryState ||
    photoIsDirty;
  const selectedType = values.garmentTypeId
    ? getGarmentType(values.garmentTypeId)
    : null;
  const selectedTypeLabel = selectedType
    ? messages.catalog[selectedType.nameKey]
    : null;
  const supportedOverrides = listSupportedWardrobeOverrides(
    values.garmentTypeId,
  );
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
    onDirtyChange(
      !wardrobeFormValuesEqual(values, initialValues) ||
        entryState !== initialEntryState ||
        next.kind !== 'unchanged',
    );
    setSaveError(false);
  };

  const updateValues = useCallback((
    updater: (current: WardrobeFormValues) => WardrobeFormValues,
  ) => {
    setValues((current) => {
      const next = updater(current);
      onDirtyChange(
        !wardrobeFormValuesEqual(next, initialValues) ||
          entryState !== initialEntryState ||
          photoChange.kind !== 'unchanged',
      );
      return next;
    });
    setSaveError(false);
  }, [entryState, initialEntryState, initialValues, onDirtyChange, photoChange.kind]);

  const updateEntryState = (next: WardrobeEntryState) => {
    setEntryState(next);
    onDirtyChange(
      !wardrobeFormValuesEqual(values, initialValues) ||
        next !== initialEntryState ||
        photoChange.kind !== 'unchanged',
    );
    setSaveError(false);
  };

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

  const selectType = useCallback((garmentType: GarmentType) => {
    if (garmentType.typeId === values.garmentTypeId || busy) {
      return;
    }

    const applySelection = () => {
      updateValues((current) =>
        selectWardrobeGarmentType(current, garmentType.typeId),
      );
      setValidationError(false);
    };

    if (values.garmentTypeId && hasWardrobeOverrides(values)) {
      confirmation(
        {
          title: copy.typeChangeTitle,
          message: copy.typeChangeBody,
          cancelLabel: copy.keepTypeAction,
          confirmLabel: copy.changeTypeAction,
        },
        applySelection,
      );
      return;
    }

    applySelection();
  }, [busy, confirmation, copy, updateValues, values]);

  useEffect(() => {
    if (!garmentTypeSelection) {
      handledGarmentTypeSelectionRef.current = null;
      return;
    }
    if (handledGarmentTypeSelectionRef.current === garmentTypeSelection) {
      return;
    }

    handledGarmentTypeSelectionRef.current = garmentTypeSelection;
    selectType(garmentTypeSelection);
    onGarmentTypeSelectionHandled();
  }, [garmentTypeSelection, onGarmentTypeSelectionHandled, selectType]);

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
    <Screen
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      testID={mode === 'create' ? 'wardrobe-create-form' : 'wardrobe-edit-form'}>
      <View style={styles.header}>
        <Button
          disabled={busy}
          label={copy.backAction}
          onPress={() => onBackRequested(isDirty)}
          style={styles.headerBackButton}
          variant="quiet"
        />
        <AppText
          accessibilityRole="header"
          style={styles.headerTitle}
          variant="titleLarge">
          {mode === 'create' ? copy.newTitle : copy.editTitle}
        </AppText>
      </View>

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
          onPress={() => onOpenGarmentTypePicker(values.garmentTypeId)}
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
          <View style={styles.typePickerCopy}>
            <AppText colorRole="textPrimary" variant="bodyStrong">
              {copy.typeTitle}
            </AppText>
            <AppText variant="bodyStrong">
              {selectedTypeLabel ?? copy.typeChoosePrompt}
            </AppText>
            <AppText colorRole="textSecondary" variant="caption">
              {copy.typeDescription}
            </AppText>
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
            loading={isProcessingPhoto}
            onPress={selectPhoto}
            testID="wardrobe-photo-select-button"
            variant="secondary"
          />
          {hasPhoto ? (
            <Button
              disabled={busy}
              label={copy.removePhotoAction}
              onPress={removePhoto}
              testID="wardrobe-photo-remove-button"
              variant="quiet"
            />
          ) : null}
        </View>
        {photoError ? (
          <AppText
            accessibilityLiveRegion="assertive"
            accessibilityRole="alert"
            testID="wardrobe-photo-error">
            {copy.photoError}
          </AppText>
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
            <View accessibilityRole="radiogroup" style={styles.detailSection}>
              <FormSectionLabel description={copy.colorDescription} heading={copy.colorTitle} />
              <View style={styles.options}>
                <WardrobeOption
                  disabled={busy}
                  label={copy.colorUnspecified}
                  onPress={() =>
                    updateValues((current) => ({ ...current, colorFamily: null }))
                  }
                  selected={values.colorFamily === null}
                  testID="wardrobe-color-unspecified"
                />
                {colorFamilies.map((colorFamily) => (
                  <WardrobeOption
                    disabled={busy}
                    key={colorFamily}
                    label={messages.catalog[`catalog.color_family.${colorFamily}`]}
                    onPress={() =>
                      updateValues((current) => ({ ...current, colorFamily }))
                    }
                    selected={values.colorFamily === colorFamily}
                    testID={`wardrobe-color-${colorFamily}`}
                  />
                ))}
              </View>
            </View>

            {selectedType && supportedOverrides.length > 0 ? (
              <View style={styles.detailSection} testID="wardrobe-attributes">
                <FormSectionLabel description={copy.attributesDescription} heading={copy.attributesTitle} />
                {supportedOverrides.map((definition) => {
                  const defaultValue = selectedType[definition.defaultField];
                  if (typeof defaultValue !== 'string') {
                    return null;
                  }
                  return (
                    <View
                      accessibilityRole="radiogroup"
                      key={definition.field}
                      style={styles.attributeGroup}
                      testID={`wardrobe-attribute-${definition.field}`}>
                      <AppText accessibilityRole="header" variant="bodyStrong">
                        {copy.attributeLabels[definition.field]}
                      </AppText>
                      <WardrobeOption
                        disabled={busy}
                        label={copy.attributeDefault(
                          messages.catalog[
                            attributeMessageKey(definition, defaultValue)
                          ],
                        )}
                        onPress={() =>
                          updateValues((current) =>
                            setWardrobeOverrideValue(current, definition.field, null),
                          )
                        }
                        selected={values[definition.field] === null}
                        testID={`wardrobe-${definition.field}-default`}
                      />
                      {definition.values.map((value) => (
                        <WardrobeOption
                          disabled={busy}
                          key={value}
                          label={messages.catalog[attributeMessageKey(definition, value)]}
                          onPress={() =>
                            updateValues((current) =>
                              setWardrobeOverrideValue(
                                current,
                                definition.field,
                                value,
                              ),
                            )
                          }
                          selected={values[definition.field] === value}
                          testID={`wardrobe-${definition.field}-${value}`}
                        />
                      ))}
                    </View>
                  );
                })}
              </View>
            ) : null}
          </View>
        ) : null}
      </Surface>

      {saveError ? (
        <AppText
          accessibilityLiveRegion="assertive"
          accessibilityRole="alert"
          testID="wardrobe-save-error">
          {mode === 'create' ? copy.createError : copy.updateError}
        </AppText>
      ) : null}
      <Button
        label={isSaving ? copy.savingLabel : copy.saveAction}
        loading={isSaving}
        disabled={isDeleting || isBusy || isProcessingPhoto}
        onPress={save}
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
            label={isDeleting ? copy.deletingLabel : copy.deleteAction}
            loading={isDeleting}
            onPress={requestDelete}
            testID="wardrobe-delete-button"
            variant="destructive"
          />
        </Surface>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.md,
    paddingBottom: spacing['2xl'],
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
  },
  headerBackButton: {
    flexShrink: 0,
  },
  headerTitle: {
    flex: 1,
    flexShrink: 1,
    textAlign: 'center',
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
  attributeGroup: {
    gap: spacing.sm,
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
