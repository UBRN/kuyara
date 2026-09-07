import { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import {
  AppText,
  Button,
  GarmentSlotGlyph,
  Icon,
  ListRow,
  ListRowGroup,
  Screen,
  useTextScaling,
} from '@/components/ui';
import { getGarmentType } from '@/features/catalog/domain/garment-catalog';
import { useWardrobeApplication } from '@/features/wardrobe/application/wardrobe-application-context';
import type { WardrobeItem } from '@/features/wardrobe/domain/wardrobe-item';
import type { AppMessages } from '@/localization/messages';
import { useMessages } from '@/localization/use-messages';
import { interaction, layout, spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

// ADR 0028 section 1: the Closet is the subject. The native large title and the
// Settings bar button are the route's job (`app/(tabs)/(profile)/profile.tsx`), because
// they are chrome the OS draws, not this screen's content.

const RAIL_MAXIMUM_ITEMS = 8;
const RAIL_TILE_WIDTH = 136;
const RAIL_TILE_HEIGHT = 170;
// No token in `radii` is 14; section 2's table fixes image tiles at 14 regardless of
// Law 3's 20 container radius, so this is a local constant rather than a new role.
const RAIL_TILE_RADIUS = 14;
const RAIL_GLYPH_SIZE = 72;
const RAIL_ALL_PIECES_ICON_SIZE = 16;
// Section 3: rail tiles scale by `min(fontScale, 2)` above 1.5; below 1.5 only the
// caption scales, which `AppText`'s default `allowFontScaling` already gives for free.
const RAIL_SCALE_THRESHOLD = 1.5;
const RAIL_SCALE_MAXIMUM = 2;

type ProfileScreenProps = Readonly<{
  activePlaceName: string | null;
  onOpenWardrobe: (filter?: 'wanted') => void;
  onOpenWeather: () => void;
}>;

function resolveRailScale(fontScale: number): number {
  return fontScale > RAIL_SCALE_THRESHOLD
    ? Math.min(fontScale, RAIL_SCALE_MAXIMUM)
    : 1;
}

function resolveItemCaption(
  item: WardrobeItem,
  messages: AppMessages,
): Readonly<{ text: string; isOwnName: boolean }> {
  const garmentType = item.garmentTypeId ? getGarmentType(item.garmentTypeId) : null;
  const typeLabel = garmentType
    ? messages.catalog[garmentType.nameKey]
    : messages.wardrobe.unclassifiedType;

  return item.name
    ? { text: item.name, isOwnName: true }
    : { text: typeLabel, isOwnName: false };
}

function RailItemTile({
  item,
  position,
  resolvePhotoUri,
  scale,
  total,
}: Readonly<{
  item: WardrobeItem;
  position: number;
  resolvePhotoUri: (relativePath: string | null) => string | null;
  scale: number;
  total: number;
}>) {
  const messages = useMessages();
  const theme = useKuyaraTheme();
  const [unreadablePhotoUri, setUnreadablePhotoUri] = useState<string | null>(null);
  const photoUri = resolvePhotoUri(item.photoRelativePath);
  const visiblePhotoUri = photoUri === unreadablePhotoUri ? null : photoUri;
  const caption = resolveItemCaption(item, messages);
  const tileSize = {
    width: RAIL_TILE_WIDTH * scale,
    height: RAIL_TILE_HEIGHT * scale,
  };

  return (
    <View
      accessibilityLabel={messages.profile.railItemAccessibilityLabel({
        label: caption.text,
        position,
        total,
      })}
      accessible
      style={styles.railItem}
      testID={`profile-rail-item-${item.id}`}>
      <View
        style={[
          styles.railTile,
          tileSize,
          { backgroundColor: theme.colors.surfaceMuted },
        ]}
        testID={`profile-rail-item-${item.id}-tile`}>
        {visiblePhotoUri ? (
          <Image
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            onError={() => setUnreadablePhotoUri(visiblePhotoUri)}
            resizeMode="cover"
            source={{ uri: visiblePhotoUri }}
            style={StyleSheet.absoluteFill}
          />
        ) : (
          <GarmentSlotGlyph
            category={item.category}
            color={theme.colors.iconSecondary}
            size={RAIL_GLYPH_SIZE * scale}
          />
        )}
      </View>
      <AppText
        colorRole={caption.isOwnName ? 'textPrimary' : 'textSecondary'}
        style={{ maxWidth: RAIL_TILE_WIDTH * scale }}
        variant="caption">
        {caption.text}
      </AppText>
    </View>
  );
}

function RailAllPiecesTile({
  label,
  onPress,
  scale,
}: Readonly<{ label: string; onPress: () => void; scale: number }>) {
  const theme = useKuyaraTheme();
  const tileSize = {
    width: RAIL_TILE_WIDTH * scale,
    height: RAIL_TILE_HEIGHT * scale,
  };

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={styles.railItem}
      testID="profile-rail-all-pieces">
      <View
        style={[
          styles.railTile,
          tileSize,
          { backgroundColor: theme.colors.surfaceMuted },
        ]}>
        <Icon
          color={theme.colors.iconSecondary}
          name="chevronRight"
          size={RAIL_ALL_PIECES_ICON_SIZE}
        />
      </View>
      <AppText
        colorRole="textSecondary"
        style={{ maxWidth: RAIL_TILE_WIDTH * scale }}
        variant="caption">
        {label}
      </AppText>
    </Pressable>
  );
}

function ClosetRail({
  items,
  onOpenWardrobe,
  resolvePhotoUri,
  scale,
}: Readonly<{
  items: readonly WardrobeItem[];
  onOpenWardrobe: () => void;
  resolvePhotoUri: (relativePath: string | null) => string | null;
  scale: number;
}>) {
  const messages = useMessages();
  const newestFirst = [...items].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  const visible = newestFirst.slice(0, RAIL_MAXIMUM_ITEMS);
  const hasMore = newestFirst.length > RAIL_MAXIMUM_ITEMS;

  return (
    <View style={styles.railBleed}>
      <ScrollView
        contentContainerStyle={styles.railContent}
        horizontal
        showsHorizontalScrollIndicator={false}
        testID="profile-rail">
        {visible.map((item, index) => (
          <RailItemTile
            item={item}
            key={item.id}
            position={index + 1}
            resolvePhotoUri={resolvePhotoUri}
            scale={scale}
            total={visible.length}
          />
        ))}
        {hasMore ? (
          <RailAllPiecesTile
            label={messages.profile.railAllPiecesLabel}
            onPress={onOpenWardrobe}
            scale={scale}
          />
        ) : null}
      </ScrollView>
    </View>
  );
}

export function ProfileScreen({
  activePlaceName,
  onOpenWardrobe,
  onOpenWeather,
}: ProfileScreenProps) {
  const messages = useMessages();
  const copy = messages.profile;
  const theme = useKuyaraTheme();
  const { fontScale } = useTextScaling();
  const { resolvePhotoUri, state } = useWardrobeApplication();
  const railScale = resolveRailScale(fontScale);

  const isReady = state.status === 'ready';
  const ownedItems = isReady
    ? state.items.filter((item) => item.entryState === 'owned')
    : [];
  const wantedItems = isReady
    ? state.items.filter((item) => item.entryState === 'wanted')
    : [];
  const hasOwned = ownedItems.length > 0;
  const hasWanted = wantedItems.length > 0;
  const isFullyEmpty = isReady && !hasOwned && !hasWanted;

  return (
    <Screen contentContainerStyle={styles.content} testID="profile-screen">
      <Pressable
        accessibilityHint={copy.closetHeadingHint}
        accessibilityLabel={copy.closetHeadingAccessibilityLabel({ count: ownedItems.length })}
        accessibilityRole="button"
        onPress={() => onOpenWardrobe()}
        style={({ pressed }) => [styles.closetHeading, pressed && styles.pressed]}
        testID="profile-closet-heading">
        <AppText style={styles.closetHeadingTitle} variant="title">
          {copy.wardrobeTitle}
        </AppText>
        {isReady ? (
          <AppText
            colorRole="textSecondary"
            tabularNumbers
            testID="profile-closet-heading-count"
            variant="body">
            {ownedItems.length}
          </AppText>
        ) : null}
        <Icon color={theme.colors.iconSecondary} name="chevronRight" size={20} />
      </Pressable>

      {!isReady ? (
        <AppText colorRole="textSecondary" style={styles.statusText}>
          {state.status === 'loading' ? copy.wardrobeLoading : copy.wardrobeUnavailable}
        </AppText>
      ) : isFullyEmpty ? (
        <View style={styles.emptyState} testID="profile-closet-empty">
          <AppText colorRole="textSecondary">{copy.wardrobeEmpty}</AppText>
          <Button
            label={copy.addPieceAction}
            onPress={() => onOpenWardrobe()}
            testID="profile-add-piece-button"
          />
        </View>
      ) : hasOwned ? (
        <ClosetRail
          items={ownedItems}
          onOpenWardrobe={() => onOpenWardrobe()}
          resolvePhotoUri={resolvePhotoUri}
          scale={railScale}
        />
      ) : null}

      <View style={styles.group}>
        <ListRowGroup testID="profile-group">
          {hasWanted && (
            <ListRow
              glyph={({ color, size }) => (
                <Icon color={color} name="heart" size={size} />
              )}
              key="wanted"
              label={copy.wantedLabel}
              onPress={() => onOpenWardrobe('wanted')}
              testID="profile-wanted-row"
              value={String(wantedItems.length)}
              valueTabular
            />
          )}
          <ListRow
            accessibilityLabel={
              activePlaceName
                ? [activePlaceName, messages.weather.approximateLocation].join(', ')
                : copy.locationUnset
            }
            glyph={({ color, size }) => (
              <Icon color={color} name="location" size={size} />
            )}
            key="location"
            label={activePlaceName ?? copy.locationUnset}
            labelWeight="bodyStrong"
            onPress={onOpenWeather}
            supportingText={activePlaceName ? messages.weather.approximateLocation : undefined}
            testID="profile-location-row"
          />
        </ListRowGroup>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.md,
  },
  closetHeading: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: layout.minimumTouchTarget,
  },
  closetHeadingTitle: {
    flex: 1,
  },
  pressed: {
    opacity: interaction.pressedOpacity,
  },
  statusText: {
    minHeight: layout.minimumTouchTarget,
  },
  emptyState: {
    gap: spacing.md,
  },
  railBleed: {
    marginHorizontal: -spacing.lg,
  },
  railContent: {
    gap: spacing.md,
    paddingLeft: spacing.lg,
  },
  railItem: {
    gap: spacing.xs,
  },
  railTile: {
    alignItems: 'center',
    borderRadius: RAIL_TILE_RADIUS,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  group: {
    // ADR 0028 section 1: 24 between the rail and the group. The content column already
    // contributes its 12 gap, so the margin carries only the remainder.
    marginTop: spacing.xl - spacing.md,
  },
});
