import { useMemo, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';

import type { GarmentTypeId } from '@/features/catalog/domain/garment-taxonomy';
import type { OutfitSlot } from '@/features/recommendation/domain/outfit-composition';
import { useStableValue } from '@/hooks/use-stable-value';
import { easierToSee as easierToSeeValues, useEasierToSee } from '@/theme/easier-to-see';
import { spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

import { fadeEasing } from '@/components/ui/fade';
import {
  measureGarmentBoardHeight,
  pieceShadowOf,
  useGarmentCandidateRoles,
  type GarmentBoardPiece,
} from './garment-board';
import { useGarmentCut } from './garment-cut';
import { flatLayStack } from './compose-flat-lay';
import type { GarmentOutfitPalette } from './garment-palette';
import { GARMENT_OUTLINE } from './garment-painting';
import { GarmentSwapStrip, type GarmentSwapStripLabels } from './garment-swap-strip';
import { SwapPieceTarget } from './swap-piece-target';
import { SwapPieceView } from './swap-piece-view';
import { SwapStageTint } from './swap-stage-tint';
import { drawingKey, type Box, type GarmentSwapCandidate, type Role } from './swap-reconcile';
import { useSwapBlock } from './use-swap-block';
import { pagedInstances, useSwapGesture } from './use-swap-gesture';
import { useSwipeHint } from './use-swap-hint';
import { useSwapMotion } from './use-swap-motion';
import { useSwapPager } from './use-swap-pager';

export type { GarmentSwapCandidate } from './swap-reconcile';

export type GarmentSwapBoardLabels = GarmentSwapStripLabels & Readonly<{
  slotName: (slot: OutfitSlot) => string;
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
  testID?: string;
}>;

/**
 * Phase 7b's directly editable detail board: tap a piece and it
 * grows in place while the others step back; swipe it, or tap a tile in the strip under the
 * stage, to change it while it is large. Every committed set is laid out again by ADR 0025's
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
  labels,
  entrance,
  settle,
  onReveal,
  visibleHeight = 0,
  swipeHint = false,
  onSwipeHintShown,
  takeOffSlots,
  onTakeOff,
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

  const {
    compose, composed, fit, activeGrow, pager,
    panels, setPanels, previewId, setPreviewId,
    stripCandidates, stripOf, panelHeightOf, measureHeader,
  } = useSwapPager({ pieces, candidates, width, large, focusedSlot, visibleHeight, outline: drawnOutline });
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

  // Captions and badges leave at once when a piece starts to move: the commit that hands the
  // board new pieces or a focus hides them, so none is drawn over a moving piece and none is
  // renamed before its piece changes. They return on `normal` once every piece rests, and stay
  // laid out while away, so the plate keeps their measured height.
  const overlayShown = settled && focusedSlot === null && !model.relayouting;
  const overlayStyle = useAnimatedStyle(() => ({
    opacity: overlayShown ? withTiming(1, { duration: normal, easing: fadeEase }) : 0,
  }), [fadeEase, normal, overlayShown]);

  // The pieces lie in the dressing order, so where two overlap the later lies over the earlier;
  // the enlarged slot is drawn over them all, so an overlapped piece comes fully into view.
  // Leaving the band they lie as Today's flat lay stacks them until they rest.
  const drawOrder: Role[] = ['current', 'leaving', 'previous', 'next'];
  const dressing = arrived || entrance.fromWidth === null ? composed?.stack ?? [] : flatLayStack;
  const sortedInstances = [...instances].sort((a, b) =>
    Number(a.slot === focusedSlot) - Number(b.slot === focusedSlot)
    || dressing.indexOf(a.slot) - dressing.indexOf(b.slot)
    || drawOrder.indexOf(a.role) - drawOrder.indexOf(b.role));
  const stageHeight = focusedSlot && activeGrow ? activeGrow.held : restHeight;
  const stripLabels: GarmentSwapStripLabels = {
    pieceName: labels.pieceName,
    counter: labels.counter,
    pieceValue: labels.pieceValue,
    done: labels.done,
    otherHint: labels.otherHint,
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
          style={[styles.panel, { top: panels.leaving.held + spacing.md }, leavingPanelStyle]}>
          <GarmentSwapStrip
            candidates={stripCandidates(panels.leaving.slot)}
            columnWidth={width}
            current={model.garments[panels.leaving.slot] ?? stripCandidates(panels.leaving.slot)[0]?.garmentTypeId}
            interactive={false}
            labels={stripLabels}
            marker={null}
            onChoose={chooseTile}
            onDone={settleToPiece}
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
          style={[styles.panel, { top: heldStage + spacing.md }, panelStyle]}>
          <GarmentSwapStrip
            candidates={stripCandidates(panels.current.slot)}
            columnWidth={width}
            current={model.garments[panels.current.slot]!}
            interactive={stripLive}
            labels={stripLabels}
            marker={focusedSlot === panels.current.slot ? { x: markerX, y: markerY } : null}
            onChoose={chooseTile}
            onDone={settleToPiece}
            onHeaderLayout={measureHeader}
            previewId={focusedSlot === panels.current.slot ? previewId : null}
            roles={panelRoles}
            takeOff={takeOffFor(panels.current.slot)}
            testID={`${boardTestID}-strip`}
          />
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  away: {
    opacity: 0,
  },
  block: {
    position: 'relative',
  },
  hint: {
    left: 0,
    position: 'absolute',
  },
  panel: {
    left: 0,
    position: 'absolute',
  },
  stage: {
    position: 'relative',
  },
});
