import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { AppText, Entrance, NativeSheet } from '@/components/ui';
import type { ClothingPreference } from '@/domain/preferences';
import {
  garmentCatalog,
  getGarmentType,
  listGarmentTypesForPreference,
} from '@/features/catalog/domain/garment-catalog';
import {
  structuralCategories,
  type GarmentTypeId,
  type StructuralCategory,
} from '@/features/catalog/domain/garment-taxonomy';
import { GarmentTypeTile } from '@/features/wardrobe/presentation/garment-type-tile';
import { WardrobeCategoryChip } from '@/features/wardrobe/presentation/wardrobe-category-chip';
import { useMessages } from '@/localization/use-messages';
import { spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

// The Drawer: the Closet form's type row opens this over the form instead of pushing a
// screen, so the row being filled stays visible and the platform gives VoiceOver the
// modal semantics for free. Two columns, because a picture has to be recognisable: the
// catalogue shares one drawing across five pairs of types (blouse and shirt, coat and
// trench, the two boots), so the name line under each tile is not optional.
//
// The category control is the Closet's own chip rail rather than a segmented control:
// six segments do not fit 361 points in either language, and a native segmented control
// cannot drop a segment per state, which is what `mens` needs because it has no
// one-piece category at all. ADR 0029 section 2 already rejected one for the same reason.
const COLUMNS = 2;

export type GarmentTypeSheetProps = Readonly<{
  /** `null` while the profile has not resolved one; the whole catalogue is then listed. */
  clothingPreference: ClothingPreference | null;
  onDismiss: () => void;
  onSelect: (typeId: GarmentTypeId) => void;
  selectedTypeId: GarmentTypeId | null;
  visible: boolean;
}>;

export function GarmentTypeSheet({
  clothingPreference,
  onDismiss,
  onSelect,
  selectedTypeId,
  visible,
}: GarmentTypeSheetProps) {
  const messages = useMessages();
  const theme = useKuyaraTheme();
  const { width } = useWindowDimensions();
  const [category, setCategory] = useState<StructuralCategory | null>(null);
  const gridOpacity = useSharedValue<number>(1);
  const gridStyle = useAnimatedStyle(() => ({ opacity: gridOpacity.get() }));

  // Deprecated catalogue entries stay readable on saved items but are never offered
  // again, so the picker lists active types only.
  const selectableTypes = useMemo(() => {
    const applicable = clothingPreference
      ? new Set(
          listGarmentTypesForPreference(clothingPreference).map(({ typeId }) => typeId),
        )
      : null;
    return garmentCatalog.garmentTypes.filter(
      (garmentType) =>
        garmentType.status === 'active' &&
        (applicable === null || applicable.has(garmentType.typeId)),
    );
  }, [clothingPreference]);

  const categories = useMemo(
    () =>
      structuralCategories.filter((structuralCategory) =>
        selectableTypes.some((type) => type.structuralCategory === structuralCategory),
      ),
    [selectableTypes],
  );

  const selectedType = selectedTypeId ? getGarmentType(selectedTypeId) : null;
  // No stored default: the sheet opens on the selected type's own category, and on the
  // first category when nothing is selected yet.
  const activeCategory =
    category ?? selectedType?.structuralCategory ?? categories[0] ?? null;
  const visibleTypes = selectableTypes.filter(
    (garmentType) => garmentType.structuralCategory === activeCategory,
  );
  const tileSize = Math.floor(
    (width - spacing.lg * 2 - spacing.md * (COLUMNS - 1)) / COLUMNS,
  );

  const dismiss = () => {
    setCategory(null);
    onDismiss();
  };

  // Law 7: a filter change is effects motion on `normal`, never a slide. The chip's own
  // fill changes with no animation, so motion is never the only signal, and under Reduce
  // Motion `motion.normal` is 0 and the grid swaps instantly.
  const changeCategory = (next: StructuralCategory) => {
    if (next === activeCategory) return;
    setCategory(next);
    gridOpacity.set(0);
    gridOpacity.set(withTiming(1, { duration: theme.motion.normal }));
  };

  return (
    <NativeSheet
      onDismiss={dismiss}
      testID="wardrobe-garment-type-picker"
      visible={visible}>
      <View style={styles.sheet}>
        <AppText accessibilityRole="header" style={styles.inset} variant="title">
          {messages.wardrobe.typeTitle}
        </AppText>
        <ScrollView
          accessibilityRole="radiogroup"
          contentContainerStyle={[styles.inset, styles.rail]}
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.railScroller}>
          {categories.map((structuralCategory) => (
            <WardrobeCategoryChip
              key={structuralCategory}
              label={messages.wardrobe.categoryFilterLabels[structuralCategory]}
              onPress={() => changeCategory(structuralCategory)}
              selected={structuralCategory === activeCategory}
              testID={`wardrobe-type-category-${structuralCategory}`}
            />
          ))}
        </ScrollView>
        <ScrollView
          contentContainerStyle={[styles.inset, styles.gridContent]}
          style={styles.gridScroller}>
          <Animated.View
            accessibilityLabel={
              activeCategory
                ? messages.wardrobe.categoryFilterLabels[activeCategory]
                : undefined
            }
            accessibilityRole="radiogroup"
            style={[styles.grid, gridStyle]}>
            {visibleTypes.map((garmentType, index) => (
              <Entrance index={index} key={garmentType.typeId}>
                <GarmentTypeTile
                  garmentType={garmentType}
                  label={messages.catalog[garmentType.nameKey]}
                  onPress={() => onSelect(garmentType.typeId)}
                  selected={garmentType.typeId === selectedTypeId}
                  size={tileSize}
                />
              </Entrance>
            ))}
          </Animated.View>
        </ScrollView>
      </View>
    </NativeSheet>
  );
}

const styles = StyleSheet.create({
  sheet: {
    // Law 2: `md` 12 between groups, and the same step above the title so the sheet's
    // own grabber zone is not read as part of the heading.
    flex: 1,
    gap: spacing.md,
    paddingTop: spacing.md,
  },
  // Law 2: `lg` 16 is the container inset. It sits on each band rather than on the sheet
  // so the chip rail bleeds its last chip off the edge instead of ending inside a margin.
  inset: {
    paddingHorizontal: spacing.lg,
  },
  // A ScrollView grows by default; left to that, the rail would take half the sheet and
  // float its chips in the middle of it.
  railScroller: {
    flexGrow: 0,
  },
  rail: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  // The grid takes the rest of the sheet and scrolls inside it; without an explicit
  // flex the scroller sizes to its content and overflows the detent instead.
  gridScroller: {
    flex: 1,
  },
  gridContent: {
    paddingBottom: spacing['2xl'],
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
});
