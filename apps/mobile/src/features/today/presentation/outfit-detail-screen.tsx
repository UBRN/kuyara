import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedRef,
  useAnimatedStyle,
  useScrollOffset,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import {
  AppText,
  Button,
  ClosetColorDisc,
  colorFamilyFills,
  garmentColorFamiliesBySlot,
  Entrance,
  GarmentSwapBoard,
  GarmentTileArtwork,
  Icon,
  type GarmentOutfitPalette,
  type IconName,
  keepGarmentColors,
  layoutGarmentBoard,
  Presence,
  PressScale,
  Screen,
  haptics,
  useGarmentRoles,
  useTextScaling,
} from '@/components/ui';
import { getGarmentType } from '@/features/catalog/domain/garment-catalog';
import type { ColorFamily, GarmentTypeId } from '@/features/catalog/domain/garment-taxonomy';
import type { RecommendedOutfit } from '@/features/recommendation/application/recommend-outfits';
import type { ManualMix } from '@/features/recommendation/application/use-manual-mix';
import type { SwappableSlot } from '@/features/recommendation/domain/manual-mix';
import type { OutfitSlot } from '@/features/recommendation/domain/outfit-composition';
import {
  PiecePickerSheet,
  type PiecePickerTarget,
} from '@/features/today/presentation/piece-picker-sheet';
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
import { TourTarget } from '@/features/walkthrough/application/tour-target';
import { getMessages, type SupportedLanguage } from '@/localization/messages';
import { useLocalization } from '@/localization/use-messages';
import { borderWidths, interaction, layout, radii, spacing } from '@/theme/theme';
import { easierToSee, useEasierToSee } from '@/theme/easier-to-see';
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
// A tap outside the board ends the focus only when the finger did not travel: a scroll keeps it.
const OUTSIDE_TAP_SLOP = 10;

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
  /** O6: a piece row opens the piece's Closet sheet. */
  onEditPiece: (target: PieceSheetTarget) => void;
  worn?: OutfitWornState;
  wornBusy?: boolean;
  wornError?: string | null;
  onWoreThis?: () => void;
  /**
   * Phase 7: the open outfit's manual mix, owned by the route so leaving detail forgets it.
   * Absent, the pieces cannot change.
   */
  manualMix?: ManualMix<RecommendedOutfit> | null;
  /** Phase 7: a board piece is focused, so the route turns the full-screen back swipe off. */
  onBoardFocusChange?: (focused: boolean) => void;
}>;

type DetailSuggestion = Extract<ReturnType<typeof createTodayPresentation>, { kind: 'loaded' }>['suggestions'][number];

/**
 * O7: each piece against the Closet, by type and the colour family the outfit draws it in.
 * The board, the captions and the rows all read this one list.
 */
