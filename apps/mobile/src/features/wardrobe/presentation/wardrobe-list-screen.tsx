import { useState } from 'react';
import { FlatList, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  AppText,
  Button,
  Icon,
  SegmentedControl,
  useTextScaling,
  type SegmentedControlOption,
} from '@/components/ui';
import {
  structuralCategories,
  type StructuralCategory,
} from '@/features/catalog/domain/garment-taxonomy';
import type { WardrobeApplicationState } from '@/features/wardrobe/application/wardrobe-application-controller';
import type { WardrobeEntryState, WardrobeItem } from '@/features/wardrobe/domain/wardrobe-item';
import { WardrobeCategoryChip } from '@/features/wardrobe/presentation/wardrobe-category-chip';
import {
  WardrobeGridTile,
  type WardrobeGridTileGeometry,
} from '@/features/wardrobe/presentation/wardrobe-grid-tile';
import { useMessages } from '@/localization/use-messages';
import { spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

// ADR 0029, the Closet grid. This replaces the vertical card list: the faked
// leading-icon button, the enum-as-CSS-colour swatch and the ADR 0005-contradicting
// empty copy all close with this screen (ADR 0029 consequences). The native large
// title, the native back to Profile and the plus bar button are the route's job
// (`app/(tabs)/(profile)/wardrobe/index.tsx`), exactly as Profile's chrome is set in
// its own route file rather than here.

type WardrobeListScreenProps = Readonly<{
  state: WardrobeApplicationState;
  initialEntryState?: WardrobeEntryState;
  onAdd: () => void;
  onEdit: (id: string) => void;
  onRetry: () => void;
  resolvePhotoUri?: (relativePath: string | null) => string | null;
}>;

// Section 1: a two-column grid of 174.5 by 218 tiles, one column of 361 by 280 above
// `fontScale` 1.5 (ADR 0028 section 3's stacked-layout threshold). Those are the numbers
// on the ADR's 393 point reference screen; the width is derived from the window so a 375
// point device does not clip the right column and a 440 point one does not leave a gutter.
const GRID_GAP = spacing.md;
const GRID_INSET = spacing.lg;
const TWO_COLUMN_ASPECT = 218 / 174.5;
const ONE_COLUMN_ASPECT = 280 / 361;

export function resolveGridGeometry(
  windowWidth: number,
  usesStackedLayout: boolean,
): Readonly<{ geometry: WardrobeGridTileGeometry; numColumns: number }> {
  const contentWidth = windowWidth - GRID_INSET * 2;
  if (usesStackedLayout) {
    return { geometry: { height: contentWidth * ONE_COLUMN_ASPECT, width: contentWidth }, numColumns: 1 };
  }
  const width = (contentWidth - GRID_GAP) / 2;
  return { geometry: { height: width * TWO_COLUMN_ASPECT, width }, numColumns: 2 };
}
const LOADING_TILE_COUNT = 6;

type CategoryFilter = StructuralCategory | 'all';


export function WardrobeListScreen({
  initialEntryState = 'owned',
  onAdd,
  onEdit,
  onRetry,
  resolvePhotoUri = () => null,
  state,
}: WardrobeListScreenProps) {
  const insets = useSafeAreaInsets();
  const messages = useMessages();
  const theme = useKuyaraTheme();
  const { usesStackedLayout } = useTextScaling();
  const { width: windowWidth } = useWindowDimensions();
  const copy = messages.wardrobe;
  const [entryState, setEntryState] = useState<WardrobeEntryState>(initialEntryState);
  const [selectedCategory, setSelectedCategory] = useState<CategoryFilter>('all');
  // The refresh control shows only for a pull. The route also refreshes on focus, and a
  // `refreshing` flag that flips during that background refresh leaves the native control
  // visible under the large title until the next scroll.
  const [isPulling, setIsPulling] = useState(false);
  const isRefreshing = state.status === 'ready' && state.isRefreshing;
  if (isPulling && !isRefreshing) {
    // The pull has finished: derive the reset during render rather than in an effect.
    setIsPulling(false);
  }
  const { geometry, numColumns } = resolveGridGeometry(windowWidth, usesStackedLayout);

  const horizontalPadding = spacing.lg;
  const contentInsets = {
    paddingBottom: insets.bottom + spacing['2xl'],
    paddingLeft: insets.left + horizontalPadding,
    paddingRight: insets.right + horizontalPadding,
  };
  // The loading and error states are plain views, not scroll views, so they get none
  // of `contentInsetAdjustmentBehavior="automatic"`'s help clearing the native large
  // title; the ready-state FlatList below relies on that prop instead and carries no
  // manual top inset of its own.
  const staticTopInset = { paddingTop: insets.top + spacing.lg };

  if (state.status === 'loading') {
    return (
      <View
        accessibilityLabel={copy.loadingLabel}
        accessibilityRole="progressbar"
        style={[
          styles.centered,
          contentInsets,
          staticTopInset,
          { backgroundColor: theme.colors.background },
        ]}
        testID="wardrobe-loading">
        <View style={[styles.grid, { gap: GRID_GAP }]}>
          {Array.from({ length: LOADING_TILE_COUNT }, (_, index) => (
            <View
              key={index}
              style={[
                styles.loadingTile,
                geometry,
                { backgroundColor: theme.colors.surfaceMuted },
              ]}
            />
          ))}
        </View>
      </View>
    );
  }

  if (state.status === 'error') {
    return (
      <View
        style={[
          styles.centered,
          contentInsets,
          staticTopInset,
          { backgroundColor: theme.colors.background },
        ]}
        testID="wardrobe-load-error">
        <Icon color={theme.colors.dangerInk} name="error" size={20} />
        <AppText accessibilityRole="header" style={styles.errorTitle} variant="bodyStrong">
          {copy.loadErrorTitle}
        </AppText>
        <AppText colorRole="textSecondary" style={styles.errorBody}>
          {copy.loadErrorBody}
        </AppText>
        <Button
          label={copy.retryAction}
          onPress={onRetry}
          style={styles.errorRetry}
          testID="wardrobe-retry-button"
        />
      </View>
    );
  }

  const entryItems = state.items.filter((item) => item.entryState === entryState);
  const categories = structuralCategories.filter((category) =>
    entryItems.some((item) => item.category === category),
  );
  // Guards against a stale selection surviving a segment switch or a refresh that
  // removed the only item of the selected category, without a dedicated effect: the
  // grid always falls back to "All" the moment the raw selection is no longer present.
  const effectiveCategory: CategoryFilter =
    selectedCategory !== 'all' && categories.some((category) => category === selectedCategory)
      ? selectedCategory
      : 'all';
  const filteredItems =
    effectiveCategory === 'all'
      ? entryItems
      : entryItems.filter((item) => item.category === effectiveCategory);

  const segmentOptions: readonly SegmentedControlOption<WardrobeEntryState>[] = [
    { label: copy.ownedLabel, value: 'owned' },
    { label: copy.wantedLabel, value: 'wanted' },
  ];

  return (
    <FlatList<WardrobeItem>
      accessibilityLabel={copy.title}
      columnWrapperStyle={numColumns > 1 ? styles.columnWrapper : undefined}
      contentContainerStyle={[contentInsets, styles.listContent]}
      contentInsetAdjustmentBehavior="automatic"
      data={filteredItems}
      key={numColumns}
      keyExtractor={(item) => item.id}
      ListEmptyComponent={
        <View style={styles.empty} testID="wardrobe-empty">
          <AppText colorRole="textSecondary">{messages.profile.wardrobeEmpty}</AppText>
          <Button
            label={messages.profile.addPieceAction}
            onPress={onAdd}
            testID="wardrobe-empty-add-button"
          />
        </View>
      }
      ListHeaderComponent={
        <View style={styles.listHeader}>
          <SegmentedControl
            onChange={setEntryState}
            options={segmentOptions}
            testID="wardrobe-entry-filter"
            value={entryState}
          />
          {state.hasRefreshError ? (
            <View style={styles.inlineError} testID="wardrobe-refresh-error">
              <Icon color={theme.colors.dangerInk} name="error" size={16} />
              <AppText
                accessibilityRole="alert"
                colorRole="textSecondary"
                style={styles.inlineErrorText}
                variant="caption">
                {copy.loadErrorBody}
              </AppText>
              <Button label={copy.retryAction} onPress={onRetry} variant="secondary" />
            </View>
          ) : null}
          {entryItems.length > 0 ? (
            <ScrollView
              contentContainerStyle={styles.chipRow}
              horizontal
              showsHorizontalScrollIndicator={false}
              testID="wardrobe-category-chips">
              <WardrobeCategoryChip
                label={copy.categoryFilterAll}
                onPress={() => setSelectedCategory('all')}
                selected={effectiveCategory === 'all'}
                testID="wardrobe-category-chip-all"
              />
              {categories.map((category) => (
                <WardrobeCategoryChip
                  key={category}
                  label={copy.categoryFilterLabels[category]}
                  onPress={() => setSelectedCategory(category)}
                  selected={effectiveCategory === category}
                  testID={`wardrobe-category-chip-${category}`}
                />
              ))}
            </ScrollView>
          ) : null}
        </View>
      }
      numColumns={numColumns}
      onRefresh={() => {
        setIsPulling(true);
        onRetry();
      }}
      refreshing={isPulling && isRefreshing}
      renderItem={({ item }) => (
        <WardrobeGridTile
          geometry={geometry}
          item={item}
          messages={messages}
          onPress={() => onEdit(item.id)}
          resolvePhotoUri={resolvePhotoUri}
          testID={`wardrobe-item-${item.id}`}
        />
      )}
      showsVerticalScrollIndicator={false}
      style={[styles.list, { backgroundColor: theme.colors.background }]}
      testID="wardrobe-list"
    />
  );
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
  },
  listContent: {
    flexGrow: 1,
    gap: GRID_GAP,
  },
  centered: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
  },
  loadingTile: {
    borderRadius: 14,
  },
  // Error state, section 4: the glyph, 8, a `bodyStrong` title, 4, a `body` line, 12,
  // the retry button. Precise per-gap margins rather than a uniform container gap,
  // because the three gaps are not equal.
  errorTitle: {
    marginTop: spacing.sm,
  },
  errorBody: {
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  errorRetry: {
    marginTop: spacing.md,
  },
  listHeader: {
    // Section 2: the segmented control sits 4 above and 12 below.
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  inlineError: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  inlineErrorText: {
    flex: 1,
  },
  chipRow: {
    gap: spacing.sm,
  },
  // ADR 0029 section 4 reuses Profile's empty state: the sentence and the button sit at
  // the top of the content, directly under the control, not centred in the leftover space.
  empty: {
    gap: spacing.md,
  },
  columnWrapper: {
    gap: GRID_GAP,
  },
});
