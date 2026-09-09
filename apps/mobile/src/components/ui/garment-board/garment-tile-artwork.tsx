import { useId, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import Svg, { Defs, G, LinearGradient, Path, Stop } from 'react-native-svg';

import type { ColorFamily, GarmentTypeId, StructuralCategory } from '@/features/catalog/domain/garment-taxonomy';
import { useKuyaraTheme } from '@/theme/theme-context';

import { GarmentSlotGlyph } from '../garment-slot-glyph';
import { colorFamilyFills } from './color-family-fill';
import { garmentSilhouetteIds } from './garment-silhouette-map';
import { silhouettes, type Silhouette } from './silhouettes';

function GarmentTileSilhouette({
  silhouette,
  colorFamily,
  width,
  height,
  testID,
}: Readonly<{
  silhouette: Silhouette;
  colorFamily: ColorFamily | null;
  width: number;
  height: number;
  testID: string;
}>) {
  const { colors, colorScheme } = useKuyaraTheme();
  const gradientId = `garment-fill-${useId()}`;
  const fill = colorFamily === null ? colors.stage : colorFamilyFills[colorScheme][colorFamily];
  const gradient = typeof fill !== 'string';
  const { bounds } = silhouette;
  const scale = Math.min(width * 0.6 / bounds.width, height * 0.61 / bounds.height);
  // The board's `vectorEffect="non-scaling-stroke"` is not used here: on iOS react-native-svg
  // paints a non-scaling-stroke path in client space while a gradient fill still uses the
  // path's local bounds, so the multicolor gradient landed outside the drawing (measured
  // 2026-09-09 on 15.15.4). Dividing the 1.9 stroke by the uniform scale draws the same
  // 1.9 point edge and keeps the gradient in the path's own coordinate space.
  const x = (width - bounds.width * scale) / 2 - bounds.x * scale;
  const y = (height - bounds.height * scale) / 2 - bounds.y * scale;

  return (
    <Svg
      accessibilityElementsHidden
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      width={width}
      height={height}
      testID={testID}>
      {gradient ? (
        <Defs>
          <LinearGradient id={gradientId} x1={0} y1={0} x2={1} y2={1}>
            <Stop offset={0} stopColor={fill[0]} />
            <Stop offset={1} stopColor={fill[1]} />
          </LinearGradient>
        </Defs>
      ) : null}
      <G transform={`translate(${x} ${y}) scale(${scale})`}>
        {silhouette.paths.map((path) => (
          <Path
            key={path.d}
            d={path.d}
            fill={path.filled ? (gradient ? `url(#${gradientId})` : fill) : 'none'}
            stroke={colors.textPrimary}
            strokeWidth={1.9 / scale}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
      </G>
    </Svg>
  );
}

// One photo, then silhouette, then category glyph ladder for both personal-piece surfaces.
export function GarmentTileArtwork({
  photoUri, garmentTypeId, category, colorFamily, width, height, glyphSize,
  photoTestID, silhouetteTestID, placeholderTestID,
}: Readonly<{
  photoUri: string | null;
  garmentTypeId: GarmentTypeId | null;
  category: StructuralCategory;
  colorFamily: ColorFamily | null;
  width: number;
  height: number;
  glyphSize: number;
  photoTestID: string;
  silhouetteTestID: string;
  placeholderTestID: string;
}>) {
  const { colors } = useKuyaraTheme();
  const [unreadablePhotoUri, setUnreadablePhotoUri] = useState<string | null>(null);
  const silhouetteId = garmentTypeId ? garmentSilhouetteIds[garmentTypeId] : undefined;

  if (photoUri && photoUri !== unreadablePhotoUri) {
    return (
      <Image
        accessibilityElementsHidden
        accessible={false}
        importantForAccessibility="no-hide-descendants"
        onError={() => setUnreadablePhotoUri(photoUri)}
        resizeMode="cover"
        source={{ uri: photoUri }}
        style={StyleSheet.absoluteFill}
        testID={photoTestID}
      />
    );
  }

  if (silhouetteId) {
    return <GarmentTileSilhouette silhouette={silhouettes[silhouetteId]} colorFamily={colorFamily} width={width} height={height} testID={silhouetteTestID} />;
  }

  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" testID={placeholderTestID}>
      <GarmentSlotGlyph category={category} color={colors.iconSecondary} size={glyphSize} />
    </View>
  );
}
