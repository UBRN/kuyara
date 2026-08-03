import { SymbolView } from 'expo-symbols';
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

import { AppText, Button, PhotoPlaceholder, StretchyHeader, Surface } from '@/components/ui';
import { getGarmentType } from '@/features/catalog/domain/garment-catalog';
import type { CatalogMessageKey } from '@/features/catalog/domain/garment-taxonomy';
import type { WardrobeApplicationState } from '@/features/wardrobe/application/wardrobe-application-controller';
import type { WardrobeItem } from '@/features/wardrobe/domain/wardrobe-item';
import { useMessages } from '@/localization/use-messages';
import { layout, radii, spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

type WardrobeListScreenProps = Readonly<{
  state: WardrobeApplicationState;
  onAdd: () => void;
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
  const title = item.name ?? typeLabel;
  const photoUri = resolvePhotoUri(item.photoRelativePath);
  const [unreadablePhotoUri, setUnreadablePhotoUri] = useState<string | null>(null);
  const visiblePhotoUri = photoUri === unreadablePhotoUri ? null : photoUri;

  return (
    <Pressable
      accessibilityHint={messages.wardrobe.itemHint}
      accessibilityLabel={messages.wardrobe.itemAccessibilityLabel({
        name: item.name,
        type: typeLabel,
        category: categoryLabel,
        color: colorLabel,
      })}
      accessibilityRole="button"
      onPress={onPress}
      testID={`wardrobe-item-${item.id}`}>
      {({ pressed }) => (
        <Surface
          style={[
            styles.itemCard,
            pressed && { borderColor: theme.colors.borderStrong },
          ]}
          variant="interactive">
          {visiblePhotoUri ? (
            <Image
              accessible
              accessibilityLabel={messages.wardrobe.photoAccessibilityLabel(typeLabel)}
              onError={() => setUnreadablePhotoUri(visiblePhotoUri)}
              resizeMode="cover"
              source={{ uri: visiblePhotoUri }}
              style={[styles.thumbnail, { backgroundColor: theme.colors.surfaceMuted }]}
              testID={`wardrobe-photo-${item.id}`}
            />
          ) : (
            <PhotoPlaceholder
              borderRadius={radii.compact}
              height={56}
              label={messages.wardrobe.photoTitle}
              testID={`wardrobe-photo-placeholder-${item.id}`}
              width={56}
            />
          )}
          <View style={styles.itemCopy}>
            <AppText variant="bodyStrong">{title}</AppText>
            {item.name ? (
              <AppText colorRole="textSecondary">{typeLabel}</AppText>
            ) : null}
            <AppText colorRole="textSecondary" variant="caption">
              {[categoryLabel, colorLabel].filter(Boolean).join(' · ')}
            </AppText>
          </View>
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <SymbolView
              name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
              size={20}
              tintColor={theme.colors.iconSecondary}
            />
          </View>
        </Surface>
      )}
    </Pressable>
  );
}

export function WardrobeListScreen({
  onAdd,
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

  return (
    <View style={[styles.readyScreen, { backgroundColor: theme.colors.background }]}>
      <StretchyHeader
        contentContainerStyle={styles.header}
        onHeightChange={setHeaderHeight}
        scrollOffset={scrollOffset}
        testID="wardrobe-stretchy-header">
        <AppText accessibilityRole="header" variant="titleLarge">
          {copy.title}
        </AppText>
        {state.items.length > 0 ? (
          <Button
            accessibilityHint={copy.addHint}
            label={copy.addAction}
            onPress={onAdd}
            style={styles.addButton}
            testID="wardrobe-add-button"
          />
        ) : null}
      </StretchyHeader>

      <Animated.FlatList<WardrobeItem>
        accessibilityLabel={copy.title}
        alwaysBounceVertical
        contentContainerStyle={[
          styles.listContent,
          listContentInsets,
          state.items.length === 0 && styles.emptyListContent,
        ]}
        data={state.items}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          state.hasRefreshError ? (
            <Surface style={[styles.inlineError, styles.listHeader]} variant="muted">
              <AppText accessibilityRole="alert">{copy.loadErrorBody}</AppText>
              <Button label={copy.retryAction} onPress={onRetry} variant="secondary" />
            </Surface>
          ) : null
        }
        ListEmptyComponent={
          <Surface style={styles.emptyCard} variant="elevated">
            <AppText accessibilityRole="header" variant="title">
              {copy.emptyTitle}
            </AppText>
            <AppText colorRole="textSecondary">{copy.emptyBody}</AppText>
            <Button
              accessibilityHint={copy.addHint}
              label={copy.emptyAction}
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
  header: {
    gap: spacing.lg,
  },
  addButton: {
    alignSelf: 'flex-start',
    borderRadius: radii.pill,
  },
  listHeader: {
    marginBottom: spacing.md,
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
    padding: spacing.lg,
  },
  itemCopy: {
    flex: 1,
    gap: spacing.xs,
  },
  separator: {
    height: spacing.md,
  },
  thumbnail: {
    borderRadius: radii.compact,
    height: 56,
    width: 56,
  },
});
