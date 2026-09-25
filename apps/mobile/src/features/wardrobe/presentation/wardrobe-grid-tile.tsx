import { StyleSheet, View } from 'react-native';

import { AppText, GarmentTileArtwork, Icon, PressScale, useTextScaling } from '@/components/ui';
import { getGarmentType } from '@/features/catalog/domain/garment-catalog';
import type { WardrobeItem } from '@/features/wardrobe/domain/wardrobe-item';
import type { AppMessages } from '@/localization/messages';
import { borderWidths, radii, spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

// ADR 0029 sections 1 and 3. Each tile draws the first rung it can: the photo,
// cover-cropped, else the colour-filled silhouette, else the structural-category glyph.
// All three rungs share this one frame, one stage fill, one name line and
// one subline slot, so mixed rows never stagger and legacy rows are never drawn broken.
// No radius token in `radii` is 14; section 2's anatomy table fixes image tiles at 14
// regardless of Law 3's 20 container radius, matching the rail's own local constant.
const TILE_RADIUS = 14;
// ADR 0028 section 1's rail sizes its glyph rung at 72 inside a 136-wide tile; the grid
// reuses that ratio against the tile's shorter side rather than inventing a new one.
const GLYPH_SIZE_RATIO = 72 / 136;
// O9: a wanted tile has no stage fill; a dashed `borderDefined` frame, a heart badge and a
// dashed garment edge carry the state with the section heading and the spoken "Wanted",
// so colour is never the only signal.
const WANTED_FRAME_WIDTH = 1.5;
const WANTED_BADGE_SIZE = 28;
const WANTED_BADGE_ICON_SIZE = 16;

export type WardrobeGridTileGeometry = Readonly<{ width: number; height: number }>;

function resolveTileCopy(
  item: WardrobeItem,
  messages: AppMessages,
): Readonly<{ title: string; subline: string | null }> {
  const garmentType = item.garmentTypeId ? getGarmentType(item.garmentTypeId) : null;
  const typeLabel = garmentType ? messages.catalog[garmentType.nameKey] : null;
  const categoryLabel =
    messages.catalog[`catalog.attribute.structural_category.${item.category}`];
  const missingTypeLabel = messages.wardrobe.unclassifiedType;

  if (item.name) {
    // The type under a user's own name, or "Type not selected" under a legacy row.
    return { title: item.name, subline: typeLabel ?? missingTypeLabel };
  }

  // Falls to the type, or the category when even the type is missing; the subline then
  // explains why, and is otherwise absent because it would repeat the name line.
  return { title: typeLabel ?? categoryLabel, subline: typeLabel ? null : missingTypeLabel };
}

export type WardrobeGridTileProps = Readonly<{
  geometry: WardrobeGridTileGeometry;
  item: WardrobeItem;
  messages: AppMessages;
  onPress: () => void;
  resolvePhotoUri: (relativePath: string | null) => string | null;
  testID?: string;
}>;

export function WardrobeGridTile({
  geometry,
  item,
  messages,
  onPress,
  resolvePhotoUri,
  testID,
}: WardrobeGridTileProps) {
  const theme = useKuyaraTheme();
  // A long Turkish name needs a third line once the layout stacks; below that the
  // two-line cap keeps the grid's rows aligned (ADR 0028 section 3's threshold).
  const { usesStackedLayout } = useTextScaling();
  const photoUri = resolvePhotoUri(item.photoRelativePath);
  const { subline, title } = resolveTileCopy(item, messages);
  const wanted = item.entryState === 'wanted';
  const accessibilityLabel = [title, subline, wanted ? messages.wardrobe.wantedTileLabel : null]
    .filter(Boolean)
    .join('. ');
  const glyphSize = Math.min(geometry.width, geometry.height) * GLYPH_SIZE_RATIO;

  return (
    // Law 7's press feedback: the tile dims and scales back on `motion.fast`, the same
    // response Today's alternates give. The opacity is the visible state and the scale
    // rides on top of it, so motion is never the only indication that the tile is held.
    <PressScale
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.wrapper,
        { opacity: pressed ? theme.interaction.pressedOpacity : 1 },
      ]}
      testID={testID}>
      <View
        style={[
          styles.tile,
          geometry,
          wanted
            ? [styles.wantedTile, { borderColor: theme.colors.borderDefined }]
            : { backgroundColor: theme.colors.surfaceMuted },
        ]}
        testID={testID ? `${testID}-frame` : undefined}>
        <GarmentTileArtwork
          photoUri={photoUri}
          garmentTypeId={item.garmentTypeId}
          category={item.category}
          colorFamily={item.colorFamily}
          width={geometry.width}
          height={geometry.height}
          glyphSize={glyphSize}
          photoTestID={`wardrobe-photo-${item.id}`}
          silhouetteTestID={`wardrobe-silhouette-${item.id}`}
          placeholderTestID={`wardrobe-photo-placeholder-${item.id}`}
          wanted={wanted}
        />
        {wanted ? (
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={[
              styles.wantedBadge,
              { backgroundColor: theme.colors.surface, borderColor: theme.colors.borderDefined },
            ]}
            testID={testID ? `${testID}-wanted-badge` : undefined}>
            <Icon color={theme.colors.textPrimary} name="heartFilled" size={WANTED_BADGE_ICON_SIZE} />
          </View>
        ) : null}
      </View>
      <AppText
        numberOfLines={usesStackedLayout ? 3 : 2}
        style={{ width: geometry.width }}
        variant="label">
        {title}
      </AppText>
      {subline ? (
        <AppText
          colorRole="textSecondary"
          numberOfLines={1}
          style={{ width: geometry.width }}
          variant="caption">
          {subline}
        </AppText>
      ) : null}
    </PressScale>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: spacing.xs,
  },
  tile: {
    alignItems: 'center',
    borderRadius: TILE_RADIUS,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  wantedTile: {
    borderStyle: 'dashed',
    borderWidth: WANTED_FRAME_WIDTH,
  },
  wantedBadge: {
    alignItems: 'center',
    borderRadius: radii.pill,
    borderWidth: borderWidths.subtle,
    height: WANTED_BADGE_SIZE,
    justifyContent: 'center',
    position: 'absolute',
    right: spacing.sm,
    top: spacing.sm,
    width: WANTED_BADGE_SIZE,
  },
});
