import { useMemo, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedRef, useScrollOffset } from 'react-native-reanimated';

import {
  AppText,
  Button,
  ClosetRack,
  Entrance,
  GarmentDrawing,
  GarmentSlotGlyph,
  Icon,
  ListRow,
  ListRowGroup,
  PressScale,
  Screen,
  useTextScaling,
  type RackPiece,
} from '@/components/ui';
import {
  structuralCategories,
  type StructuralCategory,
} from '@/features/catalog/domain/garment-taxonomy';
import {
  splitClosetByEntryState,
  summarizeClosetCategories,
  type ClosetCategorySummary,
} from '@/features/wardrobe/application/closet-categories';
import { useErrorAnnouncement } from '@/components/ui/use-error-announcement';
import { useWardrobeApplication } from '@/features/wardrobe/application/wardrobe-application-context';
import { TourTarget } from '@/features/walkthrough/application/tour-target';
import type { WardrobeItem } from '@/features/wardrobe/domain/wardrobe-item';
import { useMessages } from '@/localization/use-messages';
import { interaction, layout, plateTheme, radii, spacing } from '@/theme/theme';
import { DarkPlate, PlateView } from '@/theme/plate-theme';
import { useKuyaraTheme } from '@/theme/theme-context';

// ADR 0028 section 1: the Closet is the subject. The native large title and the
// Settings bar button are the route's job (`app/(tabs)/(profile)/profile.tsx`), because
// they are chrome the OS draws, not this screen's content. O9 draws the Closet as an open
// rack (`ClosetRack`) with six category cells under it as its legend.

// A cell is a 64 point stage-fill image tile holding a 48 point drawing and the count.
const CELL_TILE_HEIGHT = 64;
const CELL_ICON_BOX = 48;
const CELL_DRAWING_SIZE = 44;
const CELL_GLYPH_SIZE = 36;
// The tile and its drawing grow with the text up to the largest standard size, no further,
// so two columns of cells still fit beside the title-sized count.
const CELL_SCALE_MAXIMUM = 1.2;

type ProfileScreenProps = Readonly<{
  displayName?: string | null;
  /** The empty Closet's Add a piece opens the add form directly. */
  onAddPiece: () => void;
  onOpenWardrobe: (filter?: 'wanted') => void;
  /** A category cell opens the Closet on that category (O9). */
  onOpenCategory: (category: StructuralCategory) => void;
  onOpenHistory: () => void;
  /** False until the tab is first shown: the content arrives then, not while it is hidden. */
  shown?: boolean;
  /** The account card's place under the title (ADR 0041 section 5); the route decides whether it shows. */
  accountCard?: ReactNode;
  /** The category cells to show, in order; the route derives them from the profile and records. */
  categories?: readonly StructuralCategory[];
}>;

function toRackPiece(item: WardrobeItem): RackPiece {
  return {
    id: item.id,
    garmentTypeId: item.garmentTypeId,
    category: item.category,
    colorFamily: item.colorFamily,
    wanted: item.entryState === 'wanted',
    addedAt: Date.parse(item.createdAt),
  };
}

function chunk<T>(values: readonly T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(values.length / size) }, (_, index) =>
    values.slice(index * size, index * size + size),
  );
}

