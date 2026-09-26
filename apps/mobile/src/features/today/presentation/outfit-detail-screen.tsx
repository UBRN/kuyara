import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';

import {
  AppText,
  Button,
  colorFamilyFills,
  garmentColorFamiliesBySlot,
  Entrance,
  GarmentBoard,
  GarmentTileArtwork,
  Icon,
  type IconName,
  layoutGarmentBoard,
  Pill,
  PressScale,
  Screen,
  haptics,
  useGarmentRoles,
  useTextScaling,
} from '@/components/ui';
import type { ColorFamily } from '@/features/catalog/domain/garment-taxonomy';
import {
  createDetailCaptionLayout,
  createTodayPresentation,
} from '@/features/today/presentation/today-presentation';
import { useForegroundClock } from '@/hooks/use-foreground-clock';
import type { TodayScreenState } from '@/features/today/model';
import {
  matchPieceOwnership,
  type PieceOwnershipMatch,
} from '@/features/wardrobe/domain/garment-type-ownership';
import type { WardrobeItem } from '@/features/wardrobe/domain/wardrobe-item';
import type { PieceSheetTarget } from '@/features/wardrobe/presentation/piece-edit-sheet';
import { getMessages, type SupportedLanguage } from '@/localization/messages';
import { useLocalization } from '@/localization/use-messages';
import { borderWidths, layout, radii, spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

// The detail draws its pieces at board scale; an accessory is not on the board, so it reads
// at Law 6's standalone mark step. The artwork fills about 60 percent of its box, so 28
// draws roughly 17 points of garment: enough for the silhouettes to stay apart from each
// other. It is deliberately larger than the 20 point reason-row icons, which are glyphs
// sized to the body line they sit beside rather than drawings that have to be recognised.
const ACCESSORY_ARTWORK_SIZE = 28;
// A piece row's thumbnail, and the smaller drawing of the user's own similar piece.
const ROW_TILE_SIZE = 56;
const OWN_TILE_SIZE = 32;
// The ownership badge at a board garment's corner: a 16-point glyph on a 28-point disc.
const BADGE_SIZE = 28;
const BADGE_GLYPH_SIZE = 16;
const SWATCH_DOT_SIZE = 16;

const matchIcons: Readonly<Record<Exclude<PieceOwnershipMatch['kind'], 'none'>, IconName>> = {
  owned: 'check',
  similar: 'hanger',
  wanted: 'heartFilled',
};

/**
 * Whether today's worn record is this outfit (`this`), another one (`other`), none, or not
 * read yet (`unknown`). One record per dressing day (ADR 0038).
 */
export type OutfitWornState = 'this' | 'other' | 'none' | 'unknown';

type OutfitDetailScreenProps = Readonly<{
  state: TodayScreenState;
  language: SupportedLanguage;
  suggestionId: string | undefined;
  /** The active Closet records; O7 matches each piece against them, on this screen only. */
  wardrobeItems: readonly WardrobeItem[];
  ownershipError?: string | null;
  /** O6: a board garment and its row open the same edit sheet. */
  onEditPiece: (target: PieceSheetTarget) => void;
  worn?: OutfitWornState;
  wornBusy?: boolean;
  wornError?: string | null;
  onWoreThis?: () => void;
}>;

type DetailSuggestion = Extract<ReturnType<typeof createTodayPresentation>, { kind: 'loaded' }>['suggestions'][number];

/**
 * O7: each piece against the Closet, by type and the colour family the outfit draws it in.
 * The board, the captions and the rows all read this one list.
 */
function pieceEntries(
  suggestion: DetailSuggestion,
  wardrobeItems: readonly WardrobeItem[],
  copy: ReturnType<typeof getMessages>['today'],
) {
  const colorFamilies = garmentColorFamiliesBySlot(suggestion.palette);
  return suggestion.pieces.flatMap((piece) => {
    const boardPiece = suggestion.boardPieces.find(
      ({ garmentTypeId }) => garmentTypeId === piece.garmentTypeId,
    );
    if (!boardPiece) return [];
    const colorFamily: ColorFamily | null = colorFamilies.get(boardPiece.slot) ?? null;
    const match = matchPieceOwnership(piece.garmentTypeId, colorFamily, wardrobeItems);
    const status = match.kind === 'owned'
      ? copy.ownershipOwnedAction
      : match.kind === 'similar'
        ? copy.ownershipSimilarLabel
        : match.kind === 'wanted' ? copy.ownershipWantedAction : null;
    const target: PieceSheetTarget = {
      garmentTypeId: piece.garmentTypeId,
      category: piece.category,
      name: piece.item,
      slot: piece.slot,
      suggestedColorFamily: colorFamily,
      match,
    };
    return [{
      piece,
      slot: boardPiece.slot,
      match,
      status,
      target,
      // Assistive tech hears the state of every piece, the untracked default included.
      spokenLabel: `${piece.item}, ${piece.slot}, ${status ?? copy.ownershipUntrackedLabel}`,
    }];
  });
}

export function OutfitDetailScreen({
  state,
  language,
  suggestionId,
  wardrobeItems,
  ownershipError = null,
  onEditPiece,
  worn = 'unknown',
  wornBusy = false,
  wornError = null,
  onWoreThis,
}: OutfitDetailScreenProps) {
  const theme = useKuyaraTheme();
  const { hour12 } = useLocalization();
  const { fontScale, usesStackedLayout } = useTextScaling();
  const [contentWidth, setContentWidth] = useState(0);
  const [captionHeights, setCaptionHeights] = useState<Readonly<Record<string, number>>>({});
  const [piecesSettled, setPiecesSettled] = useState(false);
  const [completions, setCompletions] = useState(0);
  const now = useForegroundClock();
  const onPiecesSettled = useCallback(() => setPiecesSettled(true), []);
  const captionEntranceStyle = useAnimatedStyle(() => ({
    opacity: withTiming(piecesSettled ? 1 : 0, { duration: theme.motion.fast }),
  }), [piecesSettled, theme.motion.fast]);
  const messages = getMessages(language);
  const copy = messages.today;
  const presentation = createTodayPresentation(state, language, hour12, now);
  const suggestion =
    presentation.kind === 'loaded'
      ? presentation.suggestions.find(({ id }) => id === suggestionId)
      : undefined;
  // The finishing touches and the piece rows keep the colours the outfit's palette gave
  // them on Today (O15).
  const pieceRoles = useGarmentRoles(suggestion?.palette ?? null);
  const boardLayout = suggestion
    ? layoutGarmentBoard(suggestion.boardPieces, contentWidth, 'detail')
    : { height: 0, boxes: [] };
  const initialCaptionHeight = theme.typography.body.lineHeight * fontScale * 2;
  // Above 1.5 the captions leave the board and the piece rows alone name the pieces, so the
  // plate is exactly the board and nothing has to be reserved for text inside it.
  const plateHeight = usesStackedLayout
    ? boardLayout.height
    : Math.max(
        boardLayout.height,
        ...boardLayout.boxes.map((box) => {
          const caption = createDetailCaptionLayout(box, contentWidth);
          return caption.top + (captionHeights[box.slot] ?? initialCaptionHeight);
        }),
      );

  const entries = suggestion ? pieceEntries(suggestion, wardrobeItems, copy) : [];
  const entryFor = (garmentTypeId: string) =>
    entries.find(({ piece }) => piece.garmentTypeId === garmentTypeId);
  const ownedCount = entries.filter(({ match }) => match.kind === 'owned').length;
  // Law 7's one moment: the save that makes the last piece owned settles the board once,
  // with Law 8's success notification. Any other change is visible in the rows.
  const previousOwned = useRef(ownedCount);
  useEffect(() => {
    const before = previousOwned.current;
    previousOwned.current = ownedCount;
    if (ownedCount > before && ownedCount === entries.length) {
      haptics.success();
      setCompletions((count) => count + 1);
    }
  }, [entries.length, ownedCount]);
  const colorName = (family: ColorFamily | null) => family
    ? messages.catalog[`catalog.color_family.${family}`] : messages.wardrobe.colorUnspecified;
  const swatchFill = (family: ColorFamily) => {
    const fill = colorFamilyFills[theme.colorScheme][family];
    return typeof fill === 'string' ? fill : fill[0];
  };

  if (presentation.kind !== 'loaded' || !suggestion) {
    const missingSuggestion = presentation.kind === 'loaded';
    return (
      <Screen testID="outfit-detail-screen">
        <AppText accessibilityRole="header" variant="titleLarge">
          {missingSuggestion ? copy.noOutfitTitle : presentation.title}
        </AppText>
        {missingSuggestion ? (
          <AppText colorRole="textSecondary" style={styles.missingSuggestionBody} variant="body">
            {copy.noOutfitBody}
          </AppText>
        ) : null}
      </Screen>
    );
  }

  const stageColor = theme.atmosphere[presentation.atmosphere];
  const renderCaption = (box: (typeof boardLayout.boxes)[number]) => {
    const entry = entryFor(box.garmentTypeId);
    if (!entry) return null;
    const captionLayout = createDetailCaptionLayout(box, contentWidth);
    return (
      <View key={box.slot} style={[styles.captionPosition, captionLayout]}>
        <Pressable
          accessibilityHint={copy.editPieceAccessibilityHint}
          accessibilityLabel={entry.spokenLabel}
          accessibilityRole="button"
          hitSlop={spacing.sm}
          onPress={() => onEditPiece(entry.target)}
          style={({ pressed }) => pressed && { opacity: theme.interaction.pressedOpacity }}
          testID={`outfit-detail-caption-${box.garmentTypeId}`}>
          <View
            onLayout={({ nativeEvent }) => {
              const height = nativeEvent.layout.height;
              if (captionHeights[box.slot] === height) return;
              setCaptionHeights((current) => ({ ...current, [box.slot]: height }));
            }}
            style={styles.caption}
            testID={`outfit-detail-caption-content-${box.garmentTypeId}`}>
            <AppText style={styles.captionText} variant="bodyStrong">{entry.piece.item}</AppText>
          </View>
        </Pressable>
      </View>
    );
  };

  // The garment itself is the larger target (O6). Its caption already carries the name and
  // the state for assistive tech, so the drawing's target stays out of the reading order.
  const renderGarmentTarget = (box: (typeof boardLayout.boxes)[number]) => {
    const entry = entryFor(box.garmentTypeId);
    if (!entry) return null;
    return (
      <Pressable
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        key={box.slot}
        onPress={() => onEditPiece(entry.target)}
        style={[styles.garmentTarget, { height: box.height, left: box.x, top: box.y, width: box.width }]}
        testID={`outfit-detail-garment-${box.garmentTypeId}`}>
        {entry.match.kind === 'none' ? null : (
          <View
            style={[styles.badge, {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.borderDefined,
            }]}
            testID={`outfit-detail-badge-${box.garmentTypeId}`}>
            <Icon color={theme.colors.brandAccent} name={matchIcons[entry.match.kind]} size={BADGE_GLYPH_SIZE} />
          </View>
        )}
      </Pressable>
    );
  };

  return (
    <Screen testID="outfit-detail-screen">
      <View
        onLayout={({ nativeEvent }) => setContentWidth(nativeEvent.layout.width)}
        testID="outfit-detail-content">

        <View
          style={[styles.headingGroup, usesStackedLayout && styles.stackedHeadingGroup]}
          testID="outfit-detail-heading-group">
          <AppText accessibilityRole="header" variant="title">
            {suggestion.title}
          </AppText>
          {suggestion.emphasis ? <Pill label={suggestion.emphasis} tone="accent-filled" /> : null}
        </View>

        <View
          style={[styles.boardPlate, { height: plateHeight, width: contentWidth }]}
          testID="outfit-detail-board-plate">
          <GarmentBoard
            accessibilityLabel={suggestion.boardAccessibilityLabel}
            decorative
            entrance={{
              fromPreset: 'today',
              fromStageColor: stageColor,
              fromStageRadius: 26,
              onSettled: onPiecesSettled,
            }}
            // The opened outfit keeps the palette it had on Today (O15). The plate stands on
            // the page ground, so every fill is made legible on `background`.
            palette={suggestion.palette}
            pieces={suggestion.boardPieces}
            preset="detail"
            settle={completions}
            testID="outfit-detail-board"
            width={contentWidth}
          />
          <Animated.View
            style={[styles.captionOverlay, captionEntranceStyle]}
            testID="outfit-detail-caption-overlay">
            {boardLayout.boxes.map(renderGarmentTarget)}
            {usesStackedLayout ? null : boardLayout.boxes.map(renderCaption)}
          </Animated.View>
        </View>

        <Entrance>
          <View style={styles.editHint} testID="outfit-detail-edit-hint">
            <Icon color={theme.colors.iconSecondary} name="info" size={16} />
            <AppText colorRole="textSecondary" style={styles.flexText} variant="caption">
              {copy.editPieceHint}
            </AppText>
          </View>
        </Entrance>

        {/* ADR 0038: one worn record per dressing day, written only by this action. */}
        {worn === 'this' ? (
          <View
            accessible
            accessibilityLabel={copy.wornToday}
            style={[styles.wornState, { borderColor: theme.colors.borderDefined }]}
            testID="outfit-detail-worn">
            <Icon color={theme.colors.successInk} name="checkCircle" size={20} />
            <AppText variant="bodyStrong">{copy.wornToday}</AppText>
          </View>
        ) : onWoreThis ? (
          <Button
            icon="calendarCheck"
            label={copy.wornAction}
            loading={wornBusy}
            onPress={onWoreThis}
            size="large"
            style={styles.wornAction}
            testID="outfit-detail-wore-this"
          />
        ) : null}
        {wornError ? (
          <AppText accessibilityRole="alert" colorRole="dangerInk" style={styles.ownershipError} variant="caption">
            {wornError}
          </AppText>
        ) : null}

        <View style={styles.section} testID="outfit-detail-pieces">
          <AppText accessibilityRole="header" colorRole="textPrimary" variant="bodyStrong">
            {presentation.copy.piecesHeading}
          </AppText>
          <View>
            {entries.map(({ piece, slot, match, status, target, spokenLabel }, index) => (
              <PressScale
                accessibilityHint={copy.editPieceAccessibilityHint}
                accessibilityLabel={match.kind === 'similar'
                  ? `${spokenLabel}, ${copy.ownershipYours(colorName(match.item.colorFamily))}`
                  : spokenLabel}
                accessibilityRole="button"
                key={piece.garmentTypeId}
                onPress={() => onEditPiece(target)}
                style={[styles.pieceRow, index > 0 && {
                  borderTopColor: theme.colors.borderSubtle,
                  borderTopWidth: StyleSheet.hairlineWidth,
                }]}
                testID={`outfit-detail-piece-${piece.garmentTypeId}`}>
                <View style={[styles.rowTile, { backgroundColor: theme.colors.surfaceMuted }]}>
                  <GarmentTileArtwork
                    category={piece.category}
                    colorFamily={null}
                    garmentTypeId={piece.garmentTypeId}
                    glyphSize={ROW_TILE_SIZE * 0.6}
                    height={ROW_TILE_SIZE}
                    photoTestID={`outfit-detail-piece-photo-${piece.garmentTypeId}`}
                    photoUri={null}
                    placeholderTestID={`outfit-detail-piece-glyph-${piece.garmentTypeId}`}
                    roles={pieceRoles.get(slot)}
                    silhouetteTestID={`outfit-detail-piece-silhouette-${piece.garmentTypeId}`}
                    width={ROW_TILE_SIZE}
                  />
                </View>
                <View style={styles.rowText}>
                  <AppText variant="bodyStrong">{piece.item}</AppText>
                  <AppText colorRole="textSecondary" variant="caption">{piece.slot}</AppText>
                  {match.kind !== 'none' && status ? (
                    <View style={styles.rowStatus} testID={`outfit-detail-piece-status-${piece.garmentTypeId}`}>
                      <Icon color={theme.colors.brandAccent} name={match.kind === 'wanted' ? 'heartFilled' : 'hanger'} size={16} />
                      <AppText variant="caption">{status}</AppText>
                      {match.kind === 'owned' ? (
                        <Icon color={theme.colors.brandAccent} name="check" size={16} />
                      ) : null}
                    </View>
                  ) : null}
                  {match.kind === 'similar' ? (
                    <View style={styles.rowStatus} testID={`outfit-detail-piece-yours-${piece.garmentTypeId}`}>
                      <View style={[styles.ownTile, { backgroundColor: theme.colors.surfaceMuted }]}>
                        <GarmentTileArtwork
                          category={piece.category}
                          colorFamily={match.item.colorFamily}
                          garmentTypeId={piece.garmentTypeId}
                          glyphSize={OWN_TILE_SIZE * 0.6}
                          height={OWN_TILE_SIZE}
                          photoTestID={`outfit-detail-yours-photo-${piece.garmentTypeId}`}
                          photoUri={null}
                          placeholderTestID={`outfit-detail-yours-glyph-${piece.garmentTypeId}`}
                          silhouetteTestID={`outfit-detail-yours-silhouette-${piece.garmentTypeId}`}
                          width={OWN_TILE_SIZE}
                        />
                      </View>
                      {match.item.colorFamily ? (
                        <View style={[styles.swatchDot, {
                          backgroundColor: swatchFill(match.item.colorFamily),
                          borderColor: theme.colors.borderDefined,
                        }]} />
                      ) : null}
                      <AppText colorRole="textSecondary" style={styles.flexText} variant="caption">
                        {copy.ownershipYours(colorName(match.item.colorFamily))}
                      </AppText>
                    </View>
                  ) : null}
                </View>
                <Icon color={theme.colors.textSecondary} name="chevronRight" size={20} />
              </PressScale>
            ))}
          </View>
        </View>

        {ownershipError ? (
          <AppText
            accessibilityRole="alert"
            colorRole="dangerInk"
            style={styles.ownershipError}
            variant="caption">
            {ownershipError}
          </AppText>
        ) : null}

        {suggestion.accessories.length > 0 ? (
          <View style={styles.section} testID="outfit-detail-finishing-touches">
            <AppText accessibilityRole="header" colorRole="textPrimary" variant="bodyStrong">
              {presentation.copy.finishingTouchesHeading}
            </AppText>
            <View style={styles.accessoryList}>
              {suggestion.accessories.map((accessory) => (
                <View
                  accessible
                  accessibilityLabel={copy.finishingTouchesRowAccessibilityLabel({
                    item: accessory.item,
                    slot: accessory.slot,
                  })}
                  key={accessory.accessorySlot}
                  style={styles.accessoryRow}
                  testID={`outfit-detail-accessory-${accessory.garmentTypeId}`}>
                  <GarmentTileArtwork
                    category={accessory.category}
                    colorFamily={null}
                    roles={pieceRoles.get(accessory.accessorySlot)}
                    garmentTypeId={accessory.garmentTypeId}
                    glyphSize={ACCESSORY_ARTWORK_SIZE}
                    height={ACCESSORY_ARTWORK_SIZE}
                    photoTestID={`outfit-detail-accessory-photo-${accessory.garmentTypeId}`}
                    photoUri={null}
                    placeholderTestID={`outfit-detail-accessory-glyph-${accessory.garmentTypeId}`}
                    silhouetteTestID={`outfit-detail-accessory-silhouette-${accessory.garmentTypeId}`}
                    width={ACCESSORY_ARTWORK_SIZE}
                  />
                  <View style={styles.accessoryText}>
                    <AppText variant="bodyStrong">{accessory.item}</AppText>
                    <AppText colorRole="textSecondary" variant="caption">
                      {accessory.slot}
                    </AppText>
                  </View>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {suggestion.requirementRows.length > 0 ? (
          <View style={styles.section}>
            <AppText accessibilityRole="header" colorRole="textPrimary" variant="bodyStrong">
              {presentation.copy.reasonsHeading}
            </AppText>
            <View style={styles.reasonList}>
              {suggestion.requirementRows.map((row) => (
                <View key={row.id} style={styles.reasonRow}>
                  {/* Law 1's accent budget: a satisfied requirement is a bullet beside its
                      sentence, not a status site, so it carries the secondary icon ink and
                      leaves the viewport's one accent fill to the ownership markers. A
                      tradeoff is a real status and keeps Law 4's ink, glyph and text. */}
                  <Icon
                    color={row.kind === 'tradeoff' ? theme.colors.warningInk : theme.colors.iconSecondary}
                    name={row.kind === 'tradeoff' ? 'warning' : 'checkCircle'}
                    size={20}
                  />
                  <AppText colorRole="textSecondary" style={styles.reasonText} variant="body">
                    {row.text}
                  </AppText>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {/* ADR 0034 section 4: where the outfit was chosen is metadata, so it reads last,
            after the reasons and before the weather recap, as one plain sentence on the
            page ground. No card, no glyph, no accent, no pill, and no provider name. */}
        {presentation.generationSource ? (
          <AppText
            colorRole="textSecondary"
            style={styles.generationSource}
            testID="outfit-detail-generation-source"
            variant="caption">
            {presentation.generationSource}
          </AppText>
        ) : null}

        <Entrance index={1}>
          <View
            accessible
            accessibilityLabel={[
              presentation.weather.temperature,
              presentation.weather.condition,
              presentation.weather.rainProbability,
              ...(presentation.coverageCaption ? [presentation.coverageCaption] : []),
            ].join(', ')}
            style={[styles.weatherRecap, { backgroundColor: stageColor }]}
            testID="outfit-detail-weather-recap">
            <View style={styles.weatherRecapValues}>
              <AppText tabularNumbers variant="caption">{presentation.weather.temperature}</AppText>
              <AppText colorRole="textPrimary" variant="caption">{presentation.weather.condition}</AppText>
              <AppText colorRole="textPrimary" tabularNumbers variant="caption">
                {presentation.weather.rainProbability}
              </AppText>
            </View>
            {/* N18: the hours this outfit was chosen for belong with the weather they describe. */}
            {presentation.coverageCaption ? (
              <View style={styles.weatherRecapCoverage} testID="outfit-detail-coverage">
                <Icon color={theme.colors.textPrimary} name="clock" size={16} />
                <AppText colorRole="textPrimary" style={styles.weatherRecapCoverageText} tabularNumbers variant="caption">
                  {presentation.coverageCaption}
                </AppText>
              </View>
            ) : null}
          </View>
        </Entrance>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  missingSuggestionBody: {
    marginTop: spacing.sm,
  },
  generationSource: {
    marginTop: spacing.md,
  },
  headingGroup: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  // Above fontScale 1.5 the emphasis pill sits under the title instead of leaving the screen.
  stackedHeadingGroup: {
    alignItems: 'flex-start',
    flexDirection: 'column',
  },
  boardPlate: {
    marginTop: spacing.xl,
    position: 'relative',
  },
  caption: {
    alignItems: 'center',
  },
  captionPosition: {
    position: 'absolute',
  },
  captionOverlay: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  captionText: {
    textAlign: 'center',
  },
  garmentTarget: {
    position: 'absolute',
  },
  badge: {
    alignItems: 'center',
    borderRadius: BADGE_SIZE / 2,
    borderWidth: borderWidths.subtle,
    height: BADGE_SIZE,
    justifyContent: 'center',
    position: 'absolute',
    right: -BADGE_SIZE / 3,
    top: -BADGE_SIZE / 3,
    width: BADGE_SIZE,
  },
  editHint: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  flexText: {
    flex: 1,
    flexShrink: 1,
  },
  wornAction: {
    marginTop: spacing.md,
  },
  wornState: {
    alignItems: 'center',
    borderRadius: radii.pill,
    borderWidth: borderWidths.subtle,
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
    minHeight: layout.minimumTouchTarget,
    paddingHorizontal: spacing.lg,
  },
  pieceRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
    minHeight: layout.minimumTouchTarget,
    paddingVertical: spacing.md,
  },
  rowTile: {
    alignItems: 'center',
    borderRadius: radii.control,
    height: ROW_TILE_SIZE,
    justifyContent: 'center',
    overflow: 'hidden',
    width: ROW_TILE_SIZE,
  },
  rowText: {
    flex: 1,
    flexShrink: 1,
    gap: spacing.xs,
  },
  rowStatus: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  ownTile: {
    alignItems: 'center',
    borderRadius: radii.control,
    height: OWN_TILE_SIZE,
    justifyContent: 'center',
    overflow: 'hidden',
    width: OWN_TILE_SIZE,
  },
  swatchDot: {
    borderRadius: SWATCH_DOT_SIZE / 2,
    borderWidth: borderWidths.subtle,
    height: SWATCH_DOT_SIZE,
    width: SWATCH_DOT_SIZE,
  },
  ownershipError: {
    marginTop: spacing.sm,
  },
  section: {
    gap: spacing.md,
    marginTop: spacing.md,
  },
  reasonList: {
    gap: spacing.sm,
  },
  accessoryList: {
    gap: spacing.sm,
  },
  accessoryRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  accessoryText: {
    flex: 1,
    flexShrink: 1,
  },
  reasonRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  reasonText: {
    flex: 1,
    flexShrink: 1,
  },
  weatherRecap: {
    borderRadius: radii.card,
    gap: spacing.sm,
    marginTop: spacing.md,
    padding: spacing.lg,
  },
  weatherRecapValues: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  weatherRecapCoverage: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  weatherRecapCoverageText: {
    flexShrink: 1,
  },
});
