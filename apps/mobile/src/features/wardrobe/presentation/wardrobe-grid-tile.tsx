import { Link, type Href } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AppText, GarmentTileArtwork, Icon, PressScale, useTextScaling } from '@/components/ui';
import { getGarmentType } from '@/features/catalog/domain/garment-catalog';
import type { WardrobeItem } from '@/features/wardrobe/domain/wardrobe-item';
import type { AppMessages } from '@/localization/messages';
import { borderWidths, plateTheme, radii, spacing } from '@/theme/theme';
import { useStrongEdge } from '@/theme/easier-to-see';
import { OnPlate } from '@/theme/plate-theme';
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
// O9: a wanted tile stands on the garment ground (the page in the light appearance, the
// plate in the dark); a dashed `borderDefined` frame, a heart badge and a dashed garment
// edge carry the state with the section heading and the spoken "Wanted",
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
  /** The piece's edit form. */
  href: Href;
  /** Runs before the link navigates; `preventDefault` on the event cancels the navigation. */
  onPress?: (event: Readonly<{ preventDefault: () => void }>) => void;
  resolvePhotoUri: (relativePath: string | null) => string | null;
  /** O10: the piece just saved wears a 2 point `brandAccent` ring beside its confirmation. */
  highlighted?: boolean;
  /** Days History recorded this piece worn; a quiet line under the name, absent at zero. */
  wornCount?: number;
  testID?: string;
}>;

export function WardrobeGridTile({
  geometry,
  highlighted = false,
  href,
  item,
  messages,
  onPress,
  resolvePhotoUri,
  testID,
  wornCount = 0,
}: WardrobeGridTileProps) {
  const theme = useKuyaraTheme();
  // O13 (owner decision 9): while higher contrast applies the tile wears a 2-point ring in
  // the strong edge ink; a wanted tile keeps its dashed frame in that ink.
  const strongEdge = useStrongEdge();
  // A long Turkish name needs a third line once the layout stacks; below that the
  // two-line cap keeps the grid's rows aligned (ADR 0028 section 3's threshold).
  const { usesStackedLayout } = useTextScaling();
  const photoUri = resolvePhotoUri(item.photoRelativePath);
  const { subline, title } = resolveTileCopy(item, messages);
  const wanted = item.entryState === 'wanted';
  // A wanted piece stands on the page ground in the light appearance, an owned one on a tile.
  const plate = wanted ? theme.colors.garmentGround : theme.colors.garmentTile;
  const onPlate = plateTheme(theme, plate).colors;
  const worn = wornCount > 0 ? messages.wardrobe.wornCount(wornCount) : null;
  const accessibilityLabel = [title, subline, wanted ? messages.wardrobe.wantedTileLabel : null, worn]
    .filter(Boolean)
    .join('. ');
  const glyphSize = Math.min(geometry.width, geometry.height) * GLYPH_SIZE_RATIO;

  return (
    // The link opens the edit form, which slides up from the bottom as a full-height page
    // (the Profile stack's layout sets that presentation). `Link` merges its props into
    // `PressScale` and keeps only an object `style`, so the pressed opacity is drawn by the
    // inner view.
    <Link asChild href={href} onPress={onPress} push>
      {/* Law 7's press feedback: the tile dims and scales back on `motion.fast`, the same
          response Today's alternates give. The opacity is the visible state and the scale
          rides on top of it, so motion is never the only indication that the tile is held. */}
      <PressScale accessibilityLabel={accessibilityLabel} role="button" testID={testID}>
        {({ pressed }) => (
          <View
            style={[styles.wrapper, { opacity: pressed ? theme.interaction.pressedOpacity : 1 }]}
            testID={testID ? `${testID}-content` : undefined}>
            <View
              style={[
                styles.tile,
                geometry,
                { backgroundColor: plate },
                wanted && [styles.wantedTile, { borderColor: theme.colors.borderDefined }],
                strongEdge,
                highlighted && [styles.highlightedTile, { borderColor: theme.colors.brandAccent }],
              ]}
              testID={testID ? `${testID}-frame` : undefined}>
              <OnPlate color={plate}>
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
                      { backgroundColor: onPlate.surface, borderColor: onPlate.borderDefined },
                    ]}
                    testID={testID ? `${testID}-wanted-badge` : undefined}>
                    <Icon color={onPlate.textPrimary} name="heartFilled" size={WANTED_BADGE_ICON_SIZE} />
                  </View>
                ) : null}
              </OnPlate>
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
            {worn ? (
              <AppText
                colorRole="textSecondary"
                numberOfLines={1}
                style={{ width: geometry.width }}
                tabularNumbers
                testID={testID ? `${testID}-worn` : undefined}
                variant="caption">
                {worn}
              </AppText>
            ) : null}
          </View>
        )}
      </PressScale>
    </Link>
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
  highlightedTile: {
    borderStyle: 'solid',
    borderWidth: borderWidths.strong,
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
