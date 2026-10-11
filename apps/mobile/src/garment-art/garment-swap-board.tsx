import { useMemo, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';

import type { GarmentSwatchId } from '@/features/catalog/domain/garment-swatch';
import type { GarmentTypeId } from '@/features/catalog/domain/garment-taxonomy';
import type { OutfitSlot } from '@/features/recommendation/domain/outfit-composition';
import { boardSwatchesInClosetOrder } from '@/features/wardrobe/domain/closet-board-swatch';
import { useStableValue } from '@/hooks/use-stable-value';
import { easierToSee as easierToSeeValues, useEasierToSee } from '@/theme/easier-to-see';
import { spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

import { fadeEasing } from '@/components/ui/fade';
import { GlassButton, glassButtonSize } from '@/components/ui/glass-button';
import { useTextScaling } from '@/components/ui/use-text-scaling';
import {
  measureGarmentBoardHeight,
  pieceShadowOf,
  useGarmentCandidateRoles,
  useSwatchedCandidateRoles,
  type GarmentBoardPiece,
} from './garment-board';
import { useGarmentCut } from './garment-cut';
import {
  garmentNaturalSwatches,
  garmentSwatchesBySlot,
  type GarmentOutfitPalette,
  type GarmentRoles,
} from './garment-palette';
import { GARMENT_OUTLINE } from './garment-painting';
import {
  GarmentSwapStrip,
  type GarmentSwapOwnPiece,
  type GarmentSwapStripColors,
  type GarmentSwapStripLabels,
  type GarmentSwapStripOwn,
} from './garment-swap-strip';
import { SWAP_STEP_BACK, swapChevrons, swapScaledBox } from './swap-gesture';
import { SwapPieceTarget } from './swap-piece-target';
import { SwapPieceView } from './swap-piece-view';
import { SwapStageTint } from './swap-stage-tint';
import { drawingKey, neighbourIn, type Box, type GarmentSwapCandidate, type Role } from './swap-reconcile';
import { useSwapBlock } from './use-swap-block';
import { pagedInstances, useSwapGesture } from './use-swap-gesture';
import { useSwipeHint } from './use-swap-hint';
import { useSwapMotion } from './use-swap-motion';
import { useSwapPager } from './use-swap-pager';

export type { GarmentSwapCandidate } from './swap-reconcile';
export type { GarmentSwapOwnPiece } from './garment-swap-strip';

export type GarmentSwapBoardLabels = GarmentSwapStripLabels & Readonly<{
  slotName: (slot: OutfitSlot) => string;
  /** The colour row's group name, one whole phrase per slot. */
  colorGroup: (slot: OutfitSlot) => string;
  /** The chevrons' names, each naming the piece it steps to. */
  previousPiece: (piece: string) => string;
  nextPiece: (piece: string) => string;
  /** Spoken when VoiceOver's activate enlarges a piece: the strip has opened below it. */
  stripShown: string;
  /** Spoken after a board piece's value: where the reader's Closet already has it, if anywhere. */
  pieceState?: (garmentTypeId: GarmentTypeId) => string | null;
  /** The strip header's plain "Take off", and the whole sentence it and the piece's action speak. */
  takeOff?: string;
  takeOffAccessibilityLabel?: (slot: OutfitSlot) => string;
}>;

export type GarmentSwapBoardProps = Readonly<{
  pieces: readonly GarmentBoardPiece[];
  /** The outfit's palette inputs (O15), kept colours included (Phase 7). */
  palette: GarmentOutfitPalette;
  width: number;
  /** Each changeable slot's candidates in picker order. */
  candidates: Readonly<Partial<Record<OutfitSlot, readonly GarmentSwapCandidate[]>>>;
  focusedSlot: OutfitSlot | null;
  onFocusChange: (slot: OutfitSlot | null) => void;
  /**
   * One step to another candidate: the owner applies it and hands the board the new pieces.
   * `spoken` is true for a tile or a swipe, which the owner announces once the change is
   * known (with the unusual note in the same sentence); an adjustable step speaks its value.
   */
  onStep: (slot: OutfitSlot, garmentTypeId: GarmentTypeId, spoken: boolean) => void;
  /** The plate at rest: the composed stage, or the lowest caption under it. */
  restHeight: number;
  /**
   * The name buttons under the board at rest (ADR 0026 section 3), in board points: a tap on one
   * enlarges its piece exactly as a tap on the piece does.
   */
  captionRects: Readonly<Partial<Record<OutfitSlot, Box>>>;
  /** The screen's name buttons; they step back while a piece is enlarged or moving. */
  overlay: ReactNode;
  overlayTestID?: string;
  /**
   * Where the board stands on a visible plate: the strip keeps this far off the plate's sides.
   * The drawing keeps its own margins and the board's full width.
   */
  inset?: number;
  /** The line under the board at rest; the strip takes its place while a piece is enlarged. It may hold a control. */
  hint?: ReactNode;
  hintVisible?: boolean;
  labels: GarmentSwapBoardLabels;
  /**
   * Where the pieces leave from (ADR 0026 section 7), in `fromStageColor`: exactly where Today's
   * band drew them, the band `fromWidth` wide, centred on this board and cornerless; or, with
   * `fromWidth` null, Today's fitted stage at this board's width, with the stage's corners.
   */
  entrance: Readonly<{ fromStageColor: string; fromWidth: number | null }>;
  /** Law 7's moment: change it and the pieces settle once. */
  settle?: number;
  /** An enlargement asks its owner to bring the strip into view, in board points. */
  onReveal?: (area: Readonly<{ pieceTop: number; panelBottom: number }>) => void;
  /**
   * The page's height between its bars. An enlarged board whose stage and strip are taller
   * composes narrower until they fit (ADR 0026 section 6). Left out, the board keeps its width.
   */
  visibleHeight?: number;
  /**
   * The first enlargement shows the next candidate at the window's edge once, telling the
   * piece pages sideways. The owner passes true until the hint has played for good.
   */
  swipeHint?: boolean;
  /** Called once, as the hint starts, so the owner can store that it played. */
  onSwipeHintShown?: () => void;
  /**
   * The slots whose piece the reader may take off. The owner applies it and clears the focus in
   * the same render, so the board lays out without the piece and no enlargement outlives it.
   */
  takeOffSlots?: readonly OutfitSlot[];
  onTakeOff?: (slot: OutfitSlot) => void;
  /**
   * Paints the enlarged piece in a swatch: the strip offers its drawing's own colours and, behind
   * "More colours", the Closet's 33. The owner applies it to the palette. Absent, no colour shows.
   */
  onPaint?: (slot: OutfitSlot, garmentTypeId: GarmentTypeId, swatchId: GarmentSwatchId) => void;
  /** The reader's own Closet pieces by slot: a tap wears that type in that colour. */
  ownPieces?: Readonly<Partial<Record<OutfitSlot, readonly GarmentSwapOwnPiece[]>>>;
  /** The Closet marker an own piece carries. */
  ownBadge?: ReactNode;
  testID?: string;
}>;

/**
 * Phase 7b's directly editable detail board: tap a piece and it
 * grows in place while the others step back beside it; swipe it, press a chevron beside it, or tap a tile
 * in the strip under the stage, to change it while it is large, and paint it or wear one of the
 * reader's own pieces from the same strip. Every committed set is laid out again by ADR 0025's
 * `compose()`; the enlarged slot pages opaque inside its window, other pieces glide to their
 * new boxes on `springs.spatial`. One block height carries the stage and the hint or the
 * strip, so everything under the board moves once. Feature code hands it pieces, candidates,
 * strings and callbacks and never authors a spring.
 */
export function GarmentSwapBoard({
  pieces: piecesProp,
  palette,
  width,
  candidates: candidatesProp,
  focusedSlot,
  onFocusChange,
  onStep,
  restHeight,
  captionRects: captionRectsProp,
  overlay,
  overlayTestID,
  hint = null,
  hintVisible = false,
  inset = 0,
  labels,
  entrance,
  settle,
  onReveal,
  visibleHeight = 0,
  swipeHint = false,
  onSwipeHintShown,
  takeOffSlots,
  onTakeOff,
  onPaint,
  ownPieces,
  ownBadge = null,
  testID,
}: GarmentSwapBoardProps) {
  const theme = useKuyaraTheme();
  const fadeEase = useMemo(() => fadeEasing(theme.motion), [theme.motion]);
  const { colors } = theme;
  const large = useEasierToSee();
  const cut = useGarmentCut();
  const outline = large ? easierToSeeValues.boardOutline : undefined;
  const drawnOutline = outline ?? GARMENT_OUTLINE;
  const shadow = pieceShadowOf(width, colors.background, theme.colorScheme);
  const { normal } = theme.motion;
  const boardTestID = testID ?? 'garment-swap-board';

  const pieces = useStableValue(piecesProp);
  const candidates = useStableValue(candidatesProp);
  const captionRects = useStableValue(captionRectsProp);

  const columnWidth = width - 2 * inset;
  // "More colours" stays open for the enlargement that opened it.
  const [moreFor, setMoreFor] = useState<OutfitSlot | null>(null);
  if (focusedSlot === null && moreFor !== null) setMoreFor(null);
  // The colour row holds room for the slot's longest colourway, so a step never moves a tile.
  const sectionsOf = (slot: OutfitSlot, opened?: boolean) => ({
    colors: !onPaint ? 0 : (opened ?? moreFor === slot) ? boardSwatchesInClosetOrder.length
      : Math.max(0, ...(candidates[slot] ?? []).map(({ garmentTypeId }) => garmentNaturalSwatches(garmentTypeId).length)) + 1,
    own: ownPieces?.[slot]?.length ?? 0,
  });

  const {
    compose, composed, fit, activeGrow, pager,
    panels, setPanels, previewId, setPreviewId,
    stripCandidates, stripOf, panelHeightOf, measureHeader, measureOwnLabel,
  } = useSwapPager({ pieces, candidates, width, columnWidth, large, focusedSlot, visibleHeight, outline: drawnOutline, sectionsOf });
  const { model, setModel, settled, arrived, tint, settleTravel, stageLimit, removeLeaving, dropBig } = useSwapMotion({
    pieces, palette, width, large, focusedSlot, candidates, entrance, settle,
    compose, composed, fit, activeGrow, pager,
  });
  const {
    heldStage, hintMounted, measureHint, stripLive, blockStyle, hintStyle, panelStyle, leavingPanelStyle,
  } = useSwapBlock({
    focusedSlot, hintVisible, restHeight, settled, activeGrow, pager, panels, setPanels, panelHeightOf, onReveal,
  });
  const { instances } = model;
  const paged = pagedInstances(instances, focusedSlot);
  const hintGrabbed = useSwipeHint({ focusedSlot, swipeHint, settled, pager, paged, onSwipeHintShown });
  const { gesture, markerX, markerY, settleToPiece, stepSlot, chooseTile, pieceTargets } = useSwapGesture({
    boardTestID, focusedSlot, composed, pager, captionRects, candidates, model, setModel, setPreviewId,
    removeLeaving, paged, stripOf, stripCandidates, hintGrabbed, onFocusChange, onStep,
  });

  const panelSlot = panels.current?.slot ?? null;
  const panelRoles = useGarmentCandidateRoles(palette, panelSlot,
    (panelSlot ? stripCandidates(panelSlot) : []).map(({ garmentTypeId }) => garmentTypeId));
  const leavingSlot = panels.leaving?.slot ?? null;
  const leavingRoles = useGarmentCandidateRoles(palette, leavingSlot,
    (leavingSlot ? stripCandidates(leavingSlot) : []).map(({ garmentTypeId }) => garmentTypeId));
  const ownOf = (slot: OutfitSlot | null) => (slot ? ownPieces?.[slot] ?? [] : [])
    .map(({ id, garmentTypeId, swatchId }) => ({ key: id, garmentTypeId, swatchId }));
  const panelOwnRoles = useSwatchedCandidateRoles(palette, panelSlot, ownOf(panelSlot));
  const leavingOwnRoles = useSwatchedCandidateRoles(palette, leavingSlot, ownOf(leavingSlot));
  // The swatch each piece is drawn in: the colour row rings the enlarged piece's.
  const drawnSwatches = useMemo(() => garmentSwatchesBySlot(palette), [palette]);
  const paintFor = (slot: OutfitSlot): GarmentSwapStripColors | null => {
    const garmentTypeId = model.garments[slot];
    if (!onPaint || !garmentTypeId) return null;
    const opened = moreFor === slot;
    return {
      swatches: opened ? boardSwatchesInClosetOrder : garmentNaturalSwatches(garmentTypeId),
      held: sectionsOf(slot).colors,
      current: drawnSwatches[slot] ?? null,
      label: labels.colorGroup(slot),
      onMore: opened ? null : () => setMoreFor(slot),
      onPaint: (swatchId) => onPaint(slot, garmentTypeId, swatchId),
    };
  };
  // An own piece is its type in its colour: a tile's step, then the paint.
  const ownFor = (slot: OutfitSlot, roles: ReadonlyMap<string, GarmentRoles>): GarmentSwapStripOwn | null => {
    const own = ownPieces?.[slot] ?? [];
    return own.length === 0 ? null : {
      pieces: own,
      roles,
      badge: ownBadge,
      onChoose: (piece) => {
        if (model.garments[slot] !== piece.garmentTypeId) chooseTile(piece.garmentTypeId);
        onPaint?.(slot, piece.garmentTypeId, piece.swatchId);
      },
    };
  };

  // Captions and badges leave at once when a piece starts to move: the commit that hands the
  // board new pieces or a focus hides them, so none is drawn over a moving piece and none is
  // renamed before its piece changes. They return on `normal` once every piece rests, and stay
  // laid out while away, so the plate keeps their measured height.
  const overlayShown = settled && focusedSlot === null && !model.relayouting;
  const overlayStyle = useAnimatedStyle(() => ({
    opacity: overlayShown ? withTiming(1, { duration: normal, easing: fadeEase }) : 0,
  }), [fadeEase, normal, overlayShown]);

  // The pieces lie as the flat lay stacks them, so where two cross the later lies over the
  // earlier; the enlarged slot is drawn over them all, so an overlapped piece comes fully into view.
  const drawOrder: Role[] = ['current', 'leaving', 'previous', 'next'];
  const stack = composed?.stack ?? [];
  const sortedInstances = [...instances].sort((a, b) =>
    Number(a.slot === focusedSlot) - Number(b.slot === focusedSlot)
    || stack.indexOf(a.slot) - stack.indexOf(b.slot)
    || drawOrder.indexOf(a.role) - drawOrder.indexOf(b.role));
  const stageHeight = focusedSlot && activeGrow ? activeGrow.held : restHeight;
  const stripLabels: GarmentSwapStripLabels = {
    pieceName: labels.pieceName,
    counter: labels.counter,
    pieceValue: labels.pieceValue,
    done: labels.done,
    otherHint: labels.otherHint,
    colorName: labels.colorName,
    moreColors: labels.moreColors,
    own: labels.own,
    ownPiece: labels.ownPiece,
  };
  const takeOffLabel = (slot: OutfitSlot) => (onTakeOff && labels.takeOff && labels.takeOffAccessibilityLabel
    && takeOffSlots?.includes(slot) ? labels.takeOffAccessibilityLabel(slot) : null);
  const takeOffFor = (slot: OutfitSlot) => {
    const spoken = takeOffLabel(slot);
    return spoken && labels.takeOff && onTakeOff
      ? { label: labels.takeOff, accessibilityLabel: spoken, onPress: () => onTakeOff(slot) } : null;
  };

  return (
    <Animated.View style={[styles.block, { width }, blockStyle]} testID={`${boardTestID}-block`}>
      <GestureDetector gesture={gesture}>
        <View
          collapsable={false}
          style={[styles.stage, { height: stageHeight, width }]}
          testID={`${boardTestID}-plate`}>
          {composed ? (
            <SwapStageTint
              arrived={arrived}
              bandHeight={entrance.fromWidth === null ? null
                : measureGarmentBoardHeight(pieces, entrance.fromWidth, 'today', cut, true, large)}
              boardHeight={composed.height}
              fromStageColor={entrance.fromStageColor}
              radius={entrance.fromWidth === null ? theme.radii.stage : null}
              tint={tint}
              toColor={colors.background}
            />
          ) : null}
          {sortedInstances.map((instance) => (
            <SwapPieceView
              // A leaving piece stays in the window it slid in; the rest of the slot, the current one's.
              clip={instance.role === 'leaving' && instance.window ? instance.window
                : pager && instance.slot === focusedSlot ? pager.window : null}
              ink={colors.textPrimary}
              instance={instance}
              key={drawingKey(instance)}
              onBigDone={dropBig}
              outline={outline}
              settleTravel={settleTravel}
              shadow={shadow}
              stageLimit={stageLimit}
              stageWidth={width}
              testID={`${boardTestID}-drawing-${instance.slot}-${instance.garmentTypeId}`}
            />
          ))}
          {/* The captions and badges are drawn for the eye; each piece's adjustable element
              speaks its slot, its name and its Closet state. */}
          <Animated.View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, overlayStyle]}
            testID={overlayTestID}>
            <View style={[StyleSheet.absoluteFill, !overlayShown && styles.away]}>{overlay}</View>
          </Animated.View>
          {/* One element per piece in the outfit's slot order, the order the rows below read in. */}
          {pieces.map(({ slot }) => {
            const garmentTypeId = model.garments[slot];
            if (!garmentTypeId || !composed?.bySlot.has(slot)) return null;
            return (
              <SwapPieceTarget
                composedBox={composed.bySlot.get(slot)!.box}
                focusedSlot={focusedSlot}
                garmentTypeId={garmentTypeId}
                grownBox={pager?.grown ?? null}
                key={`piece-${slot}`}
                labels={labels}
                onEscape={settleToPiece}
                onFocusChange={onFocusChange}
                onStep={stepSlot}
                onTakeOff={onTakeOff}
                order={candidates[slot] ?? []}
                slot={slot}
                takeOffLabel={takeOffLabel(slot)}
                targets={pieceTargets}
                testID={`${boardTestID}-piece-${slot}`}
              />
            );
          })}
        </View>
      </GestureDetector>
      {hintMounted && hint ? (
        <Animated.View
          accessibilityElementsHidden={!hintVisible || focusedSlot !== null}
          importantForAccessibility={!hintVisible || focusedSlot !== null ? 'no-hide-descendants' : 'auto'}
          onLayout={({ nativeEvent }) => measureHint(nativeEvent.layout.height)}
          // A line with a control (a composed result's "Show another") takes touches while it shows.
          pointerEvents={hintVisible && focusedSlot === null ? 'box-none' : 'none'}
          style={[styles.hint, { top: restHeight, width }, hintStyle]}>
          {hint}
        </Animated.View>
      ) : null}
      {panels.leaving ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.panel, { left: inset, top: panels.leaving.held + spacing.md }, leavingPanelStyle]}>
          <GarmentSwapStrip
            candidates={stripCandidates(panels.leaving.slot)}
            columnWidth={columnWidth}
            current={model.garments[panels.leaving.slot] ?? stripCandidates(panels.leaving.slot)[0]?.garmentTypeId}
            interactive={false}
            labels={stripLabels}
            marker={null}
            onChoose={chooseTile}
            onDone={settleToPiece}
            own={ownFor(panels.leaving.slot, leavingOwnRoles)}
            paint={paintFor(panels.leaving.slot)}
            previewId={null}
            roles={leavingRoles}
            takeOff={takeOffFor(panels.leaving.slot)}
            testID={`${boardTestID}-strip-leaving`}
          />
        </Animated.View>
      ) : null}
      {panels.current && model.garments[panels.current.slot] ? (
        <Animated.View
          pointerEvents={stripLive ? 'box-none' : 'none'}
          style={[styles.panel, { left: inset, top: heldStage + spacing.md }, panelStyle]}>
          <GarmentSwapStrip
            candidates={stripCandidates(panels.current.slot)}
            columnWidth={columnWidth}
            current={model.garments[panels.current.slot]!}
            interactive={stripLive}
            labels={stripLabels}
            marker={focusedSlot === panels.current.slot ? { x: markerX, y: markerY } : null}
            onChoose={chooseTile}
            onDone={settleToPiece}
            onHeaderLayout={measureHeader}
            onOwnLabelLayout={measureOwnLabel}
            own={ownFor(panels.current.slot, panelOwnRoles)}
            paint={paintFor(panels.current.slot)}
            previewId={focusedSlot === panels.current.slot ? previewId : null}
            roles={panelRoles}
            takeOff={takeOffFor(panels.current.slot)}
            testID={`${boardTestID}-strip`}
          />
        </Animated.View>
      ) : null}
      {/* The chevrons page the enlarged piece as a swipe does, beside it and never on any piece,
          and only toward a piece there is: the order never wraps. They come and go with the strip. */}
      {focusedSlot && pager && activeGrow && composed && stripLive ? (
        <Animated.View pointerEvents="box-none" style={[StyleSheet.absoluteFill, panelStyle]}>
          {([-1, 1] as const).map((direction) => {
            const garmentTypeId = model.garments[focusedSlot];
            const neighbour = garmentTypeId ? neighbourIn(candidates, focusedSlot, garmentTypeId, direction) : null;
            if (!neighbour) return null;
            const side = direction === 1 ? 'next' : 'previous';
            const name = labels.pieceName(neighbour.garmentTypeId);
            return (
              <SwapChevron
                grown={pager.grown}
                held={activeGrow.held}
                key={side}
                steppedBack={composed.order.filter((slot) => slot !== focusedSlot)
                  .map((slot) => swapScaledBox(composed.bySlot.get(slot)!.box, SWAP_STEP_BACK))}
                label={direction === 1 ? labels.nextPiece(name) : labels.previousPiece(name)}
                onPress={() => stepSlot(focusedSlot, direction, true)}
                side={side}
                stageWidth={width}
                testID={`${boardTestID}-chevron-${side}`}
              />
            );
          })}
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

/** One glass chevron beside the enlarged piece, as large as the text size makes the glass buttons. */
function SwapChevron({ grown, held, label, onPress, side, stageWidth, steppedBack, testID }: Readonly<{
  grown: Box;
  held: number;
  steppedBack: readonly Box[];
  label: string;
  onPress: () => void;
  side: 'previous' | 'next';
  stageWidth: number;
  testID: string;
}>) {
  const { fontScale } = useTextScaling();
  const spot = swapChevrons(grown, steppedBack, stageWidth, held, glassButtonSize(fontScale))[side];
  return (
    <View style={[styles.chevron, { left: spot.x, top: spot.y }]}>
      <GlassButton direction={side} kind="chevron" label={label} onPress={onPress} testID={testID} />
    </View>
  );
}

const styles = StyleSheet.create({
  away: {
    opacity: 0,
  },
  block: {
    position: 'relative',
  },
  chevron: {
    position: 'absolute',
  },
  hint: {
    left: 0,
    position: 'absolute',
  },
  panel: {
    position: 'absolute',
  },
  stage: {
    position: 'relative',
  },
});
