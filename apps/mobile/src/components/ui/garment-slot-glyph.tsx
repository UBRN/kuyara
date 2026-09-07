import { Image, StyleSheet, View, type ImageSourcePropType } from 'react-native';

import type { StructuralCategory } from '@/features/catalog/domain/garment-taxonomy';
import { radii } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

type GarmentSlotGlyphProps = Readonly<{
  category: StructuralCategory;
  size: number;
  color: string;
  accessibilityLabel?: string;
}>;

// Two raster classes of the same drawings (ADR 0025 consequences, 2026-09-07). The small
// class is the 24 point export with an optical stroke for the 20 to 28 point row and tile
// glyphs; the large class is the 72 point idiom-pure export for the rail and grid tiles,
// where the small PNG would be scaled three times and blur.
const garmentArtwork: Readonly<Record<StructuralCategory, ImageSourcePropType>> = {
  accessory: require('../../../assets/icons/garment/accessory.png'),
  bottom: require('../../../assets/icons/garment/bottom.png'),
  footwear: require('../../../assets/icons/garment/footwear.png'),
  one_piece: require('../../../assets/icons/garment/one_piece.png'),
  outerwear: require('../../../assets/icons/garment/outerwear.png'),
  top: require('../../../assets/icons/garment/top.png'),
};

const garmentArtworkLarge: Readonly<Record<StructuralCategory, ImageSourcePropType>> = {
  accessory: require('../../../assets/icons/garment/large/accessory.png'),
  bottom: require('../../../assets/icons/garment/large/bottom.png'),
  footwear: require('../../../assets/icons/garment/large/footwear.png'),
  one_piece: require('../../../assets/icons/garment/large/one_piece.png'),
  outerwear: require('../../../assets/icons/garment/large/outerwear.png'),
  top: require('../../../assets/icons/garment/large/top.png'),
};

// Above this display size the small class has been scaled past its 24 point export.
const LARGE_ARTWORK_THRESHOLD = 32;

export function resolveGarmentArtwork(category: StructuralCategory, size: number): ImageSourcePropType {
  return size > LARGE_ARTWORK_THRESHOLD ? garmentArtworkLarge[category] : garmentArtwork[category];
}

export function GarmentSlotGlyph({
  accessibilityLabel,
  category,
  color,
  size,
}: GarmentSlotGlyphProps) {
  return (
    <Image
      accessibilityElementsHidden={!accessibilityLabel}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityLabel ? 'image' : undefined}
      accessible={Boolean(accessibilityLabel)}
      importantForAccessibility={accessibilityLabel ? 'auto' : 'no-hide-descendants'}
      resizeMode="contain"
      source={resolveGarmentArtwork(category, size)}
      style={{ height: size, tintColor: color, width: size }}
    />
  );
}

export function GarmentSlotTile(props: GarmentSlotGlyphProps) {
  const theme = useKuyaraTheme();

  return (
    <View
      style={[
        styles.tile,
        {
          backgroundColor: theme.colors.surfaceInteractive,
          borderRadius: radii.control,
          height: props.size,
          width: props.size,
        },
      ]}>
      <GarmentSlotGlyph {...props} size={Math.round(props.size * 0.57)} />
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
