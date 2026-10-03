import type { Href } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
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
  GarmentDrawing,
  GarmentTileArtwork,
  Icon,
  Surface,
  useTextScaling,
} from '@/components/ui';
import { EmptyStateArt } from '@/components/ui/empty-state-art';
import { useErrorAnnouncement } from '@/components/ui/use-error-announcement';
import { getGarmentType } from '@/features/catalog/domain/garment-catalog';
import {
  structuralCategories,
  type StructuralCategory,
} from '@/features/catalog/domain/garment-taxonomy';
import {
  resolveDefaultClosetCategory,
  splitClosetByEntryState,
  summarizeClosetCategories,
} from '@/features/wardrobe/application/closet-categories';
import type { WardrobeApplicationState } from '@/features/wardrobe/application/wardrobe-application-controller';
import type { WardrobeEntryState, WardrobeItem } from '@/features/wardrobe/domain/wardrobe-item';
import { CATEGORY_REPRESENTATIVE_TYPE } from '@/features/wardrobe/presentation/category-representative-type';
import {
  categoryTabListRole,
  WardrobeCategoryChip,
} from '@/features/wardrobe/presentation/wardrobe-category-chip';
import {
  WardrobeGridTile,
  type WardrobeGridTileGeometry,
} from '@/features/wardrobe/presentation/wardrobe-grid-tile';
import { useMessages } from '@/localization/use-messages';
import { useEasierToSee } from '@/theme/easier-to-see';
import { radii, spacing } from '@/theme/theme';
import { PlateView } from '@/theme/plate-theme';
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
  /** The categories shown as tabs, in order; the route derives them from the profile and records. */
  categories?: readonly StructuralCategory[];
  /** The category to show; the route owns it, so it survives the add flow. */
  initialCategory?: StructuralCategory;
  /** Bring the Wanted section into view, for Profile's Wanted row and a saved wanted piece. */
  revealWanted?: boolean;
  /** The item the add flow has just saved, so only that tile arrives. */
  savedItemId?: string | null;
  onAdd: (category: StructuralCategory) => void;
  /** The edit form a tile opens; the route owns the path. */
  itemHref: (id: string) => Href;
  /** Runs before a tile's link navigates; preventing the event keeps the Closet in place. */
  onItemPress?: (event: Readonly<{ preventDefault: () => void }>) => void;
  onCategoryChange?: (category: StructuralCategory) => void;
  /**
   * The category on screen once the list is ready, including the one it resolved itself when
   * the route carried none, so the route's plus button can start the add flow on it.
   */
  onCategoryInView?: (category: StructuralCategory) => void;
  onRetry: (source: WardrobeRetrySource) => void;
  /** O10: Undo on the saved confirmation; rejects when the removal failed. */
  onUndoSaved?: (id: string) => Promise<void>;
  resolvePhotoUri?: (relativePath: string | null) => string | null;
  /** False while the push onto the Closet is still moving: the tiles arrive once it lands. */
  transitionLanded?: boolean;
  /** Each owned piece's worn days from History, by item id. */
  wornCounts?: ReadonlyMap<string, number>;
}>;

// Three columns of 174.5 by 218 proportioned tiles (112 by 140 on the 393 point reference
// screen), two at the largest standard text sizes, where a two-line `label` needs the width.
// The width is derived from the window so a 375 point device does not clip the right column
// and a 440 point one does not leave a gutter.
const GRID_GAP = spacing.md;
const GRID_INSET = spacing.lg;
const TILE_ASPECT = 218 / 174.5;
const LOADING_TILE_COUNT = 6;
// An empty category page shows the category's own piece, faded, over its sentence.
const EMPTY_DRAWING_SIZE = 72;
// Where the revealed Wanted heading lands, as a fraction of the viewport, so it clears the
// collapsed navigation bar whatever the content inset.
const REVEAL_VIEW_POSITION = 0.25;
// The saved confirmation's thumbnail: the 44 target size, drawn like the tile it names.
const SAVED_TILE_SIZE = 44;
const SAVED_TILE_RADIUS = 10;

export function resolveGridGeometry(
  windowWidth: number,
  numColumns: number,
): WardrobeGridTileGeometry {
  const width = (windowWidth - GRID_INSET * 2 - GRID_GAP * (numColumns - 1)) / numColumns;
  return { height: width * TILE_ASPECT, width };
}

