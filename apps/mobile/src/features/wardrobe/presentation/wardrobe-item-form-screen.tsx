import { useMemo, useRef, useState } from 'react';
import {
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { AppText, Button, Screen, SectionHeader, Surface } from '@/components/ui';
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
import type { WardrobeItem } from '@/features/wardrobe/domain/wardrobe-item';
import {
  showWardrobeConfirmation,
  type WardrobeConfirmation,
} from '@/features/wardrobe/presentation/wardrobe-confirmation';
import { WardrobeOption } from '@/features/wardrobe/presentation/wardrobe-option';
import { useMessages } from '@/localization/use-messages';
import { borderWidths, radii, spacing, typography } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

type WardrobeItemFormScreenProps = Readonly<{
  mode: 'create' | 'edit';
  item?: WardrobeItem;
  garmentTypes: readonly GarmentType[];
  isBusy: boolean;
  confirmation?: WardrobeConfirmation;
  onBackRequested: (isDirty: boolean) => void;
  onDirtyChange: (isDirty: boolean) => void;
  onCreate: (
    input: NonNullable<ReturnType<typeof mapWardrobeCreateValues>>,
  ) => Promise<void>;
  onUpdate?: (
    input: NonNullable<ReturnType<typeof mapWardrobeUpdateValues>>,
  ) => Promise<void>;
  onDelete?: () => Promise<void>;
}>;

function attributeMessageKey(
  definition: WardrobeOverrideDefinition,
  value: string,
): CatalogMessageKey {
  return `catalog.attribute.${definition.catalogAttribute}.${value}` as CatalogMessageKey;
}

export function WardrobeItemFormScreen({
  confirmation = showWardrobeConfirmation,
  garmentTypes,
  isBusy,
  item,
  mode,
  onBackRequested,
  onCreate,
  onDelete,
  onDirtyChange,
  onUpdate,
}: WardrobeItemFormScreenProps) {
  const messages = useMessages();
  const copy = messages.wardrobe;
  const theme = useKuyaraTheme();
  const initialValues = useMemo(() => createWardrobeFormValues(item), [item]);
  const [values, setValues] = useState(initialValues);
  const [validationError, setValidationError] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [deleteError, setDeleteError] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const operationRef = useRef<Promise<void> | null>(null);
  const busy = isBusy || isSaving || isDeleting;
  const isDirty = !wardrobeFormValuesEqual(values, initialValues);
  const selectedType = values.garmentTypeId
    ? getGarmentType(values.garmentTypeId)
    : null;
  const supportedOverrides = listSupportedWardrobeOverrides(
    values.garmentTypeId,
  );

  const updateValues = (
    updater: (current: WardrobeFormValues) => WardrobeFormValues,
  ) => {
    setValues((current) => {
      const next = updater(current);
      onDirtyChange(!wardrobeFormValuesEqual(next, initialValues));
      return next;
    });
    setSaveError(false);
  };

  const selectType = (garmentType: GarmentType) => {
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
            ? onCreate(payload)
            : Promise.reject(new Error('The form is invalid.'));
        })()
      : (() => {
          const payload = mapWardrobeUpdateValues(values);
          return payload && onUpdate
            ? onUpdate(payload)
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
          label={copy.backAction}
          onPress={() => onBackRequested(isDirty)}
          variant="quiet"
        />
        <AppText accessibilityRole="header" variant="titleLarge">
          {mode === 'create' ? copy.newTitle : copy.editTitle}
        </AppText>
      </View>

      <View style={styles.section}>
        <SectionHeader
          title={copy.nameLabel}
          supportingText={copy.nameDescription}
        />
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
              borderColor: theme.colors.borderSubtle,
              color: theme.colors.textPrimary,
            },
          ]}
          testID="wardrobe-name-input"
          value={values.name}
        />
      </View>

      <View accessibilityRole="radiogroup" style={styles.section}>
        <SectionHeader
          title={copy.typeTitle}
          supportingText={copy.typeDescription}
        />
        <View style={styles.options}>
          {garmentTypes.map((garmentType) => (
            <WardrobeOption
              disabled={busy}
              key={garmentType.typeId}
              label={messages.catalog[garmentType.nameKey]}
              onPress={() => selectType(garmentType)}
              selected={values.garmentTypeId === garmentType.typeId}
              testID={`wardrobe-type-${garmentType.typeId}`}
            />
          ))}
        </View>
        {validationError ? (
          <AppText
            accessibilityLiveRegion="assertive"
            accessibilityRole="alert"
            testID="wardrobe-type-error">
            {copy.typeRequiredError}
          </AppText>
        ) : null}
      </View>

      <View accessibilityRole="radiogroup" style={styles.section}>
        <SectionHeader
          title={copy.colorTitle}
          supportingText={copy.colorDescription}
        />
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
        <View style={styles.section} testID="wardrobe-attributes">
          <SectionHeader
            title={copy.attributesTitle}
            supportingText={copy.attributesDescription}
          />
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
        disabled={isDeleting || isBusy}
        onPress={save}
        testID="wardrobe-save-button"
      />

      {mode === 'edit' && onDelete ? (
        <Surface style={styles.deleteSection} variant="muted">
          <SectionHeader
            title={copy.deleteSectionTitle}
            supportingText={copy.deleteSectionBody}
          />
          {deleteError ? (
            <AppText
              accessibilityLiveRegion="assertive"
              accessibilityRole="alert"
              testID="wardrobe-delete-error">
              {copy.deleteError}
            </AppText>
          ) : null}
          <Button
            accessibilityHint={copy.deleteSectionBody}
            disabled={isSaving || isBusy}
            label={isDeleting ? copy.deletingLabel : copy.deleteAction}
            loading={isDeleting}
            onPress={requestDelete}
            testID="wardrobe-delete-button"
            variant="secondary"
          />
        </Surface>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing['2xl'],
    paddingBottom: spacing['2xl'],
    paddingTop: spacing.lg,
  },
  header: {
    alignItems: 'flex-start',
    gap: spacing.lg,
  },
  section: {
    gap: spacing.lg,
  },
  options: {
    gap: spacing.md,
  },
  attributeGroup: {
    gap: spacing.md,
  },
  textInput: {
    borderRadius: radii.control,
    borderWidth: borderWidths.strong,
    fontSize: typography.body.fontSize,
    minHeight: 52,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  deleteSection: {
    gap: spacing.lg,
    padding: spacing.lg,
  },
});
