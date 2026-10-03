import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Platform,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import Animated, { useAnimatedRef, useScrollOffset } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HeaderHeightContext } from 'expo-router/react-navigation';

import {
  AppText,
  Button,
  Crossfade,
  GarmentSwapBoard,
  Icon,
  keepGarmentColors,
  layoutGarmentBoard,
  Presence,
  Screen,
  haptics,
  swapRevealScroll,
  useGarmentRoles,
} from '@/components/ui';
import { useErrorAnnouncement } from '@/components/ui/use-error-announcement';
import { getGarmentType } from '@/features/catalog/domain/garment-catalog';
import type { GarmentTypeId } from '@/features/catalog/domain/garment-taxonomy';
import type { RecommendedOutfit } from '@/features/recommendation/application/recommend-outfits';
import type { ManualMix } from '@/features/recommendation/application/use-manual-mix';
import type { SwappableSlot } from '@/features/recommendation/domain/manual-mix';
import type { OutfitSlot } from '@/features/recommendation/domain/outfit-composition';
import type { WornPieceColors } from '@/features/recommendation/domain/outfit-history';
import type { ClosetSeedOffer, OutfitWornState } from '@/features/today/application/outfit-detail-state';
import {
  type NameRect,
  OutfitDetailBoardHint,
  OutfitDetailNameRow,
} from '@/features/today/presentation/outfit-detail-board-names';
import { pieceEntries } from '@/features/today/presentation/outfit-detail-entries';
import { OutfitDetailClosetSeed, OutfitDetailPieceRows } from '@/features/today/presentation/outfit-detail-pieces';
import { OutfitDetailRecap } from '@/features/today/presentation/outfit-detail-recap';
import { OutfitDetailWhy, useWhyInView } from '@/features/today/presentation/outfit-detail-why';
import {
  OutfitDetailWorn,
  type WornControl,
  type WornSwap,
} from '@/features/today/presentation/outfit-detail-worn';
import { OutfitShareAction } from '@/features/today/presentation/outfit-share';
import { pieceOwnershipMarkers } from '@/features/today/presentation/piece-ownership-marker';
import {
  PiecePickerSheet,
  type PiecePickerTarget,
} from '@/features/today/presentation/piece-picker-sheet';
import { createTodayPresentation } from '@/features/today/presentation/today-presentation';
import { useForegroundClock } from '@/hooks/use-foreground-clock';
import { useStableValue } from '@/hooks/use-stable-value';
import type { TodayScreenState } from '@/features/today/model';
import type { WardrobeEntryState, WardrobeItem } from '@/features/wardrobe/domain/wardrobe-item';
import type { PieceSheetTarget } from '@/features/wardrobe/presentation/piece-edit-sheet';
import { getMessages, type SupportedLanguage } from '@/localization/messages';
import { useLocalization } from '@/localization/use-messages';
import { layout, plateTheme, spacing } from '@/theme/theme';
import { useEasierToSee } from '@/theme/easier-to-see';
import { PlateView } from '@/theme/plate-theme';
import { useKuyaraTheme } from '@/theme/theme-context';

// A tap outside the board ends the focus only when the finger did not travel: a scroll keeps it.
const OUTSIDE_TAP_SLOP = 10;

type OutfitDetailScreenProps = Readonly<{
  state: TodayScreenState;
  language: SupportedLanguage;
  suggestionId: string | undefined;
  /** The active Closet records; O7 matches each piece against them, on this screen only. */
  wardrobeItems: readonly WardrobeItem[];
  /** O6: a piece row opens the piece's Closet sheet. */
  onEditPiece: (target: PieceSheetTarget) => void;
  worn?: OutfitWornState;
  wornBusy?: boolean;
  wornError?: string | null;
  /** Receives the swatch each piece is drawn in on this board, so History draws the day the same. */
  onWoreThis?: (pieceColors: WornPieceColors) => void;
  /**
   * Phase 7: the open outfit's manual mix, owned by the route so leaving detail forgets it.
   * Absent, the pieces cannot change.
   */
  manualMix?: ManualMix<RecommendedOutfit> | null;
  /** Phase 7: a board piece is enlarged, so the route turns the full-screen back swipe off. */
  onBoardFocusChange?: (focused: boolean) => void;
  /** The board's one-time swipe hint is still due; see `GarmentSwapBoard`. */
  swipeHint?: boolean;
  onSwipeHintShown?: () => void;
  /** Present only while the Closet is empty, or right after this offer filled it. */
  closetSeed?: ClosetSeedOffer | null;
}>;