function CategoryCell({
  category,
  onPress,
  scale,
  summary,
}: Readonly<{
  category: StructuralCategory;
  onPress?: () => void;
  scale: number;
  /** `null` while the Closet loads: the tile shows without a drawing or a count. */
  summary: ClosetCategorySummary | null;
}>) {
  const messages = useMessages();
  const theme = useKuyaraTheme();
  const label = messages.wardrobe.categoryFilterLabels[category];
  const newest = summary?.newest ?? null;
  // Only a category holding pieces stands on the garment plate; an empty or loading one keeps
  // the muted page tile, so in the dark appearance the filled categories and the rack are the
  // light plates and the empty ones stay dark. In light the two fills are the same colour.
  const tileColor = summary && summary.count > 0 ? theme.colors.garmentTile : theme.colors.surfaceMuted;
  const tile = (
    <PlateView
      color={tileColor}
      style={[styles.cellTile, { height: CELL_TILE_HEIGHT * scale }]}
      testID={`profile-category-${category}-tile`}>
      {summary ? (
        <>
          <View style={[styles.cellIcon, { height: CELL_ICON_BOX * scale, width: CELL_ICON_BOX * scale }]}>
            {newest?.garmentTypeId ? (
              <GarmentDrawing
                category={category}
                colorFamily={newest.colorFamily}
                garmentTypeId={newest.garmentTypeId}
                size={CELL_DRAWING_SIZE * scale}
                testID={`profile-category-${category}-drawing`}
              />
            ) : (
              <GarmentSlotGlyph
                category={category}
                color={plateTheme(theme, tileColor).colors.iconSecondary}
                size={CELL_GLYPH_SIZE * scale}
              />
            )}
          </View>
          <AppText
            colorRole={summary.count > 0 ? 'textPrimary' : 'textSecondary'}
            style={styles.cellCount}
            tabularNumbers
            testID={`profile-category-${category}-count`}
            variant="title">
            {summary.count}
          </AppText>
        </>
      ) : null}
    </PlateView>
  );
  const name = (
    <AppText colorRole="textSecondary" variant="caption">
      {label}
    </AppText>
  );

  if (!summary || !onPress) {
    return (
      <View style={styles.cell}>
        {tile}
        {name}
      </View>
    );
  }

  return (
    <PressScale
      accessibilityLabel={messages.wardrobe.categoryAccessibilityLabel({
        category: label,
        count: summary.count,
        wanted: summary.wanted,
      })}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.cell, pressed && styles.pressed]}
      testID={`profile-category-${category}`}>
      {tile}
      {name}
    </PressScale>
  );
}

function CategoryCells({
  categories,
  firstIndex,
  onOpenCategory,
  shown,
  summaries,
}: Readonly<{
  categories: readonly StructuralCategory[];
  /** The first cell's place in the screen's arrival; the cells follow in reading order. */
  firstIndex: number;
  onOpenCategory: (category: StructuralCategory) => void;
  shown: boolean;
  summaries: Readonly<Record<StructuralCategory, ClosetCategorySummary>> | null;
}>) {
  const messages = useMessages();
  const { fontScale, usesTwoColumnGrid } = useTextScaling();
  const scale = Math.min(Math.max(fontScale, 1), CELL_SCALE_MAXIMUM);
  // Every offered category shows, so each keeps its place and a tap can be learned.
  const columns = usesTwoColumnGrid ? 2 : 3;
  const rows = chunk(categories, columns);
  const isLoading = summaries === null;

  return (
    <View
      accessibilityLabel={isLoading ? messages.wardrobe.loadingLabel : undefined}
      accessibilityRole={isLoading ? 'progressbar' : undefined}
      accessible={isLoading}
      style={styles.cells}
      testID={isLoading ? 'profile-category-cells-loading' : 'profile-category-cells'}>
      {rows.map((row, rowIndex) => (
        <View key={row.join('-')} style={styles.cellRow}>
          {[
            ...row.map((category, column) => (
              <Entrance
                index={firstIndex + rowIndex * columns + column}
                key={category}
                style={styles.cellSlot}
                waiting={!shown}>
                <CategoryCell
                  category={category}
                  onPress={() => onOpenCategory(category)}
                  scale={scale}
                  summary={summaries?.[category] ?? null}
                />
              </Entrance>
            )),
            // A short last row keeps the grid's column width: empty slots nobody reaches.
            ...Array.from({ length: columns - row.length }, (_, index) => (
              <View
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                key={`spacer-${index}`}
                pointerEvents="none"
                style={styles.cellSlot}
                testID="profile-category-spacer"
              />
            )),
          ]}
        </View>
      ))}
    </View>
  );
}

