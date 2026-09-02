import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText, GarmentSlotGlyph, Icon, IconButton, Screen, Surface } from '@/components/ui';
import type { ClothingPreference } from '@/domain/preferences';
import { listGarmentTypesForPreference } from '@/features/catalog/domain/garment-catalog';
import {
  structuralCategories,
  type CatalogMessageKey,
  type GarmentType,
} from '@/features/catalog/domain/garment-taxonomy';
import { WardrobeOption } from '@/features/wardrobe/presentation/wardrobe-option';
import { useMessages } from '@/localization/use-messages';
import { layout, radii, spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

type GarmentTypePickerScreenProps = Readonly<{
  clothingPreference: ClothingPreference;
  garmentTypes: readonly GarmentType[];
  onBack: () => void;
  onSelect: (typeId: string) => void;
  selectedTypeId: string | null;
}>;

export function GarmentTypePickerScreen({
  clothingPreference,
  garmentTypes,
  onBack,
  onSelect,
  selectedTypeId,
}: GarmentTypePickerScreenProps) {
  const messages = useMessages();
  const theme = useKuyaraTheme();
  const [headerHeight, setHeaderHeight] = useState(0);
  const applicableTypeIds = new Set(
    listGarmentTypesForPreference(clothingPreference).map(({ typeId }) => typeId),
  );

  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
      <SafeAreaView
        edges={['top']}
        onLayout={(event) => setHeaderHeight(event.nativeEvent.layout.height)}
        style={[
          styles.header,
          { backgroundColor: theme.colors.surface },
          theme.elevation.chrome,
        ]}>
        <View style={styles.headerContent}>
          <IconButton
            accessibilityLabel={messages.common.back}
            hitSlop={7}
            icon={(color) => <Icon color={color} name="chevronLeft" size={20} />}
            onPress={onBack}
          />
          <AppText accessibilityRole="header" style={styles.headerTitle} variant="titleLarge">
            {messages.wardrobe.typeTitle}
          </AppText>
        </View>
      </SafeAreaView>

      <Screen
        contentContainerStyle={styles.content}
        contentTopClearance={headerHeight + spacing.lg}
        testID="wardrobe-garment-type-picker">
        {structuralCategories.map((category) => {
          const categoryTypes = garmentTypes.filter(
            (garmentType) =>
              garmentType.structuralCategory === category &&
              applicableTypeIds.has(garmentType.typeId),
          );
          if (categoryTypes.length === 0) {
            return null;
          }

          const categoryKey: CatalogMessageKey =
            `catalog.attribute.structural_category.${category}`;
          const categoryLabel = messages.catalog[categoryKey];

          return (
            <View key={category} style={styles.section}>
              <AppText accessibilityRole="header" variant="eyebrow">
                {categoryLabel}
              </AppText>
              <Surface style={styles.groupCard}>
                <View
                  accessibilityLabel={categoryLabel}
                  accessibilityRole="radiogroup"
                  style={styles.options}>
                  {categoryTypes.map((garmentType) => (
                    <WardrobeOption
                      key={garmentType.typeId}
                      label={messages.catalog[garmentType.nameKey]}
                      leading={
                        <GarmentSlotGlyph
                          category={garmentType.structuralCategory}
                          color={
                            selectedTypeId === garmentType.typeId
                              ? theme.colors.textOnBrand
                              : theme.colors.iconSecondary
                          }
                          size={22}
                        />
                      }
                      onPress={() => onSelect(garmentType.typeId)}
                      selected={selectedTypeId === garmentType.typeId}
                      testID={`wardrobe-type-${garmentType.typeId}`}
                    />
                  ))}
                </View>
              </Surface>
            </View>
          );
        })}
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  header: {
    borderBottomLeftRadius: radii.card,
    borderBottomRightRadius: radii.card,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: 1,
  },
  headerContent: {
    alignItems: 'center',
    alignSelf: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    maxWidth: layout.maxContentWidth,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    width: '100%',
  },
  headerTitle: {
    flex: 1,
  },
  content: {
    gap: spacing.md,
    paddingBottom: spacing.lg,
  },
  section: {
    gap: spacing.sm,
  },
  groupCard: {
    padding: spacing.lg,
  },
  options: {
    gap: spacing.md,
  },
});