function pieceEntries(
  suggestion: DetailSuggestion,
  palette: GarmentOutfitPalette,
  wardrobeItems: readonly WardrobeItem[],
  copy: ReturnType<typeof getMessages>['today'],
) {
  const colorFamilies = garmentColorFamiliesBySlot(palette);
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

/** Content that fades in when it is replaced (effects motion), and stays still on mount. */
function FadeOnChange({ animate, children }: Readonly<{ animate: boolean; children: ReactNode }>) {
  const theme = useKuyaraTheme();
  const opacity = useSharedValue(animate ? 0 : 1);
  useEffect(() => {
    opacity.set(withTiming(1, { duration: theme.motion.normal }));
  }, [opacity, theme.motion.normal]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  // A piece row draws this over its full-row pressable, so the fade itself never takes a touch.
  return <Animated.View pointerEvents="box-none" style={style}>{children}</Animated.View>;
}

/** The title after a change: the old one leaves on `fast`, the new one arrives on `normal`. */
function CrossfadeTitle({ title }: Readonly<{ title: string }>) {
  const theme = useKuyaraTheme();
  const [titles, setTitles] = useState<Readonly<{ current: string; previous: string | null }>>({
    current: title, previous: null,
  });
  if (titles.current !== title) setTitles({ current: title, previous: titles.current });
  const incoming = useSharedValue(1);
  const outgoing = useSharedValue(0);
  const clearPrevious = useCallback(() => setTitles((value) => ({ ...value, previous: null })), []);
  useEffect(() => {
    if (titles.previous === null) return;
    incoming.set(0);
    incoming.set(withTiming(1, { duration: theme.motion.normal }));
    outgoing.set(1);
    outgoing.set(withTiming(0, { duration: theme.motion.fast }, (finished) => {
      if (finished) runOnJS(clearPrevious)();
    }));
  }, [clearPrevious, incoming, outgoing, theme.motion.fast, theme.motion.normal, titles]);
  const incomingStyle = useAnimatedStyle(() => ({ opacity: incoming.get() }));
  const outgoingStyle = useAnimatedStyle(() => ({ opacity: outgoing.get() }));
  return (
    <View>
      <Animated.View style={incomingStyle}>
        <AppText accessibilityRole="header" variant="title">{titles.current}</AppText>
      </Animated.View>
      {titles.previous !== null ? (
        <Animated.View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, outgoingStyle]}>
          <AppText variant="title">{titles.previous}</AppText>
        </Animated.View>
      ) : null}
    </View>
  );
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
  manualMix = null,
  onBoardFocusChange,
}: OutfitDetailScreenProps) {
  const theme = useKuyaraTheme();
  const easierToSeeOn = useEasierToSee();
  const { hour12, temperatureUnit } = useLocalization();
  const { fontScale, stacksButtonPair, usesStackedLayout } = useTextScaling();
  const [contentWidth, setContentWidth] = useState(0);
  const [captionHeights, setCaptionHeights] = useState<Readonly<Record<string, number>>>({});
  const [completions, setCompletions] = useState(0);
  const [focusedSlot, setFocusedSlot] = useState<OutfitSlot | null>(null);
  const [pickerSlot, setPickerSlot] = useState<SwappableSlot | null>(null);
  const [pressedRow, setPressedRow] = useState<OutfitSlot | null>(null);
  const pendingChoice = useRef<Readonly<{ slot: SwappableSlot; garmentTypeId: GarmentTypeId }> | null>(null);
  const boardTouched = useRef(false);
  const touchStart = useRef<Readonly<{ x: number; y: number; inBoard: boolean }> | null>(null);
  // After the first change, replaced rows and sentences fade in; nothing fades on opening.
  const [everChanged, setEverChanged] = useState(false);
  const [shownChangedFrom, setShownChangedFrom] = useState<string | null>(null);
  // Phase 8: the tour brings the first piece row about a third of the way down the screen.
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const scrollOffset = useScrollOffset(scrollRef);
  const piecesTop = useRef(0);
  const { height: windowHeight } = useWindowDimensions();
  const now = useForegroundClock();
  const messages = getMessages(language);
  const copy = messages.today;
  const changedSlots = manualMix?.changedSlots ?? [];
  const changed = changedSlots.length > 0;
  if (changed && !everChanged) setEverChanged(true);
  const presentation = createTodayPresentation(state, language, hour12, temperatureUnit, now,
    manualMix && changed && suggestionId
      ? { optionId: suggestionId, outfit: manualMix.outfit, changedSlots }
      : null);
  const suggestion =
    presentation.kind === 'loaded'
      ? presentation.suggestions.find(({ id }) => id === suggestionId)
      : undefined;
  // O15 and Phase 7: the pieces kuyara still chose keep their colours after a
  // change; only a changed piece is coloured afresh.
  const paletteKey = suggestion ? JSON.stringify([suggestion.palette, suggestion.keptColors]) : null;
  const palette = useMemo(() => {
    if (!suggestion) return null;
    return suggestion.keptColors
      ? keepGarmentColors(suggestion.keptColors.original, suggestion.palette, suggestion.keptColors.slots)
      : suggestion.palette;
    // `paletteKey` stands for both inputs; the suggestion object is rebuilt on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paletteKey]);
  // The finishing touches and the piece rows keep the colours the outfit's palette gave
  // them on Today (O15).
  const pieceRoles = useGarmentRoles(palette);
  const boardLayout = suggestion
    ? layoutGarmentBoard(suggestion.boardPieces, contentWidth, 'detail', easierToSeeOn)
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

  const entries = suggestion && palette ? pieceEntries(suggestion, palette, wardrobeItems, copy) : [];
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

  // The route turns the iOS 26 full-screen back swipe off while a piece is focused.
  const boardFocused = focusedSlot !== null;
  useEffect(() => {
    onBoardFocusChange?.(boardFocused);
  }, [boardFocused, onBoardFocusChange]);
  // A change that makes the outfit unusual says so once to VoiceOver; the value alone does
  // not. Android keeps the note's live region.
  const unusual = changed && (manualMix?.unusual ?? false);
  const wasUnusual = useRef(unusual);
  useEffect(() => {
    if (unusual && !wasUnusual.current && Platform.OS === 'ios') {
      AccessibilityInfo.announceForAccessibility(copy.manualMix.unusualAccessibilityLabel);
    }
    wasUnusual.current = unusual;
  }, [copy.manualMix.unusualAccessibilityLabel, unusual]);
  // The "changed from" line keeps its words while it collapses after a reset.
  if (suggestion?.changedFrom && suggestion.changedFrom !== shownChangedFrom) {
    setShownChangedFrom(suggestion.changedFrom);
  }

  // The board's step is stable across renders, so a render mid-drag never rebuilds its gestures.
  const choose = manualMix?.choose;
  const onBoardStep = useCallback((slot: OutfitSlot, garmentTypeId: GarmentTypeId) => {
    choose?.(slot as SwappableSlot, garmentTypeId);
  }, [choose]);
  // A picker choice plays on the board once the sheet has gone: on its dismissal, or after
  // the sheet transition if the platform reports none.
  const applyPendingChoice = useCallback(() => {
    const choice = pendingChoice.current;
    pendingChoice.current = null;
    if (choice) manualMix?.choose(choice.slot, choice.garmentTypeId);
  }, [manualMix]);
  useEffect(() => {
    if (pickerSlot !== null || pendingChoice.current === null) return undefined;
    const timer = setTimeout(applyPendingChoice, theme.motion.deliberate);
    return () => clearTimeout(timer);
  }, [applyPendingChoice, pickerSlot, theme.motion.deliberate]);

  const colorName = (family: ColorFamily | null) => family
    ? messages.catalog[`catalog.color_family.${family}`] : messages.wardrobe.colorUnspecified;
  // O8: the user's own piece is named by its palette option when it has one, else by family.
  const ownColorName = (item: WardrobeItem) => (item.colorChoice?.kind === 'option'
    ? messages.wardrobe.colorOptionNames[item.colorChoice.id] : undefined) ?? colorName(item.colorFamily);
  const swatchFill = (family: ColorFamily) => {
    const fill = colorFamilyFills[theme.colorScheme][family];
    return typeof fill === 'string' ? fill : fill[0];
  };
  const pieceName = (garmentTypeId: GarmentTypeId) => messages.catalog[`catalog.garment_type.${garmentTypeId}.name`];

  if (presentation.kind !== 'loaded' || !suggestion || !palette) {
    const missingSuggestion = presentation.kind === 'loaded';
    return (
      // The same scroll view stays mounted when the outfit arrives; it keeps the tour's ref.
      <Screen ref={scrollRef} scrollToOverflowEnabled testID="outfit-detail-screen">
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
  const categoryOf = (garmentTypeId: GarmentTypeId) =>
    getGarmentType(garmentTypeId)?.structuralCategory ?? 'top';
  // Each slot's order, the picker's and the board's: without a mix, only the piece itself.
  const candidates = Object.fromEntries(suggestion.boardPieces.map(({ slot, garmentTypeId, category }) => [
    slot,
    manualMix?.candidates[slot as SwappableSlot]?.map((candidate) => ({
      garmentTypeId: candidate.garmentTypeId, category: categoryOf(candidate.garmentTypeId),
    })) ?? [{ garmentTypeId, category }],
  ]));
  const garmentIn = (slot: OutfitSlot) =>
    suggestion.boardPieces.find((piece) => piece.slot === slot)?.garmentTypeId;
  const pickerCurrent = pickerSlot ? garmentIn(pickerSlot) : undefined;
  const pickerTarget: PiecePickerTarget | null = pickerSlot && manualMix && pickerCurrent ? {
    slot: pickerSlot,
    title: copy.slots[pickerSlot],
    current: pickerCurrent,
    options: (manualMix.candidates[pickerSlot] ?? []).map(({ garmentTypeId, suitable }) => ({
      garmentTypeId, category: categoryOf(garmentTypeId), name: pieceName(garmentTypeId), suitable,
    })),
  } : null;
  const openPicker = (slot: SwappableSlot) => {
    setFocusedSlot(null);
    setPickerSlot(slot);
  };
  const reset = () => {
    setFocusedSlot(null);
    manualMix?.reset();
  };

  const captionLayouts = new Map(boardLayout.boxes.map((box) => [box.slot, createDetailCaptionLayout(box, contentWidth)]));
  const captionRects = Object.fromEntries(boardLayout.boxes.map((box) => {
    const caption = captionLayouts.get(box.slot)!;
    return [box.slot, {
      x: caption.left, y: caption.top, w: caption.width, h: captionHeights[box.slot] ?? initialCaptionHeight,
    }];
  }));
  const renderCaption = (box: (typeof boardLayout.boxes)[number]) => {
    const entry = entryFor(box.garmentTypeId);
    if (!entry) return null;
    return (
      <View
        key={`caption-${box.slot}`}
        style={[styles.captionPosition, captionLayouts.get(box.slot)]}
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
          {entry.piece.changed ? (
            <AppText colorRole="brandAccent" style={styles.captionText} variant="caption">
              {copy.manualMix.changed}
            </AppText>
          ) : null}
        </View>
      </View>
    );
  };
  const renderBadge = (box: (typeof boardLayout.boxes)[number]) => {
    const entry = entryFor(box.garmentTypeId);
    if (!entry || entry.match.kind === 'none') return null;
    return (
      <View
        key={`badge-${box.slot}`}
        style={[styles.badge, {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.borderDefined,
          left: box.x + box.width - BADGE_SIZE * 2 / 3,
          top: box.y - BADGE_SIZE / 3,
        }]}
        testID={`outfit-detail-badge-${box.garmentTypeId}`}>
        <Icon color={theme.colors.brandAccent} name={matchIcons[entry.match.kind]} size={BADGE_GLYPH_SIZE} />
      </View>
    );
  };

  const boardOverlay = (
    <>
      {boardLayout.boxes.map(renderBadge)}
      {usesStackedLayout ? null : boardLayout.boxes.map(renderCaption)}
    </>
  );

  return (
    <Screen ref={scrollRef} scrollToOverflowEnabled testID="outfit-detail-screen">
      <View
        onLayout={({ nativeEvent }) => setContentWidth(nativeEvent.layout.width)}
        onTouchEnd={({ nativeEvent }) => {
          const start = touchStart.current;
          touchStart.current = null;
          // Any tap outside the board ends the focus; the tapped control still acts.
          if (!start || start.inBoard || focusedSlot === null) return;
          if (Math.hypot(nativeEvent.pageX - start.x, nativeEvent.pageY - start.y) <= OUTSIDE_TAP_SLOP) {
            setFocusedSlot(null);
          }
        }}
        onTouchStart={({ nativeEvent }) => {
          touchStart.current = { x: nativeEvent.pageX, y: nativeEvent.pageY, inBoard: boardTouched.current };
          boardTouched.current = false;
        }}
        testID="outfit-detail-content">

        {/* ADR 0021: three equal options, so the title carries no emphasis pill. Phase 7,
            after a change the title is the reader's and says where it came from. */}
        <View style={styles.headingGroup} testID="outfit-detail-heading-group">
          <CrossfadeTitle title={suggestion.title} />
          <Presence testID="outfit-detail-changed-from" visible={suggestion.changedFrom !== null}>
            <AppText colorRole="textSecondary" style={styles.changedFrom} variant="body">
              {suggestion.changedFrom ?? shownChangedFrom}
            </AppText>
          </Presence>
        </View>

        <View onTouchStart={() => { boardTouched.current = true; }} style={styles.boardPlate}>
          <GarmentSwapBoard
            candidates={candidates}
            captionRects={captionRects}
            entrance={{
              // The pieces leave from where Today's fitted stage drew them (P2).
              fromStageColor: stageColor,
              fromStageRadius: 26,
            }}
            focusedSlot={focusedSlot}
            labels={{
              pieceName,
              slotName: (slot) => copy.slots[slot],
              counter: copy.manualMix.counter,
              pieceValue: (piece, position, total) => copy.manualMix.pieceValue({ piece, position, total }),
              previous: copy.manualMix.previousPiece,
              next: copy.manualMix.nextPiece,
            }}
            onFocusChange={setFocusedSlot}
            onStep={onBoardStep}
            overlay={boardOverlay}
            overlayTestID="outfit-detail-caption-overlay"
            // The opened outfit keeps the palette it had on Today (O15). The plate stands on
            // the page ground, so every fill is made legible on `background`.
            palette={palette}
            pieces={suggestion.boardPieces}
            restHeight={plateHeight}
            settle={completions}
            testID="outfit-detail-board"
            width={contentWidth}
          />
        </View>

        {/* The hint names the gesture until the first change; the unusual note is a status in
            its own glyph and ink, and the two never stand together. */}
        <Presence testID="outfit-detail-edit-hint" visible={!changed}>
          <Entrance>
            <View style={styles.boardLine}>
              <Icon color={theme.colors.iconSecondary} name="info" size={16} />
              <AppText colorRole="textSecondary" style={styles.flexText} variant="caption">
                {copy.boardHint}
              </AppText>
            </View>
          </Entrance>
        </Presence>
        <Presence testID="outfit-detail-unusual" visible={unusual}>
          <View style={styles.boardLine}>
            <Icon color={theme.colors.warningInk} name="warning" size={16} />
            <AppText accessibilityLiveRegion="polite" colorRole="warningInk" style={styles.flexText} variant="caption">
              {copy.manualMix.unusual}
            </AppText>
          </View>
        </Presence>

        {/* ADR 0038: one worn record per dressing day, written only by this action. */}
        {worn === 'this' ? (
          <TourTarget id="worn" style={styles.wornAction}>
            <View
              accessible
              accessibilityLabel={copy.wornToday}
              style={[styles.wornState, { borderColor: theme.colors.borderDefined }]}
              testID="outfit-detail-worn">
              <Icon color={theme.colors.successInk} name="checkCircle" size={20} />
              <AppText variant="bodyStrong">{copy.wornToday}</AppText>
            </View>
          </TourTarget>
        ) : onWoreThis ? (
          <TourTarget id="worn" style={styles.wornAction}>
            <Button
              icon="calendarCheck"
              label={copy.wornAction}
              loading={wornBusy}
              onPress={onWoreThis}
              size="large"
              testID="outfit-detail-wore-this"
            />
          </TourTarget>
        ) : null}
        {wornError ? (
          <AppText accessibilityRole="alert" colorRole="dangerInk" style={styles.ownershipError} variant="caption">
            {wornError}
          </AppText>
        ) : null}
        <Presence testID="outfit-detail-reset" visible={changed}>
          <Button
            label={copy.manualMix.reset}
            onPress={reset}
            size="large"
            style={styles.wornAction}
            testID="outfit-detail-reset-button"
            variant="tonal"
          />
        </Presence>

        <View
          onLayout={({ nativeEvent }) => { piecesTop.current = nativeEvent.layout.y; }}
          style={styles.section}
          testID="outfit-detail-pieces">
          <AppText accessibilityRole="header" colorRole="textPrimary" variant="bodyStrong">
            {presentation.copy.piecesHeading}
          </AppText>
          <View>
            {entries.map(({ piece, slot, match, status, target, spokenLabel }, index) => {
              const pressed = pressedRow === slot;
              const rowBody = (
                <View
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                  pointerEvents="none"
                  style={[styles.rowBody, pressed && styles.rowPressed]}>
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
                  <View style={styles.rowText} testID={`outfit-detail-piece-text-${piece.garmentTypeId}`}>
                    <AppText variant="bodyStrong">{piece.item}</AppText>
                    <AppText colorRole="textSecondary" variant="caption">{piece.slot}</AppText>
                    {piece.changed ? (
                      <AppText colorRole="brandAccent" testID={`outfit-detail-piece-changed-${piece.garmentTypeId}`}
                        variant="caption">
                        {copy.manualMix.changed}
                      </AppText>
                    ) : null}
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
                            colorChoice={match.item.colorChoice ?? null}
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
                        {match.item.colorChoice ? (
                          <ClosetColorDisc
                            choice={match.item.colorChoice}
                            size={SWATCH_DOT_SIZE}
                            testID={`outfit-detail-yours-swatch-${piece.garmentTypeId}`}
                          />
                        ) : match.item.colorFamily ? (
                          <View style={[styles.swatchDot, {
                            backgroundColor: swatchFill(match.item.colorFamily),
                            borderColor: theme.colors.borderDefined,
                          }]} />
                        ) : null}
                        <AppText colorRole="textSecondary" style={styles.flexText} variant="caption">
                          {copy.ownershipYours(ownColorName(match.item))}
                        </AppText>
                      </View>
                    ) : null}
                  </View>
                  {stacksButtonPair || !manualMix ? (
                    <Icon color={theme.colors.textSecondary} name="chevronRight" size={20} />
                  ) : null}
                </View>
              );
              const change = manualMix ? (
                <Button
                  accessibilityLabel={copy.manualMix.changeAccessibilityLabel({ slot: piece.slot, piece: piece.item })}
                  label={copy.manualMix.change}
                  onPress={() => openPicker(slot as SwappableSlot)}
                  size="medium"
                  style={stacksButtonPair ? styles.changeStacked : undefined}
                  testID={`outfit-detail-change-${slot}`}
                  variant="plain"
                />
              ) : null;
              const rowLabel = [
                spokenLabel,
                piece.changed ? copy.manualMix.changed : null,
                match.kind === 'similar' ? copy.ownershipYours(ownColorName(match.item)) : null,
              ].filter(Boolean).join(', ');
              return (
                // Phase 8: the first piece row is the tour's step 2 control. The wrapper adds a
                // plain view around the whole row, so the tour lights the row, and nothing else.
                <TourTarget
                  activate={() => onEditPiece(target)}
                  id={index === 0 ? 'piece' : null}
                  key={slot}
                  label={rowLabel}
                  name={piece.item}
                  reveal={() => scrollRef.current?.scrollTo({
                    animated: true,
                    y: Math.max(0, piecesTop.current - windowHeight / 3),
                  })}
                  scrollBy={(dy) => scrollRef.current?.scrollTo({ animated: true, y: scrollOffset.get() + dy })}>
                  <View
                    style={[styles.pieceRow, easierToSeeOn && styles.pieceRowLarge, index > 0 && {
                      borderTopColor: theme.colors.borderSubtle,
                      borderTopWidth: StyleSheet.hairlineWidth,
                    }]}>
                    {/* O6: the row is the one control that opens the piece's Closet sheet; the
                        Change control above it is its own element. */}
                    <PressScale
                      accessibilityHint={copy.editPieceAccessibilityHint}
                      accessibilityLabel={rowLabel}
                      accessibilityRole="button"
                      onPress={() => onEditPiece(target)}
                      onPressIn={() => setPressedRow(slot)}
                      onPressOut={() => setPressedRow(null)}
                      style={StyleSheet.absoluteFill}
                      testID={`outfit-detail-piece-${piece.garmentTypeId}`}
                    />
                    <FadeOnChange animate={everChanged} key={piece.garmentTypeId}>
                      <View pointerEvents="box-none" style={stacksButtonPair ? styles.rowStack : styles.rowLine}>
                        {rowBody}
                        {change}
                        {stacksButtonPair || !manualMix ? null : (
                          <View
                            accessibilityElementsHidden
                            importantForAccessibility="no-hide-descendants"
                            pointerEvents="none"
                            style={pressed && styles.rowPressed}>
                            <Icon color={theme.colors.textSecondary} name="chevronRight" size={20} />
                          </View>
                        )}
                      </View>
                    </FadeOnChange>
                  </View>
                </TourTarget>
              );
            })}
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

        {/* After a change the reasons are the changed outfit's own,
            recomputed by the domain, never kuyara's pick's. */}
        {suggestion.requirementRows.length > 0 ? (
          <View style={styles.section} testID="outfit-detail-reasons">
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
          <FadeOnChange animate={everChanged} key={presentation.generationSource}>
            <AppText
              colorRole="textSecondary"
              style={styles.generationSource}
              testID="outfit-detail-generation-source"
              variant="caption">
              {presentation.generationSource}
            </AppText>
          </FadeOnChange>
        ) : null}

        <Entrance index={1}>
          <View
            accessible
            accessibilityLabel={presentation.weather.recapAccessibilityLabel}
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
      <PiecePickerSheet
        onChoose={(garmentTypeId) => {
          if (pickerSlot && garmentTypeId !== pickerCurrent) pendingChoice.current = { slot: pickerSlot, garmentTypeId };
          setPickerSlot(null);
        }}
        onDismiss={() => {
          setPickerSlot(null);
          applyPendingChoice();
        }}
        palette={palette}
        target={pickerTarget}
      />
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
    marginTop: spacing.md,
  },
  changedFrom: {
    paddingTop: spacing.xs,
  },
  boardPlate: {
    marginTop: spacing.xl,
  },
  caption: {
    alignItems: 'center',
  },
  captionPosition: {
    position: 'absolute',
  },
  captionText: {
    textAlign: 'center',
  },
  badge: {
    alignItems: 'center',
    borderRadius: BADGE_SIZE / 2,
    borderWidth: borderWidths.subtle,
    height: BADGE_SIZE,
    justifyContent: 'center',
    position: 'absolute',
    width: BADGE_SIZE,
  },
  boardLine: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    paddingTop: spacing.md,
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
    minHeight: layout.minimumTouchTarget,
    paddingHorizontal: spacing.lg,
  },
  pieceRow: {
    minHeight: layout.minimumTouchTarget,
    paddingVertical: spacing.md,
  },
  pieceRowLarge: {
    minHeight: easierToSee.rowHeight,
  },
  rowLine: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  rowStack: {
    gap: spacing.xs,
  },
  rowBody: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: spacing.md,
  },
  rowPressed: {
    opacity: interaction.pressedOpacity,
  },
  changeStacked: {
    alignSelf: 'flex-start',
    marginLeft: ROW_TILE_SIZE + spacing.md,
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