export function ProfileScreen({
  accountCard = null,
  categories = structuralCategories,
  displayName = null,
  onAddPiece,
  onOpenCategory,
  onOpenHistory,
  onOpenWardrobe,
  shown = true,
}: ProfileScreenProps) {
  const messages = useMessages();
  const copy = messages.profile;
  const theme = useKuyaraTheme();
  const { usesStackedLayout } = useTextScaling();
  const { refresh, state } = useWardrobeApplication();
  // Phase 8: the tour scrolls Profile to its end to light the History row, and further when
  // that end leaves the row under the tab bar.
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const scrollOffset = useScrollOffset(scrollRef);

  // A failure already showing when Profile opens is not spoken; one that appears while it is
  // up is, because VoiceOver ignores the body's live region.
  useErrorAnnouncement(
    state.status === 'loading' ? undefined : state.status === 'error' ? messages.wardrobe.loadErrorBody : null,
    { skipInitial: true },
  );
  const isReady = state.status === 'ready';
  const readyItems = isReady ? state.items : null;
  // Memoised on the record list itself, so the rack, which is memoised on its pieces,
  // repaints only when the Closet changes.
  const rackPieces = useMemo(() => readyItems?.map(toRackPiece) ?? null, [readyItems]);
  const summaries = useMemo(
    () => (readyItems ? summarizeClosetCategories(readyItems) : null),
    [readyItems],
  );
  const { owned: ownedItems, wanted: wantedItems } = splitClosetByEntryState(readyItems ?? []);
  const hasOwned = ownedItems.length > 0;
  const hasWanted = wantedItems.length > 0;
  const isFullyEmpty = isReady && !hasOwned && !hasWanted;
  // The heading counts the whole Closet, both states, because the empty state is the one
  // that needs both lists empty; the cells count owned plus wanted the same way.
  const closetCount = ownedItems.length + wantedItems.length;
  const closetTitle = displayName ? copy.wardrobeTitleNamed(displayName) : copy.wardrobeTitle;
  const rackLabel = summaries
    ? copy.rackAccessibilityLabel({
        title: closetTitle,
        count: closetCount,
        categories: categories
          .filter((category) => summaries[category].count > 0)
          .map((category) => ({
            label: messages.wardrobe.categoryFilterLabels[category],
            count: summaries[category].count,
          })),
      })
    : undefined;

  return (
    <Screen contentContainerStyle={styles.content} ref={scrollRef} scrollToOverflowEnabled testID="profile-screen">
      {/* Law 7: the content arrives once, in reading order; a state change inside a block
          never replays it. */}
      {/* The tour measures the still wrapper outside each arrival, so its ring marks where
          the heading and the rack come to rest even while they are still arriving. */}
      {accountCard}
      <TourTarget id="closet-head">
      <Entrance index={0} waiting={!shown}>
      <Pressable
        accessibilityHint={copy.closetHeadingHint}
        accessibilityLabel={!isReady
          ? closetTitle
          : displayName
            ? copy.closetHeadingNamedAccessibilityLabel({ name: displayName, count: closetCount })
            : copy.closetHeadingAccessibilityLabel({ count: closetCount })}
        accessibilityRole="button"
        onPress={() => onOpenWardrobe()}
        style={({ pressed }) => [
          styles.closetHeading,
          usesStackedLayout && styles.stackedClosetHeading,
          pressed && styles.pressed,
        ]}
        testID="profile-closet-heading">
        {usesStackedLayout ? (
          <>
            <View style={styles.closetHeadingTitleRow} testID="profile-closet-heading-title-row">
              <AppText style={styles.closetHeadingTitle} variant="title">
                {closetTitle}
              </AppText>
              <Icon color={theme.colors.iconSecondary} name="chevronRight" size={20} />
            </View>
            {isReady ? (
              <AppText
                colorRole="textSecondary"
                style={styles.closetHeadingCount}
                tabularNumbers
                testID="profile-closet-heading-count"
                variant="body">
                {closetCount}
              </AppText>
            ) : null}
          </>
        ) : (
          <>
            <AppText style={styles.closetHeadingTitle} variant="title">
              {closetTitle}
            </AppText>
            {isReady ? (
              <AppText
                colorRole="textSecondary"
                style={styles.closetHeadingCount}
                tabularNumbers
                testID="profile-closet-heading-count"
                variant="body">
                {closetCount}
              </AppText>
            ) : null}
            <Icon color={theme.colors.iconSecondary} name="chevronRight" size={20} />
          </>
        )}
      </Pressable>
      </Entrance>
      </TourTarget>

      {/* The rack stays in the same place in every state: bare while loading or after an
          error, with empty hangers waiting when the Closet is empty (O9). */}
      <TourTarget id="rack">
        <Entrance index={1} waiting={!shown}>
          <DarkPlate style={styles.rackPlate}>
            <ClosetRack
              accessibilityHint={copy.closetHeadingHint}
              accessibilityLabel={rackLabel}
              onPress={isReady ? () => onOpenWardrobe() : undefined}
              pieces={rackPieces}
              testID="profile-rack"
            />
          </DarkPlate>
        </Entrance>
      </TourTarget>

      {/* The six cells arrive one by one in reading order; the loading cells become the
          ready ones in place, so the Closet loading never replays their arrival. */}
      {state.status === 'error' || isFullyEmpty ? (
      <Entrance index={2} waiting={!shown}>
      {state.status === 'error' ? (
        <View style={styles.errorState} testID="profile-closet-error">
          <Icon color={theme.colors.dangerInk} name="error" size={20} />
          <AppText accessibilityRole="header" style={styles.errorTitle} variant="bodyStrong">
            {messages.wardrobe.loadErrorTitle}
          </AppText>
          <AppText accessibilityLiveRegion="polite" colorRole="textSecondary" style={styles.errorBody}>
            {messages.wardrobe.loadErrorBody}
          </AppText>
          <Button
            label={messages.wardrobe.retryAction}
            onPress={() => void refresh()}
            style={styles.errorRetry}
            testID="profile-closet-retry-button"
            variant="tonal"
          />
        </View>
      ) : (
        <View style={styles.emptyState} testID="profile-closet-empty">
          <AppText style={styles.emptyStateCopy}>
            {copy.wardrobeEmpty}
          </AppText>
          <Button
            icon="plus"
            label={copy.addPieceAction}
            onPress={onAddPiece}
            testID="profile-add-piece-button"
          />
        </View>
      )}
      </Entrance>
      ) : (
        <CategoryCells
          categories={categories}
          firstIndex={2}
          onOpenCategory={onOpenCategory}
          shown={shown}
          summaries={state.status === 'loading' ? null : summaries}
        />
      )}

      <Entrance index={2 + categories.length} waiting={!shown}>
      <View style={styles.group}>
        <ListRowGroup testID="profile-group">
          {(hasOwned || hasWanted) && (
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
          <TourTarget
            id="history"
            key="history"
            reveal={() => scrollRef.current?.scrollToEnd({ animated: true })}
            scrollBy={(dy) => scrollRef.current?.scrollTo({ animated: true, y: scrollOffset.get() + dy })}>
            <ListRow
              glyph={({ color, size }) => <Icon color={color} name="calendar" size={size} />}
              label={copy.historyLabel}
              onPress={onOpenHistory}
              testID="profile-history-row"
            />
          </TourTarget>
        </ListRowGroup>
      </View>
      </Entrance>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.md,
  },
  // The dark appearance's plate the rack stands on.
  rackPlate: {
    borderRadius: radii.card,
    padding: spacing.md,
  },
  closetHeading: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    minHeight: layout.minimumTouchTarget,
    minWidth: 0,
    width: '100%',
  },
  closetHeadingTitle: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
  },
  closetHeadingCount: {
    flexShrink: 1,
    maxWidth: '100%',
    minWidth: 0,
  },
  stackedClosetHeading: {
    alignItems: 'stretch',
    flexDirection: 'column',
  },
  closetHeadingTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    minWidth: 0,
    width: '100%',
  },
  pressed: {
    opacity: interaction.pressedOpacity,
  },
  // The error block (ADR 0029 section 4): the glyph, 8, a `bodyStrong` title, 4, a `body`
  // line, 12, the retry button.
  errorState: {
    alignItems: 'flex-start',
  },
  errorTitle: {
    marginTop: spacing.sm,
  },
  errorBody: {
    marginTop: spacing.xs,
  },
  errorRetry: {
    marginTop: spacing.md,
  },
  emptyState: {
    gap: spacing.md,
    maxWidth: '100%',
    minWidth: 0,
    width: '100%',
  },
  emptyStateCopy: {
    flexShrink: 1,
    maxWidth: '100%',
    minWidth: 0,
  },
  cells: {
    gap: spacing.md,
  },
  cellRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  cellSlot: {
    flex: 1,
    minWidth: 0,
  },
  cell: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0,
  },
  cellTile: {
    alignItems: 'center',
    borderRadius: radii.imageTile,
    flexDirection: 'row',
    gap: spacing.sm,
    paddingLeft: spacing.sm,
    paddingRight: spacing.md,
  },
  cellIcon: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellCount: {
    flexShrink: 1,
    marginLeft: 'auto',
    minWidth: 0,
  },
  group: {
    // ADR 0028 section 1: 24 between the cells and the group. The content column already
    // contributes its 12 gap, so the margin carries only the remainder.
    marginTop: spacing.xl - spacing.md,
  },
});
