import { useId, useMemo, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import Svg, { Defs, G, LinearGradient, Stop } from 'react-native-svg';

import type { ColorFamily, GarmentTypeId, StructuralCategory } from '@/features/catalog/domain/garment-taxonomy';
import { useKuyaraTheme } from '@/theme/theme-context';

import { GarmentSlotGlyph } from '../garment-slot-glyph';
import { GARMENT_OUTLINE, garmentLevelOfDetail, GarmentPainting, WANTED_OUTLINE_DASH } from './garment-painting';
import { garmentFillRoles, type GarmentRoles } from './garment-palette';
import { resolveGarmentTileFill } from './garment-render-fills';
import { garmentSilhouetteIds } from './garment-silhouette-map';
import { silhouettes, type Silhouette } from './silhouettes';

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
  roles: paletteRoles,
  width,
  height,
  testID,
  cropped = false,
  wanted = false,
}: Readonly<{
  silhouette: Silhouette;
  colorFamily: ColorFamily | null;
  /** An outfit piece's palette roles (O15); without them the drawing takes the tile fill. */
  roles?: GarmentRoles;
  width: number;
  height: number;
  testID: string;
  /** Fit the artwork's own extent to the box, not the tile's margins; see `GarmentDrawing`. */
  cropped?: boolean;
  /** A wanted Closet piece draws its ink edge dashed (O9). */
  wanted?: boolean;
}>) {
  const { colors, colorScheme } = useKuyaraTheme();
  const gradientId = `garment-fill-${useId()}`;
  // `multicolor` is the one family a single fill cannot carry, so it keeps its two stops;
  // everything else takes the recorded colour or the neutral step off the page ground.
  const fill = resolveGarmentTileFill({ colorFamily, plane: colors.background, colors, colorScheme });
  const gradient = typeof fill !== 'string';
  // Every tone of the drawing derives from its main fill; a multicolour piece derives them
  // from its first stop and paints its main surfaces with the gradient.
  const tileRoles = useMemo(
    () => garmentFillRoles(silhouette.id, gradient ? fill[0] : fill, colorScheme),
    [colorScheme, fill, gradient, silhouette.id],
  );
  const { bounds } = silhouette;
  const scale = cropped
    ? Math.min(width, height) / (Math.max(bounds.width, bounds.height) + 2 * CROP_PAD)
    : Math.min(width * 0.6 / bounds.width, height * 0.61 / bounds.height);
  const outline = cropped ? GARMENT_OUTLINE * Math.min(1, height / STANDALONE_SIZE) : GARMENT_OUTLINE;
  // No `vectorEffect="non-scaling-stroke"`: on iOS react-native-svg paints a non-scaling
  // stroke in client space while a gradient fill still uses the path's local bounds, so the
  // multicolor gradient landed outside the drawing (measured 2026-09-09 on 15.15.4). The
  // painting divides every stroke by the uniform scale instead.
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
        <GarmentPainting
          ink={colors.textPrimary}
          lod={garmentLevelOfDetail(Math.max(bounds.width, bounds.height) * scale)}
          mainPaint={gradient && !paletteRoles ? `url(#${gradientId})` : undefined}
          outline={outline}
          outlineDash={wanted ? WANTED_OUTLINE_DASH : undefined}
          roles={paletteRoles ?? tileRoles}
          scale={scale}
          silhouette={silhouette}
        />
      </G>
    </Svg>
  );
}

/**
 * One garment drawn beside words: a finishing touch at caption size, a day type on a sheet
 * tile. The drawing is normalised by its own drawn extent, so a coat and a shoe read at the
 * same weight. An outfit's piece takes its palette roles (O15); anything else is filled from
 * the page ground. A type without a drawing falls back to its category glyph at the same size.
 */
export function GarmentDrawing({
  garmentTypeId,
  category,
  size,
  roles,
  colorFamily = null,
  testID,
}: Readonly<{
  garmentTypeId: GarmentTypeId;
  category: StructuralCategory;
  size: number;
  roles?: GarmentRoles;
  /** A Closet record's recorded colour (Profile's category cells); ignored beside `roles`. */
  colorFamily?: ColorFamily | null;
  testID: string;
}>) {
  const { colors } = useKuyaraTheme();
  const silhouetteId = garmentSilhouetteIds[garmentTypeId];

  if (silhouetteId) {
    return (
      <GarmentTileSilhouette
        colorFamily={colorFamily}
        cropped
        height={size}
        roles={roles}
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
  photoUri, garmentTypeId, category, colorFamily, roles, width, height, glyphSize,
  photoTestID, silhouetteTestID, placeholderTestID, wanted = false,
}: Readonly<{
  photoUri: string | null;
  garmentTypeId: GarmentTypeId | null;
  category: StructuralCategory;
  colorFamily: ColorFamily | null;
  /** An outfit piece's palette roles (O15), for the detail's finishing touches. */
  roles?: GarmentRoles;
  width: number;
  height: number;
  glyphSize: number;
  photoTestID: string;
  silhouetteTestID: string;
  placeholderTestID: string;
  /** A wanted Closet piece: the silhouette's ink edge is dashed (O9). */
  wanted?: boolean;
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
    return <GarmentTileSilhouette silhouette={silhouettes[silhouetteId]} colorFamily={colorFamily} roles={roles} wanted={wanted} width={width} height={height} testID={silhouetteTestID} />;
  }

  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" testID={placeholderTestID}>
      <GarmentSlotGlyph category={category} color={colors.iconSecondary} size={glyphSize} />
    </View>
  );
}
