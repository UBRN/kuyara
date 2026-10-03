import { useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import {
  AppText,
  Button,
  fadeTo,
  GarmentDrawing,
  garmentUsualColorFamilies,
  PressScale,
  useTextScaling,
} from '@/components/ui';
import type { ClothingPreference } from '@/domain/preferences';
import {
  getGarmentType,
  listSelectableGarmentTypes,
  listStructuralCategoriesForPreference,
} from '@/features/catalog/domain/garment-catalog';
import {
  type ColorFamily,
  type GarmentTypeId,
  type StructuralCategory,
} from '@/features/catalog/domain/garment-taxonomy';
import { GarmentTypeTile } from '@/features/wardrobe/presentation/garment-type-tile';
import { WardrobeCategoryChip } from '@/features/wardrobe/presentation/wardrobe-category-chip';
import { CATEGORY_REPRESENTATIVE_TYPE } from '@/features/wardrobe/presentation/category-representative-type';
import { useMessages } from '@/localization/use-messages';
import { layout, radii, spacing } from '@/theme/theme';
import { OnPlate, PlateView } from '@/theme/plate-theme';
import { useKuyaraTheme } from '@/theme/theme-context';

// O10, "What is it?": the type is chosen inline, in two levels, instead of in a sheet over
// the form. Six illustrated category tiles first; a tap turns them into the Closet's chip
// rail over a grid of that category's types, each drawn in its own most natural colour and
// named, because the catalogue shares one drawing across five pairs of types. A chosen
// type collapses the picker to one row with "Change", drawn at once in the grid's place, and
// "Change" fades that row out, then fades the grid back in (Law 7). The catalogue type stays required
// and no free-form type exists (docs/product-decisions.md, Closet).

// Each category tile shows its representative piece in one colour. Illustration only: the
// record never takes this colour.
const CATEGORY_ARTWORK_COLOR: Readonly<Record<StructuralCategory, ColorFamily>> = {
  top: 'blue',
  bottom: 'blue',
  one_piece: 'orange',
  outerwear: 'brown',
  footwear: 'white',
  accessory: 'yellow',
};
const CATEGORY_DRAWING_SIZE = 56;
const ROW_TILE_SIZE = 64;

export type GarmentTypePickerProps = Readonly<{
  /** `null` while the profile has not resolved one; the whole catalogue is then listed. */
  clothingPreference: ClothingPreference | null;
  /** The category to open on when nothing is selected yet (O9: the Closet's category). */
  initialCategory?: StructuralCategory;
  selectedTypeId: GarmentTypeId | null;
  /** The chosen colour, so the collapsed row draws the piece as the preview does. */
  colorFamily: ColorFamily | null;
  disabled: boolean;
  onSelect: (typeId: GarmentTypeId) => void;
  /** The grid opens ("Change") or closes on a pick, so the form can hold what follows it. */
  onExpandedChange?: (expanded: boolean) => void;
}>;

export function GarmentTypePicker({
  clothingPreference,
  colorFamily,
  disabled,
  initialCategory,
  onExpandedChange,
  onSelect,
  selectedTypeId,
}: GarmentTypePickerProps) {
  const messages = useMessages();
  const copy = messages.wardrobe;
  const theme = useKuyaraTheme();
  const { width } = useWindowDimensions();
  const { usesTwoColumnGrid } = useTextScaling();
  const selectedType = selectedTypeId ? getGarmentType(selectedTypeId) : null;
  const [expanded, setExpanded] = useState(selectedType === null);
  const [category, setCategory] = useState<StructuralCategory | null>(null);
  const gridOpacity = useSharedValue<number>(1);
  const gridStyle = useAnimatedStyle(() => ({ opacity: gridOpacity.get() }));
  // The grid reopened by "Change" starts its fade once it is laid out, so the time it takes
  // to mount is not spent from the fade.
  const gridFadePending = useRef(false);
  const rowOpacity = useSharedValue<number>(1);
  const rowStyle = useAnimatedStyle(() => ({ opacity: rowOpacity.get() }));

  const selectableTypes = useMemo(
    () => listSelectableGarmentTypes(clothingPreference),
    [clothingPreference],
  );
  const categories = useMemo(
    () => listStructuralCategoriesForPreference(clothingPreference),
    [clothingPreference],
  );
  // No stored default: the grid opens on the category tapped, else the selected type's
  // own, else the Closet category the add started from; with none, the tiles show.
  const activeCategory =
    category
    ?? selectedType?.structuralCategory
    ?? (initialCategory && categories.includes(initialCategory) ? initialCategory : null);
  const visibleTypes = selectableTypes.filter(
    (garmentType) => garmentType.structuralCategory === activeCategory,
  );
  const columns = usesTwoColumnGrid ? 2 : 3;
  const contentWidth = Math.min(width, layout.maxContentWidth) - spacing.lg * 2;
  const tileSize = Math.floor((contentWidth - spacing.md * (columns - 1)) / columns);

  // Law 7: a filter change, and the grid reopening on "Change", is effects motion on
  // `normal`, never a slide. The chip's own fill changes with no animation, so motion is
  // never the only signal.
  const fadeGridIn = () => {
    gridOpacity.set(0);
    gridOpacity.set(fadeTo(1, theme.motion.normal, theme.motion));
  };
  const changeCategory = (next: StructuralCategory) => {
    if (next === activeCategory) return;
    setCategory(next);
    fadeGridIn();
  };

  const openGrid = () => {
    setCategory(null);
    setExpanded(true);
    gridOpacity.set(0);
    gridFadePending.current = true;
  };

  if (selectedType && !expanded) {
    return (
      <Animated.View style={[styles.row, rowStyle]} testID="wardrobe-type-row">
        <PlateView
          accessibilityElementsHidden
          color={theme.colors.garmentTile}
          importantForAccessibility="no-hide-descendants"
          style={styles.rowTile}>
          <GarmentDrawing
            category={selectedType.structuralCategory}
            colorFamily={colorFamily}
            garmentTypeId={selectedType.typeId}
            size={ROW_TILE_SIZE - spacing.md * 2}
            testID="wardrobe-type-row-drawing"
          />
        </PlateView>
        <View style={styles.rowCopy}>
          <AppText testID="wardrobe-type-row-name" variant="bodyStrong">
            {messages.catalog[selectedType.nameKey]}
          </AppText>
          <AppText colorRole="textSecondary" variant="caption">
            {messages.catalog[`catalog.attribute.structural_category.${selectedType.structuralCategory}`]}
          </AppText>
        </View>
        <Button
          accessibilityHint={copy.typeChangeHint}
          disabled={disabled}
          label={copy.typeChangeAction}
          onPress={() => {
            // The row and the colour section under it fade out together on `fast` before
            // the taller grid takes the row's place, so neither is cut or pushed away
            // while still drawn.
            onExpandedChange?.(true);
            rowOpacity.set(fadeTo(0, theme.motion.fast, theme.motion, (finished) => {
              'worklet';
              if (finished) scheduleOnRN(openGrid);
            }));
          }}
          size="small"
          testID="wardrobe-type-change-button"
          variant="plain"
        />
      </Animated.View>
    );
  }

  const select = (typeId: GarmentTypeId) => {
    if (disabled) return;
    rowOpacity.set(1);
    setExpanded(false);
    onExpandedChange?.(false);
    onSelect(typeId);
  };

  if (activeCategory === null) {
    return (
      <View style={styles.grid} testID="wardrobe-type-categories">
        {categories.map((structuralCategory) => {
          const artworkTypeId = CATEGORY_REPRESENTATIVE_TYPE[structuralCategory];
          const artworkColor = CATEGORY_ARTWORK_COLOR[structuralCategory];
          const label = copy.categoryFilterLabels[structuralCategory];
          return (
            <PressScale
              accessibilityLabel={label}
              accessibilityRole="button"
              accessibilityState={{ disabled }}
              disabled={disabled}
              key={structuralCategory}
              onPress={() => changeCategory(structuralCategory)}
              style={[
                styles.categoryTile,
                { backgroundColor: theme.colors.garmentTile, width: tileSize },
              ]}
              testID={`wardrobe-type-category-tile-${structuralCategory}`}>
              <OnPlate color={theme.colors.garmentTile}>
                <GarmentDrawing
                  category={structuralCategory}
                  colorFamily={artworkColor}
                  garmentTypeId={artworkTypeId}
                  size={CATEGORY_DRAWING_SIZE}
                  testID={`wardrobe-type-category-drawing-${structuralCategory}`}
                />
                <AppText numberOfLines={2} style={styles.centeredText} variant="label">
                  {label}
                </AppText>
              </OnPlate>
            </PressScale>
          );
        })}
      </View>
    );
  }

  return (
    <View style={styles.browse}>
      {/* The rail is scope, not the value being chosen: the radio group is the type grid
          below it (ADR 0029 section 2). The chips keep their own radio semantics. */}
      <ScrollView
        contentContainerStyle={styles.rail}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.railBleed}>
        {categories.map((structuralCategory) => (
          <WardrobeCategoryChip
            category={structuralCategory}
            key={structuralCategory}
            label={copy.categoryFilterLabels[structuralCategory]}
            onPress={() => changeCategory(structuralCategory)}
            selected={structuralCategory === activeCategory}
            testID={`wardrobe-type-category-${structuralCategory}`}
          />
        ))}
      </ScrollView>
      <Animated.View
        accessibilityLabel={copy.categoryFilterLabels[activeCategory]}
        accessibilityRole="radiogroup"
        onLayout={() => {
          if (!gridFadePending.current) return;
          gridFadePending.current = false;
          fadeGridIn();
        }}
        style={[styles.grid, gridStyle]}
        testID="wardrobe-type-grid">
        {visibleTypes.map((garmentType) => (
          <GarmentTypeTile
            colorFamily={garmentUsualColorFamilies(garmentType.typeId)[0] ?? null}
            disabled={disabled}
            garmentType={garmentType}
            key={garmentType.typeId}
            label={messages.catalog[garmentType.nameKey]}
            onPress={() => select(garmentType.typeId)}
            selected={garmentType.typeId === selectedTypeId}
            size={tileSize}
          />
        ))}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
  },
  rowTile: {
    alignItems: 'center',
    borderRadius: radii.imageTile,
    height: ROW_TILE_SIZE,
    justifyContent: 'center',
    width: ROW_TILE_SIZE,
  },
  rowCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  browse: {
    gap: spacing.md,
  },
  // The rail bleeds off the screen edge, so more categories visibly exist.
  railBleed: {
    flexGrow: 0,
    marginHorizontal: -spacing.lg,
  },
  rail: {
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    // The chips' 2 point hit slop stays inside the scroll view.
    paddingVertical: 2,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  categoryTile: {
    alignItems: 'center',
    borderRadius: radii.imageTile,
    gap: spacing.sm,
    justifyContent: 'center',
    minHeight: 112,
    padding: spacing.md,
  },
  centeredText: {
    textAlign: 'center',
  },
});
