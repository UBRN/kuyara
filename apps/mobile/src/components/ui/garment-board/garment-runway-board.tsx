import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

import {
  composePieces,
  PieceArtwork,
  type ComposedPiece,
  type DrawnBox,
  type GarmentBoardPiece,
} from './garment-board';
import { resolveGarmentRenderFills } from './garment-render-fills';

// A landing mark is the piece's own outline, unfilled and faint, so the board shows where
// each piece will stand before it arrives. The drawn piece covers its mark once it lands.
const LANDING_MARK_OPACITY = 0.18;

// A piece glides in from up and to the left of its box, one rhythm step across and one
// large step down, the way the runway render draws it.
const GLIDE_X = -spacing.md;
const GLIDE_Y = -spacing.xl;

type RunwayPieceProps = Readonly<{
  piece: ComposedPiece;
  box: DrawnBox;
  width: number;
  placed: boolean;
  fill: string;
  stroke: string;
}>;

// Each piece is a plain view carrying a native transform, because Reanimated cannot drive
// react-native-svg's props on the new architecture. Arriving and moving are spatial, so
// both ride the spatial spring; the piece's fade is effects motion on `motion.fast`.
function RunwayPiece({ piece, box, width, placed, fill, stroke }: RunwayPieceProps) {
  const theme = useKuyaraTheme();
  const arrival = useSharedValue(placed ? 1 : 0);
  const opacity = useSharedValue(placed ? 1 : 0);
  const move = useSharedValue(1);
  const fromX = useSharedValue(0);
  const fromY = useSharedValue(0);
  const fromScaleX = useSharedValue(1);
  const fromScaleY = useSharedValue(1);
  const { x, y, w, h } = box;
  const previous = useRef({ x, y, w, h });

  useEffect(() => {
    arrival.set(placed ? withSpring(1, theme.springs.spatial) : 0);
    opacity.set(placed ? withTiming(1, { duration: theme.motion.fast }) : 0);
  }, [arrival, opacity, placed, theme.motion.fast, theme.springs.spatial]);

  // A different outfit keeps the slot and moves its piece from the old box to the new one.
  useEffect(() => {
    const from = previous.current;
    previous.current = { x, y, w, h };
    if ((from.x === x && from.y === y && from.w === w && from.h === h) || width <= 0) return;
    fromX.set((from.x + from.w / 2 - x - w / 2) * width);
    fromY.set((from.y + from.h / 2 - y - h / 2) * width);
    fromScaleX.set(from.w / w);
    fromScaleY.set(from.h / h);
    move.set(0);
    move.set(withSpring(1, theme.springs.spatial));
  }, [fromScaleX, fromScaleY, fromX, fromY, h, move, theme.springs.spatial, w, width, x, y]);

  useEffect(() => () => {
    cancelAnimation(arrival);
    cancelAnimation(opacity);
    cancelAnimation(move);
  }, [arrival, move, opacity]);

  const style = useAnimatedStyle(() => {
    const away = 1 - arrival.get();
    const remaining = 1 - move.get();
    return {
      opacity: opacity.get(),
      transform: [
        { translateX: fromX.get() * remaining + GLIDE_X * away },
        { translateY: fromY.get() * remaining + GLIDE_Y * away },
        { scaleX: 1 + (fromScaleX.get() - 1) * remaining },
        { scaleY: 1 + (fromScaleY.get() - 1) * remaining },
      ],
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.piece,
        { height: h * width, left: x * width, top: y * width, width: w * width },
        style,
      ]}
      testID={`runway-piece-${piece.slot}`}>
      <PieceArtwork fillColor={fill} height={h * width} piece={piece} strokeColor={stroke} width={w * width} />
    </Animated.View>
  );
}

type GarmentRunwayBoardProps = Readonly<{
  pieces: readonly GarmentBoardPiece[];
  /** How many pieces, in the board's drawing order, stand on it. The rest show their marks. */
  placedCount: number;
  width: number;
  /** The plane the board stands on; every fill is derived from it. */
  stageColor: string;
  /** Seeds the one coloured piece, so the runway and Today colour the same outfit alike. */
  optionId?: string;
  testID?: string;
}>;

/**
 * The first-generation runway's board: every piece's landing mark from the start, and the
 * first `placedCount` pieces gliding onto their marks. Handed another outfit, the pieces
 * that keep their slot move to their new boxes. Decorative: the runway's progress and line
 * carry the state.
 */
export function GarmentRunwayBoard({
  pieces,
  placedCount,
  width,
  stageColor,
  optionId = '',
  testID,
}: GarmentRunwayBoardProps) {
  const { colors, colorScheme } = useKuyaraTheme();
  const result = composePieces(pieces, 'today');
  const fills = resolveGarmentRenderFills({
    optionId,
    pieces: result.order.map(({ slot }) => ({ slot, colorFamily: null })),
    plane: stageColor,
    colors,
    colorScheme,
    step: 'today',
  });

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={{ height: width * result.stageHeight, width }}
      testID={testID}>
      {width > 0 ? result.order.map((piece) => {
        const box = result.boxes.get(piece)!;
        return (
          <View
            key={`mark-${piece.slot}`}
            style={[
              styles.piece,
              styles.mark,
              { height: box.h * width, left: box.x * width, top: box.y * width, width: box.w * width },
            ]}
            testID={`runway-mark-${piece.slot}`}>
            <PieceArtwork fillColor="none" height={box.h * width} piece={piece} strokeColor={colors.textPrimary} width={box.w * width} />
          </View>
        );
      }) : null}
      {width > 0 ? result.order.map((piece, index) => (
        <RunwayPiece
          box={result.boxes.get(piece)!}
          fill={fills.get(piece.slot)!}
          key={piece.slot}
          piece={piece}
          placed={index < placedCount}
          stroke={colors.textPrimary}
          width={width}
        />
      )) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  piece: { position: 'absolute' },
  mark: { opacity: LANDING_MARK_OPACITY },
});
