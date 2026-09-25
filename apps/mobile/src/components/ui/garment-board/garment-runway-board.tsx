import { useEffect, useRef } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import type { OutfitSlot } from '@/features/recommendation/domain/outfit-composition';
import type { MotionTokens } from '@/theme/theme';
import { spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

import { resolveGarmentArtwork } from '../garment-slot-glyph';
import { drawnExtent, fitRunwayScale, placeOnRunway } from './compose-garment-board';
import { composePieces, PieceArtwork, type ComposedPiece, type GarmentBoardPiece } from './garment-board';
import { resolveRunwayFills } from './runway-fills';

// A landing mark is the draft's own outline, faint, so the board shows where each piece
// will stand before it arrives.
const LANDING_MARK_OPACITY = 0.2;
// A draft glides onto its mark from the left, like walking onto a runway (O1).
const GLIDE_X = -4 * spacing.xl;
const GLIDE_Y = -spacing.sm;
// A draft the answer does not keep leaves to the right.
const LEAVE_X = 40;
// O1's piece-by-piece dressing: one piece every 110 ms, each pouring on `motion.deliberate`.
const POUR_STEP = 110;

type Box = Readonly<{ x: number; y: number; w: number; h: number }>;

/**
 * How long the dressing takes, from the answer to the last piece's outline settling: the
 * board waits `motion.normal`, pours one piece per step, and the last pour and its
 * outline finish on `deliberate` and `fast`.
 */
export function runwayDressingDuration(pieceCount: number, motion: MotionTokens): number {
  return motion.normal + Math.max(0, pieceCount - 1) * POUR_STEP + motion.deliberate + motion.fast;
}

function dressStart(index: number, motion: MotionTokens): number {
  return motion.normal + index * POUR_STEP;
}

function layoutOf(pieces: readonly GarmentBoardPiece[]) {
  const result = composePieces(pieces, 'today');
  return { result, extent: drawnExtent(result.boxes.values()) };
}

type RunwayDraftProps = Readonly<{
  piece: ComposedPiece;
  box: Box;
  ink: string;
  /** Once the answer is in, the draft either hands over to its garment or leaves. */
  answered: boolean;
  kept: boolean;
  handoverDelay: number;
}>;

// Each piece is a plain view carrying a native transform, because Reanimated cannot drive
// react-native-svg's props on the new architecture. Arriving and moving are spatial and ride
// the spring roles; fades are effects motion on the duration roles.
// A draft mounts when it comes on and glides onto its mark on the arrival spring.
function RunwayDraft({ piece, box, ink, answered, kept, handoverDelay }: RunwayDraftProps) {
  const theme = useKuyaraTheme();
  const arrival = useSharedValue(0);
  const opacity = useSharedValue(0);
  const leave = useSharedValue(0);
  const move = useSharedValue(1);
  const from = useSharedValue({ x: 0, y: 0, sx: 1, sy: 1 });
  const previous = useRef(box);
  const { x, y, w, h } = box;

  useEffect(() => {
    arrival.set(withSpring(1, theme.springs.arrival));
    opacity.set(withTiming(1, { duration: theme.motion.fast }));
  }, [arrival, opacity, theme.motion.fast, theme.springs.arrival]);

  useEffect(() => {
    if (!answered) return;
    if (kept) {
      opacity.set(withDelay(handoverDelay, withTiming(0, { duration: theme.motion.fast })));
    } else {
      leave.set(withSpring(1, theme.springs.spatial));
      opacity.set(withTiming(0, { duration: theme.motion.deliberate }));
    }
  }, [answered, handoverDelay, kept, leave, opacity, theme.motion.deliberate, theme.motion.fast, theme.springs.spatial]);

  // A kept slot moves from its draft box to its garment's box on the spatial spring.
  useEffect(() => {
    const last = previous.current;
    previous.current = { x, y, w, h };
    if (last.x === x && last.y === y && last.w === w && last.h === h) return;
    from.set({
      x: last.x + last.w / 2 - x - w / 2,
      y: last.y + last.h / 2 - y - h / 2,
      sx: last.w / w,
      sy: last.h / h,
    });
    move.set(0);
    move.set(withSpring(1, theme.springs.spatial));
  }, [from, h, move, theme.springs.spatial, w, x, y]);

  useEffect(() => () => {
    cancelAnimation(arrival);
    cancelAnimation(opacity);
    cancelAnimation(leave);
    cancelAnimation(move);
  }, [arrival, leave, move, opacity]);

  const style = useAnimatedStyle(() => {
    const away = 1 - arrival.get();
    const remaining = 1 - move.get();
    const origin = from.get();
    return {
      opacity: opacity.get(),
      transform: [
        { translateX: origin.x * remaining + GLIDE_X * away + LEAVE_X * leave.get() },
        { translateY: origin.y * remaining + GLIDE_Y * away },
        { scaleX: 1 + (origin.sx - 1) * remaining },
        { scaleY: 1 + (origin.sy - 1) * remaining },
      ],
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.piece, { height: h, left: x, top: y, width: w }, style]}
      testID={`runway-draft-${piece.slot}`}>
      <Image
        resizeMode="contain"
        source={resolveGarmentArtwork(piece.category, Math.max(w, h))}
        style={[styles.glyph, { tintColor: ink }]}
      />
    </Animated.View>
  );
}

type RunwayDressedProps = Readonly<{
  piece: ComposedPiece;
  box: Box;
  fill: string;
  ink: string;
  delay: number;
  /** A slot whose draft never landed enters already dressed, gliding in. */
  glides: boolean;
}>;

// The garment's outline arrives on `motion.fast`, then its colour pours up from the hem on
// `motion.deliberate`. The pour is a clip that travels on transforms alone: the clipping
// view moves down by the unpoured share while the artwork inside moves back up by the same
// amount, so only the poured band from the hem up is visible and nothing is laid out again.
function RunwayDressed({ piece, box, fill, ink, delay, glides }: RunwayDressedProps) {
  const theme = useKuyaraTheme();
  const pour = useSharedValue(0);
  const outline = useSharedValue(0);
  const arrival = useSharedValue(glides ? 0 : 1);
  const { x, y, w, h } = box;

  useEffect(() => {
    pour.set(withDelay(delay, withTiming(1, { duration: theme.motion.deliberate })));
    outline.set(withDelay(delay, withTiming(1, { duration: theme.motion.fast })));
    if (glides) arrival.set(withDelay(delay, withSpring(1, theme.springs.arrival)));
    return () => {
      cancelAnimation(pour);
      cancelAnimation(outline);
      cancelAnimation(arrival);
    };
  }, [arrival, delay, glides, outline, pour, theme.motion.deliberate, theme.motion.fast, theme.springs.arrival]);

  const glideStyle = useAnimatedStyle(() => {
    const away = 1 - arrival.get();
    return { transform: [{ translateX: GLIDE_X * away }, { translateY: GLIDE_Y * away }] };
  });
  const clipStyle = useAnimatedStyle(() => ({
    opacity: pour.get() > 0 ? 1 : 0,
    transform: [{ translateY: (1 - pour.get()) * h }],
  }));
  const artworkStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -(1 - pour.get()) * h }] }));
  const outlineStyle = useAnimatedStyle(() => ({ opacity: outline.get() }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.piece, { height: h, left: x, top: y, width: w }, glideStyle]}
      testID={`runway-dressed-${piece.slot}`}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.clip, clipStyle]}>
        <Animated.View style={artworkStyle}>
          <PieceArtwork fillColor={fill} height={h} piece={piece} strokeColor="transparent" width={w} />
        </Animated.View>
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, outlineStyle]}>
        <PieceArtwork fillColor="none" height={h} piece={piece} strokeColor={ink} width={w} />
      </Animated.View>
    </Animated.View>
  );
}

