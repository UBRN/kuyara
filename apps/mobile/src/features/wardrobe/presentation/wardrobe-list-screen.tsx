import { useEffect, useRef, useState } from 'react';
import {
  FlatList,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  AppText,
  Button,
  Entrance,
  Icon,
  useTextScaling,
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

// ADR 0029, the Closet by category (O9): the six catalogue categories sit side by side in a
// horizontal tab strip, and the selected category scrolls vertically on its own, with owned
// and wanted pieces as two sections of one page. The native large title, the native back to
// Profile and the plus bar button are the route's job
// (`app/(tabs)/(profile)/wardrobe/index.tsx`), exactly as Profile's chrome is set in its own
// route file rather than here. The page is one virtualised list of tile rows under the
// strip, so the verified large-title inset and pull to refresh stay the list's own.

// `source` lets the route (`wardrobe-list-route.tsx`) tell the pull gesture apart from
// either retry button without this screen knowing anything about analytics: taxonomy
// 5.7 routes the pull through `manual_refresh_triggered` and both retry buttons through
// `retry_after_failure_triggered`.
export type WardrobeRetrySource = 'pull' | 'retry_button';

type WardrobeListScreenProps = Readonly<{
  state: WardrobeApplicationState;
  /** The category to show; the route owns it, so it survives the add flow. */
  initialCategory?: StructuralCategory;
  /** Bring the Wanted section into view, for Profile's Wanted row and a saved wanted piece. */
  revealWanted?: boolean;
  /** The item the add flow has just saved, so only that tile arrives. */
  savedItemId?: string | null;
  onAdd: (category: StructuralCategory) => void;
  onEdit: (id: string) => void;
  onCategoryChange?: (category: StructuralCategory) => void;
  onRetry: (source: WardrobeRetrySource) => void;
  resolvePhotoUri?: (relativePath: string | null) => string | null;
}>;

// Three columns of 174.5 by 218 proportioned tiles (112 by 140 on the 393 point reference
// screen), two at the largest standard text sizes, where a two-line `label` needs the width.
// The width is derived from the window so a 375 point device does not clip the right column
// and a 440 point one does not leave a gutter.
const GRID_GAP = spacing.md;
const GRID_INSET = spacing.lg;
const TILE_ASPECT = 218 / 174.5;
const LOADING_TILE_COUNT = 6;
// Law 6: a standalone glyph over the empty sentence.
const EMPTY_GLYPH_SIZE = 44;
// Where the revealed Wanted heading lands, as a fraction of the viewport, so it clears the
// collapsed navigation bar whatever the content inset.
const REVEAL_VIEW_POSITION = 0.25;

export function resolveGridGeometry(
  windowWidth: number,
  numColumns: number,
): WardrobeGridTileGeometry {
  const width = (windowWidth - GRID_INSET * 2 - GRID_GAP * (numColumns - 1)) / numColumns;
  return { height: width * TILE_ASPECT, width };
}

export type ClosetRow =
  | Readonly<{ kind: 'section'; entryState: WardrobeEntryState; count: number; afterOwned: boolean }>
  | Readonly<{ kind: 'tiles'; items: readonly WardrobeItem[]; firstIndex: number }>;

const newestFirst = (items: readonly WardrobeItem[]) =>
  [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

/**
 * One category page: an Owned section, then a Wanted section, each newest first and cut
 * into rows of `numColumns` tiles so the list virtualises by row. An empty category has no
 * rows; the page shows its empty state instead.
 */
export function buildCategoryRows(
  items: readonly WardrobeItem[],
  category: StructuralCategory,
  numColumns: number,
): ClosetRow[] {
  const inCategory = items.filter((item) => item.category === category);
  const sections = (['owned', 'wanted'] as const)
    .map((entryState) => ({
      entryState,
      items: newestFirst(inCategory.filter((item) => item.entryState === entryState)),
    }))
    .filter((section) => section.items.length > 0);
  const rows: ClosetRow[] = [];
  let index = 0;
  for (const section of sections) {
    rows.push({
      kind: 'section',
      entryState: section.entryState,
      count: section.items.length,
      afterOwned: section.entryState === 'wanted' && rows.length > 0,
    });
    for (let start = 0; start < section.items.length; start += numColumns) {
      rows.push({ kind: 'tiles', items: section.items.slice(start, start + numColumns), firstIndex: index + start });
    }
    index += section.items.length;
  }
  return rows;
}

/**
 * The category a Closet opens on without one requested: the first, in catalogue order, that
 * holds a wanted piece when the Wanted section is asked for (Profile's Wanted row), else the
 * first that holds anything, else the first category.
 */
export function resolveDefaultCategory(
  items: readonly WardrobeItem[],
  revealWanted: boolean,
): StructuralCategory {
  const holds = (predicate: (item: WardrobeItem) => boolean) =>
    structuralCategories.find((category) =>
      items.some((item) => item.category === category && predicate(item)),
    );
  return (
    (revealWanted ? holds((item) => item.entryState === 'wanted') : undefined)
    ?? holds(() => true)
    ?? structuralCategories[0]
  );
}

/**
 * Law 7, "content arrives": opening the Closet is an arrival, so every tile enters in
 * reading order. Returning from a save is not; the grid is already known and only the
 * saved item is news, so it alone enters and the rest are drawn at rest. Motion is not
 * the only indication either way, since the item's own presence in the list is.
 *
 * Returns the tile's place in the stagger, or `null` when it must be drawn at rest.
 */
export function tileEntranceIndex(
  itemId: string,
  index: number,
  savedItemId: string | null | undefined,
): number | null {
  if (!savedItemId) {
    return index;
  }
  return itemId === savedItemId ? 0 : null;
}

export function WardrobeListScreen({
  initialCategory,
  onAdd,
  onCategoryChange = () => undefined,
  onEdit,
  onRetry,
  resolvePhotoUri = () => null,
  revealWanted = false,
  savedItemId = null,
  state,
}: WardrobeListScreenProps) {
  const insets = useSafeAreaInsets();
  const messages = useMessages();
  const theme = useKuyaraTheme();
  const { usesTwoColumnGrid } = useTextScaling();
  const { width: windowWidth } = useWindowDimensions();
  const copy = messages.wardrobe;
  const listRef = useRef<FlatList<ClosetRow>>(null);
  const stripRef = useRef<ScrollView>(null);
  const tabOffsets = useRef<Partial<Record<StructuralCategory, number>>>({});
  const revealedKey = useRef<string | null>(null);
  // Read once, at the mount the add flow returned to. Later it must not change: a tile
  // already on screen would swap its wrapper and remount for nothing, and a screen that
  // was never torn down needs no help anyway, since the saved item is the only tile
  // mounting and the ones around it have long since entered.
  const [arrivingItemId] = useState<string | null>(savedItemId);
  const [selectedCategory, setSelectedCategory] = useState<StructuralCategory | null>(
    initialCategory ?? null,
  );
  const [routeCategory, setRouteCategory] = useState<StructuralCategory | undefined>(initialCategory);
  if (routeCategory !== initialCategory) {
    // The route owns the category, so a return from the add flow reselects it whether or
    // not the navigator remounted this screen. Derived during render rather than through
    // an effect that would render the wrong category first.
    setRouteCategory(initialCategory);
    if (initialCategory) setSelectedCategory(initialCategory);
  }
  // The refresh control shows only for a pull. The route also refreshes on focus, and a
  // `refreshing` flag that flips during that background refresh leaves the native control
  // visible under the large title until the next scroll.
  const [isPulling, setIsPulling] = useState(false);
  const isRefreshing = state.status === 'ready' && state.isRefreshing;
  if (isPulling && !isRefreshing) {
    // The pull has finished: derive the reset during render rather than in an effect.
    setIsPulling(false);
  }
  const numColumns = usesTwoColumnGrid ? 2 : 3;
  const geometry = resolveGridGeometry(windowWidth - insets.left - insets.right, numColumns);
  const items = state.status === 'ready' ? state.items : [];
  const category = selectedCategory ?? resolveDefaultCategory(items, revealWanted);
  const rows = state.status === 'ready' ? buildCategoryRows(items, category, numColumns) : [];
  const wantedRowIndex = rows.findIndex(
    (row) => row.kind === 'section' && row.entryState === 'wanted',
  );

  // Keep the selected tab in view, for a category opened from Profile's cells as much as
  // for one picked off the strip's edge.
  useEffect(() => {
    const offset = tabOffsets.current[category];
    if (offset !== undefined) {
      stripRef.current?.scrollTo({ animated: true, x: Math.max(0, offset - spacing.lg) });
    }
  }, [category]);

  // Profile's Wanted row and a saved wanted piece open on the Wanted section, once per
  // request from the route (a tab switch is not one), and only when owned rows would
  // otherwise push it down.
  const revealKey = revealWanted && wantedRowIndex > 0
    ? `${initialCategory ?? ''}:${savedItemId ?? ''}`
    : null;
  useEffect(() => {
    if (revealKey === null || revealedKey.current === revealKey) return;
    revealedKey.current = revealKey;
    const frame = requestAnimationFrame(() => {
      listRef.current?.scrollToIndex({
        animated: false,
        index: wantedRowIndex,
        viewPosition: REVEAL_VIEW_POSITION,
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [revealKey, wantedRowIndex]);

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
    // ADR 0029 section 4: the error state shows no category tabs.
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
          onPress={() => onRetry('retry_button')}
          style={styles.errorRetry}
          testID="wardrobe-retry-button"
        />
      </View>
    );
  }

  const selectCategory = (next: StructuralCategory) => {
    setSelectedCategory(next);
    onCategoryChange(next);
  };

  const renderTile = (item: WardrobeItem, index: number) => {
    const entranceIndex = tileEntranceIndex(item.id, index, arrivingItemId);
    const tile = (
      <WardrobeGridTile
        geometry={geometry}
        item={item}
        messages={messages}
        onPress={() => onEdit(item.id)}
        resolvePhotoUri={resolvePhotoUri}
        testID={`wardrobe-item-${item.id}`}
      />
    );
    return entranceIndex === null ? (
      <View key={item.id}>{tile}</View>
    ) : (
      <Entrance index={entranceIndex} key={item.id}>{tile}</Entrance>
    );
  };

  return (
    <FlatList<ClosetRow>
      accessibilityLabel={copy.title}
      contentContainerStyle={[contentInsets, styles.listContent]}
      contentInsetAdjustmentBehavior="automatic"
      data={rows}
      key={numColumns}
      keyExtractor={(row) =>
        row.kind === 'section' ? `section-${row.entryState}` : row.items.map((item) => item.id).join(':')
      }
      ListEmptyComponent={
        <View style={styles.empty} testID="wardrobe-empty">
          <Icon color={theme.colors.iconSecondary} name="hanger" size={EMPTY_GLYPH_SIZE} />
          <AppText style={styles.emptyCopy}>{copy.categoryEmpty[category]}</AppText>
          {/* No accent fill here: the selected tab already holds the viewport's one. */}
          <Button
            icon="plus"
            label={messages.profile.addPieceAction}
            onPress={() => onAdd(category)}
            testID="wardrobe-empty-add-button"
            variant="tonal"
          />
        </View>
      }
      ListHeaderComponent={
        <View style={styles.listHeader}>
          <ScrollView
            accessibilityRole="tablist"
            contentContainerStyle={styles.strip}
            horizontal
            ref={stripRef}
            showsHorizontalScrollIndicator={false}
            style={styles.stripBleed}
            testID="wardrobe-category-tabs">
            {structuralCategories.map((tabCategory) => {
              const inTab = items.filter((item) => item.category === tabCategory);
              const label = copy.categoryFilterLabels[tabCategory];
              return (
                <WardrobeCategoryChip
                  accessibilityLabel={copy.categoryAccessibilityLabel({
                    category: label,
                    count: inTab.length,
                    wanted: inTab.filter((item) => item.entryState === 'wanted').length,
                  })}
                  category={tabCategory}
                  count={inTab.length}
                  key={tabCategory}
                  label={label}
                  onLayout={(event) => {
                    // A category opened from Profile may start off the strip's edge.
                    const { x } = event.nativeEvent.layout;
                    tabOffsets.current[tabCategory] = x;
                    if (tabCategory === category && x > windowWidth / 2) {
                      stripRef.current?.scrollTo({ animated: false, x: x - spacing.lg });
                    }
                  }}
                  onPress={() => selectCategory(tabCategory)}
                  role="tab"
                  selected={tabCategory === category}
                  testID={`wardrobe-category-tab-${tabCategory}`}
                />
              );
            })}
          </ScrollView>
          {state.refreshFailure !== null ? (
            <View style={styles.inlineError} testID="wardrobe-refresh-error">
              <Icon color={theme.colors.dangerInk} name="error" size={16} />
              <AppText
                accessibilityRole="alert"
                colorRole="textSecondary"
                style={styles.inlineErrorText}
                variant="caption">
                {copy.loadErrorBody}
              </AppText>
              <Button
                label={copy.retryAction}
                onPress={() => onRetry('retry_button')}
                size="small"
                variant="tonal"
              />
            </View>
          ) : null}
        </View>
      }
      onRefresh={() => {
        setIsPulling(true);
        onRetry('pull');
      }}
      onScrollToIndexFailed={({ averageItemLength, index }) => {
        listRef.current?.scrollToOffset({ animated: false, offset: averageItemLength * index });
      }}
      ref={listRef}
      refreshing={isPulling && isRefreshing}
      renderItem={({ item: row }) => {
        if (row.kind === 'section') {
          const wanted = row.entryState === 'wanted';
          const label = wanted ? copy.wantedLabel : copy.ownedLabel;
          return (
            <View
              accessibilityLabel={`${label}, ${row.count}`}
              accessibilityRole="header"
              accessible
              style={[styles.sectionHeading, row.afterOwned && styles.sectionAfterOwned]}
              testID={`wardrobe-section-${row.entryState}`}>
              {wanted ? <Icon color={theme.colors.iconSecondary} name="heart" size={20} /> : null}
              <AppText colorRole="textSecondary" variant="bodyStrong">
                {label}
              </AppText>
              <AppText colorRole="textSecondary" tabularNumbers>
                {row.count}
              </AppText>
            </View>
          );
        }
        return (
          <View style={styles.tileRow}>
            {row.items.map((item, offset) => renderTile(item, row.firstIndex + offset))}
          </View>
        );
      }}
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
    // The strip sits 4 below the large title and 12 above the page.
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  // The strip bleeds off the right edge, so more categories visibly exist.
  stripBleed: {
    marginHorizontal: -spacing.lg,
  },
  strip: {
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    // The tabs' 2 point hit slop stays inside the scroll view.
    paddingVertical: 2,
  },
  sectionHeading: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  // 24 between the Owned and Wanted sections: the list's 12 gap plus this 12.
  sectionAfterOwned: {
    marginTop: spacing.md,
  },
  tileRow: {
    flexDirection: 'row',
    gap: GRID_GAP,
  },
  inlineError: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  inlineErrorText: {
    flex: 1,
  },
  // An empty category page (ADR 0029 section 4): the hanger, the sentence and the add
  // button, centred under the strip rather than in the leftover space.
  empty: {
    alignItems: 'center',
    gap: spacing.md,
    paddingTop: spacing.xl,
  },
  emptyCopy: {
    textAlign: 'center',
  },
});
