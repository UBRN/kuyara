import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import {
  AppText,
  Button,
  ClosetRack,
  GarmentDrawing,
  GarmentSlotGlyph,
  Icon,
  ListRow,
  ListRowGroup,
  Screen,
  useTextScaling,
  type RackPiece,
} from '@/components/ui';
import {
  structuralCategories,
  type StructuralCategory,
} from '@/features/catalog/domain/garment-taxonomy';
import { useWardrobeApplication } from '@/features/wardrobe/application/wardrobe-application-context';
import type { WardrobeItem } from '@/features/wardrobe/domain/wardrobe-item';
import { useMessages } from '@/localization/use-messages';
import { interaction, layout, spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

// ADR 0028 section 1: the Closet is the subject. The native large title and the
// Settings bar button are the route's job (`app/(tabs)/(profile)/profile.tsx`), because
// they are chrome the OS draws, not this screen's content. O9 draws the Closet as an open
// rack (`ClosetRack`) with six category cells under it as its legend.

// A cell is a 64 point stage-fill tile holding a 48 point drawing and the count. No token
// in `radii` is 14; ADR 0028 section 2 fixes image tiles at 14, as the Closet grid does.
const CELL_TILE_HEIGHT = 64;
const CELL_TILE_RADIUS = 14;
const CELL_ICON_BOX = 48;
const CELL_DRAWING_SIZE = 44;
const CELL_GLYPH_SIZE = 36;
// The tile and its drawing grow with the text up to the largest standard size, no further,
// so two columns of cells still fit beside the title-sized count.
const CELL_SCALE_MAXIMUM = 1.2;

type ProfileScreenProps = Readonly<{
  displayName?: string | null;
  onOpenWardrobe: (filter?: 'wanted') => void;
  /** A category cell opens the Closet on that category (O9). */
  onOpenCategory: (category: StructuralCategory) => void;
  onOpenHistory: () => void;
}>;

type CategorySummary = Readonly<{ count: number; wanted: number; newest: WardrobeItem | null }>;

function newestOf(items: readonly WardrobeItem[]): WardrobeItem | null {
  return items.reduce<WardrobeItem | null>(
    (newest, item) => (newest === null || item.createdAt > newest.createdAt ? item : newest),
    null,
  );
}

// Counts derive from the records, never a count table (ADR 0029). A cell's drawing is the
// category's newest owned piece, or its newest wanted one when nothing there is owned.
function summarizeCategories(
  items: readonly WardrobeItem[],
): Readonly<Record<StructuralCategory, CategorySummary>> {
  return Object.fromEntries(
    structuralCategories.map((category) => {
      const inCategory = items.filter((item) => item.category === category);
      const owned = inCategory.filter((item) => item.entryState === 'owned');
      return [category, {
        count: inCategory.length,
        wanted: inCategory.length - owned.length,
        newest: newestOf(owned) ?? newestOf(inCategory),
      }];
    }),
  ) as Record<StructuralCategory, CategorySummary>;
}

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
  summary: CategorySummary | null;
}>) {
  const messages = useMessages();
  const theme = useKuyaraTheme();
  const label = messages.wardrobe.categoryFilterLabels[category];
  const newest = summary?.newest ?? null;
  const tile = (
    <View
      style={[
        styles.cellTile,
        { backgroundColor: theme.colors.surfaceMuted, height: CELL_TILE_HEIGHT * scale },
      ]}>
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
                color={theme.colors.iconSecondary}
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
    </View>
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
    <Pressable
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
    </Pressable>
  );
}