type GarmentRunwayBoardProps = Readonly<{
  /** The neutral drafts, drawn in this composition's order before any answer. */
  drafts: readonly GarmentBoardPiece[];
  /** How many drafts, in drawing order, have started onto the board. */
  placedCount: number;
  /** The chosen outfit, handed over once, when the answer is in. */
  outfit: Readonly<{ id: string; pieces: readonly GarmentBoardPiece[] }> | null;
  /** The runway field the board stands on; every dressed fill is derived from it. */
  field: string;
  /** The free area the board fits into (the runway preset, O17). */
  width: number;
  height: number;
  /** The drafts' plain outline. */
  draftInk: string;
  /** The dressed garments' outline. */
  outlineInk: string;
  testID?: string;
}>;

/**
 * The first-generation runway's board (O1). Before the answer only neutral drafts come on,
 * plain unfilled category outlines gliding onto faint landing marks; never a provisional
 * outfit. At the answer the drafts the outfit keeps move to its boxes and hand over, the
 * others leave, and each chosen piece is dressed in turn. Decorative: the runway's progress
 * and line carry every state.
 */
export function GarmentRunwayBoard({
  drafts,
  placedCount,
  outfit,
  field,
  width,
  height,
  draftInk,
  outlineInk,
  testID,
}: GarmentRunwayBoardProps) {
  const { colors, colorScheme, motion } = useKuyaraTheme();
  const draftLayout = layoutOf(drafts);
  const chosenLayout = outfit ? layoutOf(outfit.pieces) : null;
  // The drafts keep one scale for the whole wait; the chosen outfit takes the same one
  // unless its own extent needs less, so a draft never jumps when the answer arrives.
  const draftScale = fitRunwayScale([draftLayout.extent], width, height);
  const chosenScale = chosenLayout
    ? Math.min(draftScale, fitRunwayScale([chosenLayout.extent], width, height))
    : 0;
  const draftBox = (piece: ComposedPiece) =>
    placeOnRunway(draftLayout.result.boxes.get(piece)!, draftLayout.extent, draftScale, width, height);
  const chosenOrder = chosenLayout?.result.order ?? [];
  const chosenBox = (piece: ComposedPiece) =>
    placeOnRunway(chosenLayout!.result.boxes.get(piece)!, chosenLayout!.extent, chosenScale, width, height);
  const draftIndex = new Map(draftLayout.result.order.map((piece, index) => [piece.slot, index]));
  const fills = outfit
    ? resolveRunwayFills({ optionId: outfit.id, slots: chosenOrder.map(({ slot }) => slot), field, colors, colorScheme })
    : null;
  const startedBeforeAnswer = (slot: OutfitSlot) => (draftIndex.get(slot) ?? Infinity) < placedCount;

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[StyleSheet.absoluteFill]}
      testID={testID}>
      {draftScale > 0 && !outfit ? draftLayout.result.order.map((piece) => {
        const { x, y, w, h } = draftBox(piece);
        return (
          <Image
            key={`mark-${piece.slot}`}
            resizeMode="contain"
            source={resolveGarmentArtwork(piece.category, Math.max(w, h))}
            style={[styles.piece, styles.mark, { height: h, left: x, tintColor: draftInk, top: y, width: w }]}
            testID={`runway-mark-${piece.slot}`}
          />
        );
      }) : null}
      {draftScale > 0 ? draftLayout.result.order.map((piece, index) => {
        // Only the drafts that have come on are drawn; after the answer they hand over or leave.
        if (index >= placedCount) return null;
        const kept = chosenOrder.find(({ slot }) => slot === piece.slot);
        return (
          <RunwayDraft
            answered={outfit !== null}
            box={kept ? chosenBox(kept) : draftBox(piece)}
            handoverDelay={kept ? dressStart(chosenOrder.indexOf(kept), motion) : 0}
            ink={draftInk}
            kept={kept !== undefined}
            key={piece.slot}
            piece={piece}
          />
        );
      }) : null}
      {outfit && chosenScale > 0 ? chosenOrder.map((piece, index) => (
        <RunwayDressed
          box={chosenBox(piece)}
          delay={dressStart(index, motion)}
          fill={fills!.get(piece.slot)!}
          glides={!startedBeforeAnswer(piece.slot)}
          ink={outlineInk}
          key={`dressed-${piece.slot}`}
          piece={piece}
        />
      )) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  piece: { position: 'absolute' },
  glyph: { height: '100%', width: '100%' },
  mark: { opacity: LANDING_MARK_OPACITY },
  clip: { overflow: 'hidden' },
});
