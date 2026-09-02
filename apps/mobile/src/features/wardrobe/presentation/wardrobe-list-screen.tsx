import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import Animated, {
  useAnimatedScrollHandler,
  useSharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  AppText,
  Button,
  GarmentSlotTile,
  Icon,
  IconButton,
  StretchyHeader,
  Surface,
} from '@/components/ui';
import { getGarmentType } from '@/features/catalog/domain/garment-catalog';
import type { CatalogMessageKey } from '@/features/catalog/domain/garment-taxonomy';
import type { WardrobeApplicationState } from '@/features/wardrobe/application/wardrobe-application-controller';
import type {
  WardrobeEntryState,
  WardrobeItem,
} from '@/features/wardrobe/domain/wardrobe-item';
import { useMessages } from '@/localization/use-messages';
import { borderWidths, interaction, layout, radii, spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

type WardrobeListScreenProps = Readonly<{
  state: WardrobeApplicationState;
  onAdd: () => void;
  onBack?: () => void;
  onEdit: (id: string) => void;
  onRetry: () => void;
  resolvePhotoUri?: (relativePath: string | null) => string | null;
}>;

function WardrobeListItem({
  item,
  onPress,
  resolvePhotoUri,
}: Readonly<{
  item: WardrobeItem;
  onPress: () => void;
  resolvePhotoUri: (relativePath: string | null) => string | null;
}>) {
  const messages = useMessages();
  const theme = useKuyaraTheme();
  const garmentType = item.garmentTypeId
    ? getGarmentType(item.garmentTypeId)
    : null;
  const typeLabel = garmentType
    ? messages.catalog[garmentType.nameKey]
    : messages.wardrobe.unclassifiedType;
  const categoryKey: CatalogMessageKey =
    `catalog.attribute.structural_category.${item.category}`;
  const categoryLabel = messages.catalog[categoryKey];
  const colorLabel = item.colorFamily
    ? messages.catalog[`catalog.color_family.${item.colorFamily}`]
    : null;
  const stateLabel = item.entryState === 'owned'
    ? messages.wardrobe.ownedLabel
    : messages.wardrobe.wantedLabel;
  const stateAccessibilityLabel = item.entryState === 'owned'
    ? messages.wardrobe.itemOwnedLabel
    : messages.wardrobe.itemWantedLabel;
  const title = item.name ?? typeLabel;
  const photoUri = resolvePhotoUri(item.photoRelativePath);
  const [unreadablePhotoUri, setUnreadablePhotoUri] = useState<string | null>(null);
  const visiblePhotoUri = photoUri === unreadablePhotoUri ? null : photoUri;

  return (
    <Pressable
      accessible
      accessibilityHint={messages.wardrobe.itemHint}
      accessibilityLabel={messages.wardrobe.itemAccessibilityLabel({
        name: item.name,
        type: typeLabel,
        category: categoryLabel,
        color: colorLabel,
        state: stateAccessibilityLabel,
      })}
      accessibilityRole="button"
      onPress={onPress}
      testID={`wardrobe-item-${item.id}`}>
      {({ pressed }) => (
        <Surface
          style={[
            styles.itemCard,
            theme.elevation.raised,
            pressed && { borderColor: theme.colors.borderStrong },
          ]}>
          {visiblePhotoUri ? (
            <Image
              accessibilityElementsHidden
              accessible={false}
              importantForAccessibility="no-hide-descendants"
              onError={() => setUnreadablePhotoUri(visiblePhotoUri)}
              resizeMode="cover"
              source={{ uri: visiblePhotoUri }}
              style={[styles.thumbnail, { backgroundColor: theme.colors.surfaceMuted }]}
              testID={`wardrobe-photo-${item.id}`}
            />
          ) : (
            <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              testID={`wardrobe-photo-placeholder-${item.id}`}>
              <GarmentSlotTile
                category={item.category}
                color={theme.colors.iconSecondary}
                size={56}
              />
            </View>
          )}
          <View style={styles.itemCopy}>
            <AppText variant="bodyStrong">{title}</AppText>
            {item.name ? (
              <AppText colorRole="textSecondary" variant="caption">
                {typeLabel}
              </AppText>
            ) : null}
            <View style={styles.itemCaption}>
              {item.colorFamily ? (
                <View
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                  style={[
                    styles.colorSwatch,
                    {
                      backgroundColor: item.colorFamily === 'multicolor'
                        ? theme.colors.brandAccent
                        : item.colorFamily,
                      borderColor: theme.colors.borderSubtle,
                    },
                  ]}
                  testID={`wardrobe-color-swatch-${item.id}`}
                />
              ) : null}
              <AppText
                colorRole="textSecondary"
                style={styles.itemCaptionCopy}
                variant="caption">
                {[categoryLabel, colorLabel].filter(Boolean).join(' · ')}
              </AppText>
            </View>
            <AppText colorRole="textSecondary" variant="caption">
              {stateLabel}
            </AppText>
          </View>
          <Icon
            color={theme.colors.iconSecondary}
            name="chevronRight"
            size={20}
          />
        </Surface>
      )}
    </Pressable>
  );
}

export function WardrobeListScreen({
  onAdd,
  onBack = () => undefined,
  onEdit,
  onRetry,
  resolvePhotoUri = () => null,
  state,
}: WardrobeListScreenProps) {
  const insets = useSafeAreaInsets();
  const messages = useMessages();
  const theme = useKuyaraTheme();
  const copy = messages.wardrobe;
  const [headerHeight, setHeaderHeight] = useState(0);
  const [entryState, setEntryState] = useState<WardrobeEntryState>('owned');
  const scrollOffset = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler((event) => {
    scrollOffset.set(event.contentOffset.y);
  });
  const horizontalPadding = spacing.xl;
  const contentInsets = {
    paddingBottom: insets.bottom + spacing.xl,
    paddingLeft: insets.left + horizontalPadding,
    paddingRight: insets.right + horizontalPadding,
    paddingTop: insets.top + spacing.xl,
  };
  const listContentInsets = {
    ...contentInsets,
    paddingTop: headerHeight + spacing.xl,
  };

  if (state.status === 'loading') {
    return (
      <View
        accessibilityLabel={copy.loadingLabel}
        accessibilityRole="progressbar"
        style={[styles.centered, { backgroundColor: theme.colors.background }]}
        testID="wardrobe-loading">
        <ActivityIndicator color={theme.colors.brandAccent} />
        <AppText colorRole="textSecondary">{copy.loadingLabel}</AppText>
      </View>
    );
  }

  if (state.status === 'error') {
    return (
      <View
        style={[
          styles.centered,
          contentInsets,
          { backgroundColor: theme.colors.background },
        ]}
        testID="wardrobe-load-error">
        <AppText accessibilityRole="header" variant="title">
          {copy.loadErrorTitle}
        </AppText>
        <AppText colorRole="textSecondary">{copy.loadErrorBody}</AppText>
        <Button label={copy.retryAction} onPress={onRetry} />
      </View>
    );
  }

  const filteredItems = state.items.filter(
    (item) => item.entryState === entryState,
  );
  const ownedCount = state.items.filter((item) => item.entryState === 'owned').length;
  const wantedCount = state.items.length - ownedCount;
  const emptyTitle = entryState === 'owned'
    ? copy.emptyTitle
    : copy.wantedEmptyTitle;
  const emptyBody = entryState === 'owned'
    ? copy.emptyBody
    : copy.wantedEmptyBody;

  return (
    <View style={[styles.readyScreen, { backgroundColor: theme.colors.background }]}>
      <StretchyHeader
        onHeightChange={setHeaderHeight}
        scrollOffset={scrollOffset}
        testID="wardrobe-stretchy-header">
        <View style={styles.headerRow}>
          <IconButton
            accessibilityLabel={copy.backAction}
            icon={(color) => <Icon color={color} name="chevronLeft" size={20} />}
            onPress={onBack}
            style={styles.backButton}
            testID="wardrobe-back-button"
          />
          <AppText
            accessibilityRole="header"
            style={styles.headerTitle}
            variant="titleLarge">
            {copy.title}
          </AppText>
          <View style={styles.addAction}>
            <Button
              accessibilityHint={copy.addHint}
              label={copy.addAction}
              onPress={onAdd}
              style={styles.addButton}
              testID="wardrobe-add-button"
            />
            <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              pointerEvents="none"
              style={styles.addIcon}>
              <Icon
                color={theme.colors.textOnBrand}
                name="plus"
                size={16}
              />
            </View>
          </View>
        </View>
      </StretchyHeader>

      <Animated.FlatList<WardrobeItem>
        accessibilityLabel={copy.title}
        alwaysBounceVertical
        contentContainerStyle={[
          styles.listContent,
          listContentInsets,
          filteredItems.length === 0 && styles.emptyListContent,
        ]}
        data={filteredItems}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          <View style={styles.listHeader}>
            <View style={styles.filter}>
              {(['owned', 'wanted'] as const).map((value) => {
                const selected = entryState === value;
                const label = value === 'owned' ? copy.ownedLabel : copy.wantedLabel;
                const count = value === 'owned' ? ownedCount : wantedCount;

                return (
                  <Pressable
                    accessible
                    accessibilityLabel={copy.filterCountAccessibilityLabel({ label, count })}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    key={value}
                    onPress={() => setEntryState(value)}
                    style={({ pressed }) => [
                      styles.filterSegment,
                      {
                        backgroundColor: selected
                          ? theme.colors.brandPrimary
                          : theme.colors.surface,
                        borderColor: selected
                          ? theme.colors.brandPrimary
                          : theme.colors.borderSubtle,
                      },
                      pressed && styles.filterPressed,
                    ]}
                    testID={`wardrobe-filter-${value}`}>
                    <AppText
                      colorRole={selected ? 'textOnBrand' : 'textSecondary'}
                      variant="bodyStrong">
                      {label}
                    </AppText>
                    <AppText
                      colorRole={selected ? 'textOnBrand' : 'textSecondary'}
                      variant="bodyStrong">
                      {count}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
            {state.hasRefreshError ? (
              <Surface style={styles.inlineError} variant="muted">
                <AppText accessibilityRole="alert">{copy.loadErrorBody}</AppText>
                <Button label={copy.retryAction} onPress={onRetry} variant="secondary" />
              </Surface>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          <Surface style={styles.emptyCard} variant="elevated">
            <AppText accessibilityRole="header" variant="title">
              {emptyTitle}
            </AppText>
            <AppText colorRole="textSecondary">{emptyBody}</AppText>
            <Button
              accessibilityHint={copy.addHint}
              label={state.items.length === 0 ? copy.emptyAction : copy.addAction}
              onPress={onAdd}
              testID="wardrobe-empty-add-button"
            />
          </Surface>
        }
        onRefresh={onRetry}
        onScroll={scrollHandler}
        progressViewOffset={headerHeight}
        refreshing={state.isRefreshing}
        renderItem={({ item }) => (
          <WardrobeListItem
            item={item}
            onPress={() => onEdit(item.id)}
            resolvePhotoUri={resolvePhotoUri}
          />
        )}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        showsVerticalScrollIndicator={false}
        style={[styles.list, { backgroundColor: theme.colors.background }]}
        testID="wardrobe-list"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  readyScreen: {
    flex: 1,
  },
  list: {
    flex: 1,
  },
  centered: {
    alignItems: 'center',
    flex: 1,
    gap: spacing.lg,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  listContent: {
    alignSelf: 'center',
    maxWidth: layout.maxContentWidth,
    width: '100%',
  },
  emptyListContent: {
    flexGrow: 1,
  },
  headerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  headerTitle: {
    flex: 1,
    flexShrink: 1,
  },
  backButton: {
    borderRadius: radii.pill,
  },
  addAction: {
    position: 'relative',
  },
  addButton: {
    borderRadius: radii.pill,
    paddingLeft: spacing['2xl'] + spacing.sm,
  },
  addIcon: {
    left: spacing.lg,
    position: 'absolute',
    top: '50%',
    transform: [{ translateY: -8 }],
  },
  listHeader: {
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  filter: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  filterSegment: {
    alignItems: 'center',
    borderRadius: radii.pill,
    borderWidth: borderWidths.subtle,
    flex: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    minHeight: layout.minimumTouchTarget,
    paddingHorizontal: spacing.md,
  },
  filterPressed: {
    opacity: interaction.pressedOpacity,
  },
  inlineError: {
    gap: spacing.md,
    padding: spacing.lg,
  },
  emptyCard: {
    gap: spacing.lg,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  itemCard: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: layout.minimumTouchTarget,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  itemCopy: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0,
  },
  itemCaption: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  itemCaptionCopy: {
    flexShrink: 1,
  },
  colorSwatch: {
    borderRadius: radii.pill,
    borderWidth: borderWidths.subtle,
    height: spacing.md,
    width: spacing.md,
  },
  separator: {
    height: spacing.md,
  },
  thumbnail: {
    borderRadius: radii.control,
    height: 56,
    width: 56,
  },
});