export type ClosetRow =
  | Readonly<{ kind: 'section'; entryState: WardrobeEntryState; count: number; afterOwned: boolean }>
  | Readonly<{ kind: 'tiles'; key: string; items: readonly WardrobeItem[]; firstIndex: number }>;

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
  const split = splitClosetByEntryState(items.filter((item) => item.category === category));
  const sections = (['owned', 'wanted'] as const)
    .map((entryState) => ({ entryState, items: split[entryState] }))
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
      // Keyed by place, not by the pieces it holds, so a delete or a category switch
      // refills the rows already on screen instead of mounting new ones.
      rows.push({
        kind: 'tiles',
        key: `${section.entryState}-${start}`,
        items: section.items.slice(start, start + numColumns),
        firstIndex: index + start,
      });
    }
    index += section.items.length;
  }
  return rows;
}

/**
 * Law 7, "content arrives": opening the Closet is an arrival, so the tiles of its first
 * render enter in reading order. A tile mounting later (scrolled into view, or refilled
 * after a delete) is not news and is drawn at rest. Returning from a save is not an
 * arrival either; only the saved item is news, so it alone enters. Motion is not the only
 * indication either way, since the item's own presence in the list is.
 *
 * Returns the tile's place in the stagger, or `null` when it must be drawn at rest.
 */
export function tileEntranceIndex(
  itemId: string,
  index: number,
  savedItemId: string | null | undefined,
  firstRender: boolean,
): number | null {
  if (savedItemId) {
    return itemId === savedItemId ? 0 : null;
  }
  return firstRender ? index : null;
}

/** A grid place whose arrival is settled when it mounts, so its wrapper never swaps. */
function TileSlot({ children, entranceIndex, waiting }: Readonly<{
  children: ReactNode;
  entranceIndex: number | null;
  waiting: boolean;
}>) {
  const [mountedIndex] = useState(entranceIndex);
  return mountedIndex === null
    ? <View>{children}</View>
    : <Entrance index={mountedIndex} waiting={waiting}>{children}</Entrance>;
}

