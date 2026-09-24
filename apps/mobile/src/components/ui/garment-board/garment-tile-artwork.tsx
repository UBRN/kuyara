import { useId, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import Svg, { Defs, G, LinearGradient, Path, Stop } from 'react-native-svg';

import type { ColorFamily, GarmentTypeId, StructuralCategory } from '@/features/catalog/domain/garment-taxonomy';
import { useKuyaraTheme } from '@/theme/theme-context';

import { GarmentSlotGlyph } from '../garment-slot-glyph';
import { colorFamilyFills } from './color-family-fill';
import { resolveGarmentRenderFills } from './garment-render-fills';
import { garmentSilhouetteIds } from './garment-silhouette-map';
import { silhouettes, type Silhouette } from './silhouettes';

// A tile draws one garment rather than an outfit, so it has no slot of its own. It asks
// for the one slot that is neither the deeper `footwear` neutral nor, with an empty option
// id, ever an accent: a personal record is never coloured by a guess.
const TILE_SLOT = 'primary_top';
// A cropped drawing keeps this margin around its own artwork, in drawing units, so the
// stroke is not clipped at the edge.
const CROP_PAD = 1.5;
// The standalone mark size the board's 1.9 stroke is drawn for. Below it the stroke scales
// with the drawing (M21): about 1.1 points at the 16-point caption size, where a fixed 1.9
// would fill the drawing solid.
const STANDALONE_SIZE = 28;

function GarmentTileSilhouette({
  silhouette,
  colorFamily,
  width,
  height,
  testID,
  cropped = false,
}: Readonly<{
  silhouette: Silhouette;
  colorFamily: ColorFamily | null;
  width: number;
  height: number;
  testID: string;
  /** Fit the artwork's own extent to the box, not the tile's margins; see `GarmentDrawing`. */
  cropped?: boolean;
}>) {
  const { colors, colorScheme } = useKuyaraTheme();
  const gradientId = `garment-fill-${useId()}`;
  // `multicolor` is the one family a single fill cannot carry, so it keeps its two stops
  // here; everything else takes the recorded colour or the neutral base of the page ground.
  const fill = colorFamily === 'multicolor'
    ? colorFamilyFills[colorScheme].multicolor
    : resolveGarmentRenderFills({
      optionId: '',
      pieces: [{ slot: TILE_SLOT, colorFamily }],
      plane: colors.background,
      colors,
      colorScheme,
    }).get(TILE_SLOT)!;
  const gradient = typeof fill !== 'string';
  const { bounds } = silhouette;
  const scale = cropped
    ? Math.min(width, height) / (Math.max(bounds.width, bounds.height) + 2 * CROP_PAD)
    : Math.min(width * 0.6 / bounds.width, height * 0.61 / bounds.height);
  const strokeWidth = cropped ? 1.9 * Math.min(1, height / STANDALONE_SIZE) : 1.9;
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
            strokeWidth={strokeWidth / scale}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
      </G>
    </Svg>
  );
}

/**
 * One garment drawn beside words: a finishing touch at caption size, a day type on a sheet
 * tile. The drawing is normalised by its own drawn extent, so a coat and a shoe read at the
 * same weight, and filled from the page ground. A type without a drawing falls back to its
 * category glyph at the same size.
 */
export function GarmentDrawing({
  garmentTypeId,
  category,
  size,
  testID,
}: Readonly<{
  garmentTypeId: GarmentTypeId;
  category: StructuralCategory;
  size: number;
  testID: string;
}>) {
  const { colors } = useKuyaraTheme();
  const silhouetteId = garmentSilhouetteIds[garmentTypeId];

  if (silhouetteId) {
    return (
      <GarmentTileSilhouette
        colorFamily={null}
        cropped
        height={size}
        silhouette={silhouettes[silhouetteId]}
        testID={testID}
        width={size}
      />
    );
  }

  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" testID={testID}>
      <GarmentSlotGlyph category={category} color={colors.iconSecondary} size={size} />
    </View>
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
