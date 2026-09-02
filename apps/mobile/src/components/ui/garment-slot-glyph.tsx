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

const garmentArtwork: Readonly<Record<StructuralCategory, ImageSourcePropType>> = {
  accessory: require('../../../assets/icons/garment/accessory.png'),
  bottom: require('../../../assets/icons/garment/bottom.png'),
  footwear: require('../../../assets/icons/garment/footwear.png'),
  one_piece: require('../../../assets/icons/garment/one_piece.png'),
  outerwear: require('../../../assets/icons/garment/outerwear.png'),
  top: require('../../../assets/icons/garment/top.png'),
};

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
      source={garmentArtwork[category]}
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