export function WardrobeListScreen({
  categories = structuralCategories,
  initialCategory,
  onAdd,
  onCategoryChange = () => undefined,
  itemHref,
  onCategoryInView,
  onItemPress,
  onRetry,
  onUndoSaved = async () => undefined,
  resolvePhotoUri = () => null,
  revealWanted = false,
  savedItemId = null,
  state,
  transitionLanded = true,
  wornCounts,
}: WardrobeListScreenProps) {
  const insets = useSafeAreaInsets();
  const messages = useMessages();
  const theme = useKuyaraTheme();
  const { usesTwoColumnGrid } = useTextScaling();
  // O13: Easier to see keeps the Closet at two columns, whose tiles hold
  // the 1.3 times larger drawings.
  const easierToSee = useEasierToSee();
  const { width: windowWidth } = useWindowDimensions();
  const copy = messages.wardrobe;
  const listRef = useRef<FlatList<ClosetRow>>(null);
  const stripRef = useRef<ScrollView>(null);
  const tabOffsets = useRef<Partial<Record<StructuralCategory, number>>>({});
  const revealHandled = useRef(false);
  // Read once, at the mount the add flow returned to. Later it must not change: a tile
  // already on screen would swap its wrapper and remount for nothing, and a screen that
  // was never torn down needs no help anyway, since the saved item is the only tile
  // mounting and the ones around it have long since entered.
  const [arrivingItemId] = useState<string | null>(savedItemId);
  // True only for the list's first ready render, whose tiles make the Closet's arrival.
  const [firstRender, setFirstRender] = useState(true);
  const [undoStatus, setUndoStatus] = useState<'idle' | 'pending' | 'failed'>('idle');
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
  const numColumns = usesTwoColumnGrid || easierToSee ? 2 : 3;
  const geometry = resolveGridGeometry(windowWidth - insets.left - insets.right, numColumns);
  const items = state.status === 'ready' ? state.items : [];
  const category =
    selectedCategory && categories.includes(selectedCategory)
      ? selectedCategory
      : resolveDefaultClosetCategory(items, revealWanted, categories);
  const rows = state.status === 'ready' ? buildCategoryRows(items, category, numColumns) : [];
  const summaries = summarizeClosetCategories(items);
  const wantedRowIndex = rows.findIndex(
    (row) => row.kind === 'section' && row.entryState === 'wanted',
  );

  const listReady = state.status === 'ready';
  // The window closes a frame after the first ready commit, before the list renders the
  // rows it adds on scroll.
  useEffect(() => {
    if (!listReady) return;
    const frame = requestAnimationFrame(() => setFirstRender(false));
    return () => cancelAnimationFrame(frame);
  }, [listReady]);
  useEffect(() => {
    if (listReady) onCategoryInView?.(category);
  }, [category, listReady, onCategoryInView]);

  // Keep the selected tab in view, for a category opened from Profile's cells as much as
  // for one picked off the strip's edge.
  useEffect(() => {
    const offset = tabOffsets.current[category];
    if (offset !== undefined) {
      stripRef.current?.scrollTo({ animated: true, x: Math.max(0, offset - spacing.lg) });
    }
  }, [category]);

  // Profile's Wanted row and a saved wanted piece open on the Wanted section, once per
  // request from the route, and only when owned rows would otherwise push it down. The
  // request is one mount (a saved piece remounts the list, and Profile's Wanted row opens a
  // new one): `filter=wanted` stays in the route params after it, so a tab switch, which
  // only swaps `category`, must not be read as another request.
  useEffect(() => {
    if (!revealWanted || !listReady || revealHandled.current) return;
    revealHandled.current = true;
    if (wantedRowIndex <= 0) return;
    const frame = requestAnimationFrame(() => {
      listRef.current?.scrollToIndex({
        animated: false,
        index: wantedRowIndex,
        viewPosition: REVEAL_VIEW_POSITION,
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [revealWanted, listReady, wantedRowIndex]);

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

  // O10: the piece the add flow saved is named above the grid, with Undo, while it is on
  // this page. Undo removes it like Delete does; the row leaves with the piece.
  const savedItem = arrivingItemId
    ? items.find((item) => item.id === arrivingItemId && item.category === category) ?? null
    : null;
  // VoiceOver ignores the alert role on these lines, so iOS also speaks them.
  useErrorAnnouncement(savedItem && undoStatus === 'failed' ? copy.deleteError : null);
  // A failure already persisted when the screen opened was spoken when it happened, also when
  // the screen opened while loading and the failure arrived with the list.
  useErrorAnnouncement(
    state.status === 'loading' ? undefined
      : state.status === 'ready' && state.refreshFailure !== null ? copy.loadErrorBody : null,
    { skipInitial: true },
  );

  if (state.status === 'loading') {
    return (
      <View
        accessibilityLabel={copy.loadingLabel}
        accessibilityRole="progressbar"
        accessible
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
                { backgroundColor: theme.colors.garmentTile },
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

  const savedItemType = savedItem?.garmentTypeId ? getGarmentType(savedItem.garmentTypeId) : null;
  const savedPieceName = savedItem
    ? savedItem.name
      ?? (savedItemType
        ? messages.catalog[savedItemType.nameKey]
        : messages.catalog[`catalog.attribute.structural_category.${savedItem.category}`])
    : '';
  const undoSaved = (id: string) => {
    setUndoStatus('pending');
    onUndoSaved(id).then(
      () => setUndoStatus('idle'),
      () => setUndoStatus('failed'),
    );
  };

  const selectCategory = (next: StructuralCategory) => {
    setSelectedCategory(next);
    onCategoryChange(next);
  };

  const renderTile = (item: WardrobeItem, index: number, column: number) => (
    <TileSlot
      entranceIndex={tileEntranceIndex(item.id, index, arrivingItemId, firstRender)}
      key={column}
      waiting={!transitionLanded}>
      <WardrobeGridTile
        geometry={geometry}
        item={item}
        key={item.id}
        messages={messages}
        highlighted={item.id === savedItem?.id}
        href={itemHref(item.id)}
        onPress={onItemPress}
        resolvePhotoUri={resolvePhotoUri}
        testID={`wardrobe-item-${item.id}`}
        wornCount={wornCounts?.get(item.id)}
      />
    </TileSlot>
  );

  return (
    <FlatList<ClosetRow>
      accessibilityLabel={copy.title}
      // Five viewports keep nearby tiles; five initial rows cap first-render artwork.
      windowSize={5}
      initialNumToRender={5}
      contentContainerStyle={[contentInsets, styles.listContent]}
      contentInsetAdjustmentBehavior="automatic"
      data={rows}
      key={numColumns}
      keyExtractor={(row) =>
        row.kind === 'section' ? `section-${row.entryState}` : row.key
      }
      ListEmptyComponent={
        <View style={styles.empty} testID="wardrobe-empty">
          <EmptyStateArt testID="wardrobe-empty-art">
            <GarmentDrawing
              category={category}
              garmentTypeId={CATEGORY_REPRESENTATIVE_TYPE[category]}
              size={EMPTY_DRAWING_SIZE}
              testID="wardrobe-empty-drawing"
            />
          </EmptyStateArt>
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
            accessibilityRole={categoryTabListRole()}
            contentContainerStyle={styles.strip}
            horizontal
            ref={stripRef}
            showsHorizontalScrollIndicator={false}
            style={styles.stripBleed}
            testID="wardrobe-category-tabs">
            {categories.map((tabCategory) => {
              const summary = summaries[tabCategory];
              const label = copy.categoryFilterLabels[tabCategory];
              return (
                <WardrobeCategoryChip
                  accessibilityLabel={copy.categoryAccessibilityLabel({
                    category: label,
                    count: summary.count,
                    wanted: summary.wanted,
                  })}
                  category={tabCategory}
                  count={summary.count}
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
          {savedItem ? (
            <Surface style={styles.saved} testID="wardrobe-saved-confirmation">
              <PlateView
                accessibilityElementsHidden
                color={theme.colors.garmentTile}
                importantForAccessibility="no-hide-descendants"
                style={styles.savedTile}>
                <GarmentTileArtwork
                  category={savedItem.category}
                  colorFamily={savedItem.colorFamily}
                  garmentTypeId={savedItem.garmentTypeId}
                  glyphSize={SAVED_TILE_SIZE / 2}
                  height={SAVED_TILE_SIZE}
                  photoTestID="wardrobe-saved-photo"
                  photoUri={resolvePhotoUri(savedItem.photoRelativePath)}
                  placeholderTestID="wardrobe-saved-glyph"
                  silhouetteTestID="wardrobe-saved-drawing"
                  wanted={savedItem.entryState === 'wanted'}
                  width={SAVED_TILE_SIZE}
                />
              </PlateView>
              <AppText accessibilityLiveRegion="polite" style={styles.savedCopy}>
                {savedItem.entryState === 'wanted'
                  ? copy.savedWantedConfirmation(savedPieceName)
                  : copy.savedOwnedConfirmation(savedPieceName)}
              </AppText>
              <Button
                disabled={undoStatus === 'pending'}
                label={copy.undoAction}
                loading={undoStatus === 'pending'}
                onPress={() => undoSaved(savedItem.id)}
                size="small"
                testID="wardrobe-saved-undo"
                variant="plain"
              />
            </Surface>
          ) : null}
          {savedItem && undoStatus === 'failed' ? (
            <View style={styles.inlineError} testID="wardrobe-undo-error">
              <Icon color={theme.colors.dangerInk} name="error" size={16} />
              <AppText
                accessibilityRole="alert"
                colorRole="dangerInk"
                style={styles.inlineErrorText}
                variant="caption">
                {copy.deleteError}
              </AppText>
            </View>
          ) : null}
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
            {row.items.map((item, offset) => renderTile(item, row.firstIndex + offset, offset))}
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
    borderRadius: radii.imageTile,
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
  // Law 3: a card confirms with radius 20, the 16 inset and the fill step together.
  saved: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.lg,
  },
  savedTile: {
    alignItems: 'center',
    borderRadius: SAVED_TILE_RADIUS,
    height: SAVED_TILE_SIZE,
    justifyContent: 'center',
    overflow: 'hidden',
    width: SAVED_TILE_SIZE,
  },
  savedCopy: {
    flex: 1,
  },
  // An empty category page (ADR 0029 section 4): the faded piece, the sentence and the add
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