export function OutfitDetailScreen({
  state,
  language,
  suggestionId,
  wardrobeItems,
  onEditPiece,
  worn = 'unknown',
  wornBusy = false,
  wornError = null,
  onWoreThis,
  manualMix = null,
  onBoardFocusChange,
  swipeHint = false,
  onSwipeHintShown,
  closetSeed = null,
}: OutfitDetailScreenProps) {
  const theme = useKuyaraTheme();
  const easierToSeeOn = useEasierToSee();
  const { hour12, temperatureUnit } = useLocalization();
  // The column's width is seeded from the window, as `Screen` lays it out, so the board is
  // drawn on the first frame: a zoom from a Today alternative grows the finished screen
  // instead of one whose board appears after its own layout. The layout event then confirms it.
  const { width: windowWidth } = useWindowDimensions();
  const [contentWidth, setContentWidth] = useState(
    () => Math.max(0, Math.min(windowWidth, layout.maxContentWidth) - 2 * spacing.lg),
  );
  // ADR 0026 section 3: the name buttons under the board, measured in the row, and the row's height.
  const [nameRects, setNameRects] = useState<Readonly<Partial<Record<OutfitSlot, NameRect>>>>({});
  const [nameRowHeight, setNameRowHeight] = useState<number | null>(null);
  const [completions, setCompletions] = useState(0);
  const [focusedSlot, setFocusedSlot] = useState<OutfitSlot | null>(null);
  const [pickerSlot, setPickerSlot] = useState<SwappableSlot | null>(null);
  const [pressedRow, setPressedRow] = useState<OutfitSlot | null>(null);
  // "Add this to my Closet" asks once, in place: the ownership answer the pieces go in with.
  const [seedAsking, setSeedAsking] = useState(false);
  const [seedAnswer, setSeedAnswer] = useState<WardrobeEntryState | null>(null);
  const pendingChoice = useRef<Readonly<{ slot: SwappableSlot; garmentTypeId: GarmentTypeId }> | null>(null);
  const boardTouched = useRef(false);
  const touchStart = useRef<Readonly<{ x: number; y: number; inBoard: boolean }> | null>(null);
  // After the first change, replaced rows and sentences fade in; nothing fades on opening.
  const [everChanged, setEverChanged] = useState(false);
  const [shownChangedFrom, setShownChangedFrom] = useState<string | null>(null);
  const boardRef = useRef<View>(null);
  const insets = useSafeAreaInsets();
  // The stack's measured header height: the navigation bar's bottom edge in window points.
  const headerHeight = use(HeaderHeightContext);
  // Phase 8: the tour brings the first piece row about a third of the way down the screen.
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const scrollOffset = useScrollOffset(scrollRef);
  const piecesTop = useRef(0);
  const { height: windowHeight } = useWindowDimensions();
  // "Why this outfit" draws its lines once the whole section stands clear of the floating tab
  // bar; see `useWhyInView`.
  const { whyRef, whyInView, onWhyLayout } = useWhyInView(
    scrollOffset, windowHeight - insets.bottom - layout.minimumTouchTarget);
  const now = useForegroundClock();
  // Both are built once per input: React Compiler treats a hook's result as final, so the
  // values derived from them below keep their identity across the screen's own state changes
  // (a focused piece) instead of redrawing the board and the rows each time.
  const messages = useMemo(() => getMessages(language), [language]);
  const copy = messages.today;
  const changed = (manualMix?.changedSlots.length ?? 0) > 0;
  if (changed && !everChanged) setEverChanged(true);
  const presentation = useMemo(() => createTodayPresentation(state, language, hour12, temperatureUnit, now,
    manualMix && changed && suggestionId
      ? { optionId: suggestionId, outfit: manualMix.outfit, changedSlots: manualMix.changedSlots }
      : null), [changed, hour12, language, manualMix, now, state, suggestionId, temperatureUnit]);
  const suggestion =
    presentation.kind === 'loaded'
      ? presentation.suggestions.find(({ id }) => id === suggestionId)
      : undefined;
  // O15 and Phase 7: the pieces kuyara still chose keep their colours after a
  // change; only a changed piece is coloured afresh. The suggestion is rebuilt on every
  // render, so the palette keeps one instance per content.
  const palette = useStableValue(suggestion
    ? suggestion.keptColors
      ? keepGarmentColors(suggestion.keptColors.original, suggestion.palette, suggestion.keptColors.slots)
      : suggestion.palette
    : null);
  // The finishing touches and the piece rows keep the colours the outfit's palette gave
  // them on Today (O15).
  const pieceRoles = useGarmentRoles(palette, theme.colors.garmentGround);
  const boardLayout = useMemo(() => suggestion
    ? layoutGarmentBoard(suggestion.boardPieces, contentWidth, 'detail', easierToSeeOn)
    : { height: 0, boxes: [] }, [contentWidth, easierToSeeOn, suggestion]);
  // The plate is the board and, under it, its row of name buttons (ADR 0026 section 3): no name is
  // drawn over a garment, so the worn board's pieces may overlap.
  const nameRowTop = boardLayout.height + spacing.sm;
  const plateHeight = nameRowTop + (nameRowHeight ?? layout.minimumTouchTarget);

  const entries = useMemo(() => suggestion && palette ? pieceEntries(suggestion, palette, wardrobeItems, copy) : [],
    [copy, palette, suggestion, wardrobeItems]);
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

  // Law 7's second moment: recording "Wore this today" settles the board once, with Law 8's
  // success notification instead of the press's own impact. Only a save running here asks for
  // it (the press itself, and the save a confirmed replacement starts after the first read
  // came back without this outfit), and a failed save, or a save that ends without this
  // outfit (a declined replacement), forgets the ask, so a worn record read on opening or a
  // change back to the worn outfit stays still.
  const [wearAsked, setWearAsked] = useState(false);
  const [wornMoments, setWornMoments] = useState(0);
  const [wasWornBusy, setWasWornBusy] = useState(wornBusy);
  if (wasWornBusy !== wornBusy) {
    setWasWornBusy(wornBusy);
    if (wornBusy) setWearAsked(true);
  }
  if (wearAsked && (worn === 'this' || wornError || (wasWornBusy && !wornBusy))) {
    setWearAsked(false);
    if (worn === 'this') setWornMoments((count) => count + 1);
  }
  useEffect(() => {
    if (wornMoments > 0) haptics.success();
  }, [wornMoments]);

  // The route turns the iOS 26 full-screen back swipe off while a piece is focused.
  const boardFocused = focusedSlot !== null;
  useEffect(() => {
    onBoardFocusChange?.(boardFocused);
  }, [boardFocused, onBoardFocusChange]);
  // VoiceOver ignores the alert role, so iOS hears a failed "Wore this" save spoken once.
  useErrorAnnouncement(wornError);
  // The failed-save line keeps its words while it closes after a retry.
  const [shownWornError, setShownWornError] = useState(wornError);
  if (wornError && wornError !== shownWornError) setShownWornError(wornError);
  // "Wore this" and the worn state replace each other in place: the leaving one fades out on
  // `fast` over the arriving one, which fades in on `normal`. Nothing fades on opening.
  const wornShown: WornControl | null = worn === 'this' ? 'state' : onWoreThis ? 'action' : null;
  const [wornSwap, setWornSwap] = useState<WornSwap>({ current: wornShown, previous: null, previousBusy: false, changes: 0 });
  if (wornSwap.current !== wornShown) {
    setWornSwap({ current: wornShown, previous: wornSwap.current, previousBusy: wornBusy, changes: wornSwap.changes + 1 });
  }
  const clearWornPrevious = useCallback(() => setWornSwap((value) => ({ ...value, previous: null })), []);
  const unusual = changed && (manualMix?.unusual ?? false);
  const wasUnusual = useRef(unusual);
  // A board tile or swipe waits here until the change it asked for has rendered.
  const spokenStep = useRef<Readonly<{ slot: SwappableSlot; garmentTypeId: GarmentTypeId }> | null>(null);
  // The "changed from" line keeps its words while it collapses after a reset. It opens or
  // closes only while no piece is enlarged: when the strip starts closing it opens with it, so
  // the height above the board and the one under it change in one motion, never one after
  // the other.
  if (suggestion?.changedFrom && suggestion.changedFrom !== shownChangedFrom) {
    setShownChangedFrom(suggestion.changedFrom);
  }
  const [changedFromShown, setChangedFromShown] = useState(suggestion?.changedFrom != null);
  const changedFromWanted = suggestion?.changedFrom != null;
  if (focusedSlot === null && changedFromShown !== changedFromWanted) setChangedFromShown(changedFromWanted);

  // The board's step is stable across renders, so a render mid-drag never rebuilds its gestures.
  const choose = manualMix?.choose;
  const onBoardStep = useCallback((slot: OutfitSlot, garmentTypeId: GarmentTypeId, spoken: boolean) => {
    if (spoken) spokenStep.current = { slot: slot as SwappableSlot, garmentTypeId };
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

  const pieceName = (garmentTypeId: GarmentTypeId) => messages.catalog[`catalog.garment_type.${garmentTypeId}.name`];

  // One announcement per change, never two that cut each other off (final-spec section 8):
  // a board tile or swipe names the new piece and its place, and says in the same
  // announcement when the change made the outfit unusual; any other change that makes it
  // unusual says only that. Android keeps the note's live region for the note.
  useEffect(() => {
    const step = spokenStep.current;
    spokenStep.current = null;
    const becameUnusual = unusual && !wasUnusual.current && Platform.OS === 'ios';
    wasUnusual.current = unusual;
    if (step) {
      const order = manualMix?.candidates[step.slot] ?? [];
      const values = {
        piece: pieceName(step.garmentTypeId),
        position: order.findIndex(({ garmentTypeId }) => garmentTypeId === step.garmentTypeId) + 1,
        total: order.length,
      };
      AccessibilityInfo.announceForAccessibility(becameUnusual
        ? copy.manualMix.stepUnusual(values) : copy.manualMix.pieceValue(values));
    } else if (becameUnusual) {
      AccessibilityInfo.announceForAccessibility(copy.manualMix.unusualAccessibilityLabel);
    }
  });

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
  const tradeoffs = suggestion.requirementRows.filter(({ kind }) => kind === 'tradeoff');
  const categoryOf = (garmentTypeId: GarmentTypeId) =>
    getGarmentType(garmentTypeId)?.structuralCategory ?? 'top';
  // Each slot's order, the picker's and the board's: without a mix, only the piece itself.
  const candidates = Object.fromEntries(suggestion.boardPieces.map(({ slot, garmentTypeId, category }) => [
    slot,
    manualMix?.candidates[slot as SwappableSlot]?.map((candidate) => ({
      garmentTypeId: candidate.garmentTypeId, category: categoryOf(candidate.garmentTypeId), suitable: candidate.suitable,
    })) ?? [{ garmentTypeId, category, suitable: true }],
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
  // An enlargement brings the strip into view by the least scroll that shows it, never so far
  // that the enlarged piece leaves the top. The board fits itself between the bars first.
  // The band the bars leave visible, both edges as the system lays them out: the header ends at
  // the navigation bar's bottom edge (54 points under the status bar on iOS 26), and a tab's
  // bottom inset already holds the tab bar. With no header (a render outside the stack)
  // nothing covers the top but the status bar.
  const visibleTop = headerHeight ?? insets.top;
  const visibleBottom = windowHeight - insets.bottom;
  const revealStrip = (area: Readonly<{ pieceTop: number; panelBottom: number }>) => {
    boardRef.current?.measureInWindow((_x, boardTop) => {
      const delta = swapRevealScroll(area, boardTop, { top: visibleTop, bottom: visibleBottom });
      if (delta > 0) scrollRef.current?.scrollTo({ animated: true, y: scrollOffset.get() + delta });
    });
  };

  // Each name button's rectangle in board points: a tap on it enlarges its piece on the board.
  const captionRects = Object.fromEntries(Object.entries(nameRects).map(([slot, rect]) => [slot, {
    x: rect.x, y: nameRowTop + rect.y, w: rect.w, h: rect.h,
  }]));
  // The names, the hint and their marks stand on the board's plate.
  const onBoard = plateTheme(theme, theme.colors.garmentGround).colors;
  // Where the board's plate shows (the dark appearance), the hint and the names keep off its edge.
  const plateShown = theme.colors.garmentGround !== theme.colors.background;
  const boardHint = (
    <OutfitDetailBoardHint everChanged={everChanged} onBoard={onBoard} plateShown={plateShown} text={copy.boardHint} />
  );
  const boardOverlay = (
    <OutfitDetailNameRow
      boardPieces={suggestion.boardPieces}
      entries={entries}
      nameRects={nameRects}
      nameRowHeight={nameRowHeight}
      onBoard={onBoard}
      plateShown={plateShown}
      setNameRects={setNameRects}
      setNameRowHeight={setNameRowHeight}
      top={nameRowTop}
    />
  );
  const revealFirstPiece = () => scrollRef.current?.scrollTo({
    animated: true,
    y: Math.max(0, piecesTop.current - windowHeight / 3),
  });
  const scrollBy = (dy: number) => scrollRef.current?.scrollTo({ animated: true, y: scrollOffset.get() + dy });

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
            after a change the title is the reader's and says where it came from.
            The title changes in place at once; "Changed from" opens once no piece is enlarged. */}
        <View style={styles.headingGroup} testID="outfit-detail-heading-group">
          <Crossfade contentKey={suggestion.title}>
            <AppText accessibilityRole="header" variant="title">{suggestion.title}</AppText>
          </Crossfade>
          <Presence testID="outfit-detail-changed-from" visible={changedFromShown}>
            <AppText colorRole="textSecondary" style={styles.changedFrom} variant="body">
              {suggestion.changedFrom ?? shownChangedFrom}
            </AppText>
          </Presence>
        </View>

        <PlateView color={theme.colors.garmentGround} onTouchStart={() => { boardTouched.current = true; }} ref={boardRef}
          style={styles.boardPlate}>
          <GarmentSwapBoard
            candidates={candidates}
            captionRects={captionRects}
            entrance={{
              // The pieces leave from where Today's fitted stage drew them (P2).
              fromStageColor: stageColor,
              fromStageRadius: 26,
            }}
            focusedSlot={focusedSlot}
            hint={boardHint}
            hintVisible={!changed}
            labels={{
              pieceName,
              slotName: (slot) => copy.slots[slot],
              counter: copy.manualMix.counter,
              pieceValue: (piece, position, total) => copy.manualMix.pieceValue({ piece, position, total }),
              done: copy.manualMix.done,
              otherHint: copy.manualMix.otherPieceHint,
              stripShown: copy.manualMix.stripShown,
              pieceState: (garmentTypeId) => {
                const kind = entryFor(garmentTypeId)?.match.kind;
                return kind ? pieceOwnershipMarkers[kind].spoken(copy) : null;
              },
            }}
            onFocusChange={setFocusedSlot}
            onReveal={revealStrip}
            onStep={onBoardStep}
            onSwipeHintShown={onSwipeHintShown}
            overlay={boardOverlay}
            overlayTestID="outfit-detail-caption-overlay"
            // The opened outfit keeps the palette it had on Today (O15). The plate stands on
            // the page ground, so every fill is made legible on `background`.
            palette={palette}
            pieces={suggestion.boardPieces}
            restHeight={plateHeight}
            settle={completions + wornMoments}
            swipeHint={swipeHint}
            testID="outfit-detail-board"
            visibleHeight={visibleBottom - visibleTop}
            width={contentWidth}
          />
        </PlateView>

        {/* The unusual note is a status in its own glyph and ink; it stands only after a
            change, when the hint has gone, so the two never stand together. */}
        <Presence testID="outfit-detail-unusual" visible={unusual}>
          <View style={styles.boardLine}>
            <Icon color={theme.colors.warningInk} name="warning" size={16} />
            <AppText accessibilityLiveRegion="polite" colorRole="warningInk" style={styles.flexText} variant="caption">
              {copy.manualMix.unusual}
            </AppText>
          </View>
        </Presence>

        <OutfitDetailWorn
          copy={copy}
          onPreviousDone={clearWornPrevious}
          onWoreThis={onWoreThis}
          palette={palette}
          wornBusy={wornBusy}
          wornShown={wornShown}
          wornSwap={wornSwap}
        />
        <Presence testID="outfit-detail-worn-error" visible={Boolean(wornError)}>
          <AppText accessibilityRole="alert" colorRole="dangerInk" style={styles.wornError} variant="caption">
            {wornError ?? shownWornError}
          </AppText>
        </Presence>
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

        <OutfitDetailWhy
          copy={copy}
          onWhyLayout={onWhyLayout}
          pieceRoles={pieceRoles}
          tradeoffs={tradeoffs}
          weatherLinks={suggestion.weatherLinks}
          whyInView={whyInView}
          whyRef={whyRef}
        />

        <View
          onLayout={({ nativeEvent }) => { piecesTop.current = nativeEvent.layout.y; }}
          style={styles.section}
          testID="outfit-detail-pieces">
          <AppText accessibilityRole="header" colorRole="textPrimary" variant="bodyStrong">
            {presentation.copy.piecesHeading}
          </AppText>
          {closetSeed ? (
            <OutfitDetailClosetSeed
              closetSeed={closetSeed}
              copy={copy}
              entries={entries}
              seedAnswer={seedAnswer}
              seedAsking={seedAsking}
              setSeedAnswer={setSeedAnswer}
              setSeedAsking={setSeedAsking}
            />
          ) : null}
          <OutfitDetailPieceRows
            canChange={Boolean(manualMix)}
            easierToSeeOn={easierToSeeOn}
            entries={entries}
            everChanged={everChanged}
            messages={messages}
            onEditPiece={onEditPiece}
            openPicker={openPicker}
            pieceRoles={pieceRoles}
            pressedRow={pressedRow}
            revealFirstPiece={revealFirstPiece}
            scrollBy={scrollBy}
            setPressedRow={setPressedRow}
          />
        </View>

        <OutfitDetailRecap
          accessories={suggestion.accessories}
          copy={copy}
          everChanged={everChanged}
          pieceRoles={pieceRoles}
          presentation={presentation}
          stageColor={stageColor}
        />
      </View>
      <OutfitShareAction palette={palette} presentation={presentation} suggestion={suggestion} />
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
  headingGroup: {
    marginTop: spacing.md,
  },
  changedFrom: {
    paddingTop: spacing.xs,
  },
  boardPlate: {
    borderRadius: 26,
    marginTop: spacing.xl,
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
  wornError: {
    marginTop: spacing.sm,
  },
  section: {
    gap: spacing.md,
    marginTop: spacing.md,
  },
});
