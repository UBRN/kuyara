import { StyleSheet, View } from 'react-native';

import type { StructuralCategory } from '@/features/catalog/domain/garment-taxonomy';
import { radii } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

type GarmentSlotGlyphProps = Readonly<{
  category: StructuralCategory;
  size: number;
  color: string;
  accessibilityLabel?: string;
}>;

const BAR_OPACITY = 0.25;

export function GarmentSlotGlyph({
  accessibilityLabel,
  category,
  color,
  size,
}: GarmentSlotGlyphProps) {
  const barWidth = size * 0.75;
  const barHeight = size * 0.12;
  const barLeft = (size - barWidth) / 2;
  const barTops = [size / 6, size / 2, size * 5 / 6].map(
    (center) => center - barHeight / 2,
  );

  return (
    <View
      accessibilityElementsHidden={!accessibilityLabel}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityLabel ? 'image' : undefined}
      accessible={Boolean(accessibilityLabel)}
      importantForAccessibility={accessibilityLabel ? 'auto' : 'no-hide-descendants'}
      style={[styles.glyph, { height: size, width: size }]}>
      {category === 'one_piece' ? (
        <View
          style={{
            backgroundColor: color,
            borderRadius: size,
            height: size * 0.75,
            left: size * 0.41,
            position: 'absolute',
            top: size * 0.125,
            width: size * 0.18,
          }}
        />
      ) : (
        barTops.map((top, index) => (
          <View
            key={top}
            style={{
              backgroundColor: color,
              borderRadius: size,
              height: barHeight,
              left: barLeft,
              opacity:
                (category === 'top' && index === 0) ||
                (category === 'bottom' && index === 1) ||
                (category === 'footwear' && index === 2)
                  ? 1
                  : BAR_OPACITY,
              position: 'absolute',
              top,
              width: barWidth,
            }}
          />
        ))
      )}
      {category === 'outerwear' ? (
        <View
          style={{
            borderColor: color,
            borderRadius: size * 0.2,
            borderWidth: 1.5,
            bottom: size * 0.05,
            left: size * 0.05,
            position: 'absolute',
            right: size * 0.05,
            top: size * 0.05,
          }}
        />
      ) : null}
      {category === 'accessory' ? (
        <View
          style={{
            backgroundColor: color,
            borderRadius: size * 0.08,
            height: size * 0.22,
            position: 'absolute',
            right: size * 0.02,
            top: size * 0.02,
            width: size * 0.22,
          }}
        />
      ) : null}
    </View>
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
  glyph: {
    position: 'relative',
  },
  tile: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
