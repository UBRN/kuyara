import { StyleSheet, View } from 'react-native';

import {
  AppText,
  GarmentTileArtwork,
  Icon,
  PressScale,
  useTextScaling,
} from '@/components/ui';
import type { GarmentType } from '@/features/catalog/domain/garment-taxonomy';
import { borderWidths, spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

// The Drawer's tile. It draws the same picture the Closet grid draws for the same
// object, so the piece a user picks here is the piece they keep seeing, and it reuses
// the Closet tile's geometry rather than inventing a second one: ADR 0029 section 2
// fixes an image tile's radius at 14, and section 1 sizes the glyph rung at 72 inside a
// 136-wide tile.
//
// Selection is a `brandAccent` ring plus a filled check, never an accent fill: the chip
// rail above already spends the viewport's single accent fill (Law 1). The ring is drawn
// in both states, transparent when unselected, so selecting a tile never moves the grid.
const TILE_RADIUS = 14;
const GLYPH_SIZE_RATIO = 72 / 136;
// Law 6's ladder: 20 beside `label`/`body` text.
const SELECTED_MARK_SIZE = 20;

export type GarmentTypeTileProps = Readonly<{
  garmentType: GarmentType;
  label: string;
  onPress: () => void;
  selected: boolean;
  /** The tile's square side; the grid owns the column arithmetic. */
  size: number;
}>;

export function GarmentTypeTile({
  garmentType,
  label,
  onPress,
  selected,
  size,
}: GarmentTypeTileProps) {
  const theme = useKuyaraTheme();
  // A long Turkish type name needs a third line once the layout stacks; below that the
  // two-line cap keeps the grid's rows aligned (ADR 0028 section 3's threshold).
  const { usesStackedLayout } = useTextScaling();
  // The ring is drawn inside the square, so the drawing gets the content box rather
  // than the frame and is never clipped by it.
  const artworkSize = size - borderWidths.strong * 2;

  return (
    <PressScale
      accessibilityLabel={label}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={styles.wrapper}
      testID={`wardrobe-type-${garmentType.typeId}`}>
      <View
        style={[
          styles.frame,
          {
            backgroundColor: theme.colors.surfaceMuted,
            borderColor: selected ? theme.colors.brandAccent : 'transparent',
            height: size,
            width: size,
          },
        ]}>
        <GarmentTileArtwork
          category={garmentType.structuralCategory}
          colorFamily={null}
          garmentTypeId={garmentType.typeId}
          glyphSize={artworkSize * GLYPH_SIZE_RATIO}
          height={artworkSize}
          photoTestID={`wardrobe-type-photo-${garmentType.typeId}`}
          photoUri={null}
          placeholderTestID={`wardrobe-type-placeholder-${garmentType.typeId}`}
          silhouetteTestID={`wardrobe-type-silhouette-${garmentType.typeId}`}
          width={artworkSize}
        />
        {selected ? (
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={styles.mark}>
            <Icon
              color={theme.colors.brandAccent}
              name="checkCircle"
              size={SELECTED_MARK_SIZE}
            />
          </View>
        ) : null}
      </View>
      <AppText
        numberOfLines={usesStackedLayout ? 3 : 2}
        style={{ width: size }}
        variant="label">
        {label}
      </AppText>
    </PressScale>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: spacing.xs,
  },
  frame: {
    alignItems: 'center',
    borderRadius: TILE_RADIUS,
    borderWidth: borderWidths.strong,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  mark: {
    bottom: spacing.sm,
    position: 'absolute',
    right: spacing.sm,
  },
});
