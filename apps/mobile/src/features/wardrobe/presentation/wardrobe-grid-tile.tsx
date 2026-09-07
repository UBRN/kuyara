import { useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';

import { AppText, GarmentSlotGlyph } from '@/components/ui';
import { getGarmentType } from '@/features/catalog/domain/garment-catalog';
import type { WardrobeItem } from '@/features/wardrobe/domain/wardrobe-item';
import type { AppMessages } from '@/localization/messages';
import { spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

// ADR 0029 sections 1 and 3. Each tile draws the first rung it can: the photo,
// cover-cropped, else the structural-category glyph. The silhouette rung and the
// colour-family fill wait for Today's board and are deliberately not added here. A
// photo tile and a glyph tile share this one frame, one stage fill, one name line and
// one subline slot, so mixed rows never stagger and legacy rows are never drawn broken.
// No radius token in `radii` is 14; section 2's anatomy table fixes image tiles at 14
// regardless of Law 3's 20 container radius, matching the rail's own local constant.
const TILE_RADIUS = 14;
// ADR 0028 section 1's rail sizes its glyph rung at 72 inside a 136-wide tile; the grid
// reuses that ratio against the tile's shorter side rather than inventing a new one.
const GLYPH_SIZE_RATIO = 72 / 136;

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
  const [unreadablePhotoUri, setUnreadablePhotoUri] = useState<string | null>(null);
  const photoUri = resolvePhotoUri(item.photoRelativePath);
  const visiblePhotoUri = photoUri === unreadablePhotoUri ? null : photoUri;
  const { subline, title } = resolveTileCopy(item, messages);
  const accessibilityLabel = [title, subline].filter(Boolean).join('. ');
  const glyphSize = Math.min(geometry.width, geometry.height) * GLYPH_SIZE_RATIO;

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      onPress={onPress}
      style={styles.wrapper}
      testID={testID}>
      <View
        style={[
          styles.tile,
          geometry,
          { backgroundColor: theme.colors.surfaceMuted },
        ]}>
        {visiblePhotoUri ? (
          <Image
            accessibilityElementsHidden
            accessible={false}
            importantForAccessibility="no-hide-descendants"
            onError={() => setUnreadablePhotoUri(visiblePhotoUri)}
            resizeMode="cover"
            source={{ uri: visiblePhotoUri }}
            style={StyleSheet.absoluteFill}
            testID={`wardrobe-photo-${item.id}`}
          />
        ) : (
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            testID={`wardrobe-photo-placeholder-${item.id}`}>
            <GarmentSlotGlyph category={item.category} color={theme.colors.iconSecondary} size={glyphSize} />
          </View>
        )}
      </View>
      <AppText numberOfLines={2} style={{ width: geometry.width }} variant="label">
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
    </Pressable>
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
});