function CategoryCells({
  onOpenCategory,
  summaries,
}: Readonly<{
  onOpenCategory: (category: StructuralCategory) => void;
  summaries: Readonly<Record<StructuralCategory, CategorySummary>> | null;
}>) {
  const messages = useMessages();
  const { fontScale, usesTwoColumnGrid } = useTextScaling();
  const scale = Math.min(Math.max(fontScale, 1), CELL_SCALE_MAXIMUM);
  // All six cells always show, so each category keeps its place and a tap can be learned.
  const rows = chunk(structuralCategories, usesTwoColumnGrid ? 2 : 3);
  const isLoading = summaries === null;

  return (
    <View
      accessibilityLabel={isLoading ? messages.wardrobe.loadingLabel : undefined}
      accessibilityRole={isLoading ? 'progressbar' : undefined}
      accessible={isLoading}
      style={styles.cells}
      testID={isLoading ? 'profile-category-cells-loading' : 'profile-category-cells'}>
      {rows.map((row) => (
        <View key={row.join('-')} style={styles.cellRow}>
          {row.map((category) => (
            <CategoryCell
              category={category}
              key={category}
              onPress={() => onOpenCategory(category)}
              scale={scale}
              summary={summaries?.[category] ?? null}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

export function ProfileScreen({
  displayName = null,
  onOpenCategory,
  onOpenHistory,
  onOpenWardrobe,
}: ProfileScreenProps) {
  const messages = useMessages();
  const copy = messages.profile;
  const theme = useKuyaraTheme();
  const { usesStackedLayout } = useTextScaling();
  const { refresh, state } = useWardrobeApplication();

  const isReady = state.status === 'ready';
  const readyItems = isReady ? state.items : null;
  // Memoised on the record list itself, so the rack, which is memoised on its pieces,
  // repaints only when the Closet changes.
  const rackPieces = useMemo(() => readyItems?.map(toRackPiece) ?? null, [readyItems]);
  const summaries = useMemo(
    () => (readyItems ? summarizeCategories(readyItems) : null),
    [readyItems],
  );
  const ownedItems = isReady
    ? state.items.filter((item) => item.entryState === 'owned')
    : [];
  const wantedItems = isReady
    ? state.items.filter((item) => item.entryState === 'wanted')
    : [];
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
        categories: structuralCategories
          .filter((category) => summaries[category].count > 0)
          .map((category) => ({
            label: messages.wardrobe.categoryFilterLabels[category],
            count: summaries[category].count,
          })),
      })
    : undefined;

  return (
    <Screen contentContainerStyle={styles.content} testID="profile-screen">
      <Pressable
        accessibilityHint={copy.closetHeadingHint}
        accessibilityLabel={displayName
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

      {/* The rack stays in the same place in every state: bare while loading or after an
          error, with empty hangers waiting when the Closet is empty (O9). */}
      <ClosetRack
        accessibilityHint={copy.closetHeadingHint}
        accessibilityLabel={rackLabel}
        onPress={isReady ? () => onOpenWardrobe() : undefined}
        pieces={rackPieces}
        testID="profile-rack"
      />

      {state.status === 'loading' ? (
        <CategoryCells onOpenCategory={onOpenCategory} summaries={null} />
      ) : state.status === 'error' ? (
        <View style={styles.errorState} testID="profile-closet-error">
          <Icon color={theme.colors.dangerInk} name="error" size={20} />
          <AppText accessibilityRole="header" style={styles.errorTitle} variant="bodyStrong">
            {messages.wardrobe.loadErrorTitle}
          </AppText>
          <AppText colorRole="textSecondary" style={styles.errorBody}>
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
      ) : isFullyEmpty ? (
        <View style={styles.emptyState} testID="profile-closet-empty">
          <AppText style={styles.emptyStateCopy}>
            {copy.wardrobeEmpty}
          </AppText>
          <Button
            icon="plus"
            label={copy.addPieceAction}
            onPress={() => onOpenWardrobe()}
            testID="profile-add-piece-button"
          />
        </View>
      ) : (
        <CategoryCells onOpenCategory={onOpenCategory} summaries={summaries} />
      )}

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
          <ListRow
            glyph={({ color, size }) => <Icon color={color} name="calendar" size={size} />}
            key="history"
            label={copy.historyLabel}
            onPress={onOpenHistory}
            testID="profile-history-row"
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
  cell: {
    flex: 1,
    gap: spacing.xs,
    minWidth: 0,
  },
  cellTile: {
    alignItems: 'center',
    borderRadius: CELL_TILE_RADIUS,
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
