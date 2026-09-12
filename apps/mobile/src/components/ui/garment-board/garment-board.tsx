import { useCallback, useEffect, useRef } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  cancelAnimation,
  interpolateColor,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { G, Path } from 'react-native-svg';

import type { GarmentTypeId, StructuralCategory } from '@/features/catalog/domain/garment-taxonomy';
import type { OutfitSlot } from '@/features/recommendation/domain/outfit-composition';
import { spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

import { composeGarmentBoard, detailPreset, todayPreset } from './compose-garment-board';
import { resolveGarmentSilhouette } from './garment-silhouette-map';

export { composeGarmentBoard } from './compose-garment-board';

export type GarmentBoardPiece = Readonly<{
  slot: OutfitSlot;
  garmentTypeId: GarmentTypeId;
  category: StructuralCategory;
}>;

type Preset = 'today' | 'detail';

// Law 7's moment: the settle is one arrival, not a pulse, so the pieces travel the
// smallest rhythm step and spring back with the overshoot the arrival role carries.
// The distance lives here so no feature file authors a motion value.
const SETTLE_TRAVEL = spacing.xs;

// Law 7's arrival: a hero board's pieces enter from one large rhythm step below their
// resting position. The stage plate, its tint and the weather values belong to the
// screen and do not move, so only the drawn pieces carry the arrival (ADR 0021).
const RISE_TRAVEL = spacing.xl;

type GarmentBoardEntrance = Readonly<{
  fromPreset: Preset;
  fromStageColor: string;
  fromStageRadius: number;
  onSettled?: () => void;
}>;

export type GarmentBoardLayoutBox = Readonly<{
  slot: OutfitSlot;
  garmentTypeId: GarmentTypeId;
  x: number;
  y: number;
  width: number;
  height: number;
}>;

export type GarmentBoardLayout = Readonly<{
  height: number;
  boxes: readonly GarmentBoardLayoutBox[];
}>;

type GarmentBoardProps = Readonly<{
  pieces: readonly GarmentBoardPiece[];
  width: number;
  preset: Preset;
  accessibilityLabel: string;
  decorative?: boolean;
  entrance?: GarmentBoardEntrance;
  /**
   * Law 7's arrival: the pieces rise into a still stage once, on mount. A refresh, a
   * focus change or new data never replays it, and under Reduce Motion they are drawn
   * at rest. Ignored while `entrance` is set: a travelling board already arrives.
   */
  rise?: boolean;
  /** Law 7's moment: change it and an entering board's pieces settle once. */
  settle?: number;
  stageColor?: string;
  testID?: string;
}>;

function composePieces(pieces: readonly GarmentBoardPiece[], preset: Preset) {
  return composeGarmentBoard(pieces.map((piece) => ({
    ...piece, ...resolveGarmentSilhouette(piece.garmentTypeId, piece.category),
  })), preset === 'today' ? todayPreset : detailPreset);
}

export function layoutGarmentBoard(
  pieces: readonly GarmentBoardPiece[],
  width: number,
  preset: Preset,
): GarmentBoardLayout {
  const result = composePieces(pieces, preset);

  return {
    height: width * result.stageHeight,
    boxes: result.order.map((piece) => {
      const box = result.boxes.get(piece)!;
      return {
        slot: piece.slot,
        garmentTypeId: piece.garmentTypeId,
        x: box.x * width,
        y: box.y * width,
        width: box.w * width,
        height: box.h * width,
      };
    }),
  };
}

type ComposedPiece = ReturnType<typeof composePieces>['order'][number];
type DrawnBox = ReturnType<typeof composePieces>['boxes'] extends Map<ComposedPiece, infer Box>
  ? Box
  : never;

function PieceArtwork({
  piece,
  fillColor,
  strokeColor,
  width,
  height,
}: Readonly<{
  piece: ComposedPiece;
  fillColor: string;
  strokeColor: string;
  width: number;
  height: number;
}>) {
  const { bounds } = piece;

  return (
    <Svg
      height={height}
      preserveAspectRatio="none"
      viewBox={`${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`}
      width={width}>
      {piece.paths.map((path) => (
        <Path
          d={path.d}
          fill={path.filled ? fillColor : 'none'}
          key={path.d}
          stroke={strokeColor}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.9}
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </Svg>
  );
}

// Each travelling piece is a plain view carrying a native transform, because Reanimated
// cannot drive react-native-svg's `transform` or `fill` on the new architecture: the
// strings reach the native view unprocessed. The fill fades by stacking the resting
// artwork under a tinted copy whose opacity drains; both strokes share one colour, so
// the overlap never changes the outline.
function TravellingPiece({
  piece,
  fromBox,
  toBox,
  width,
  progress,
  settleTravel,
  tintProgress,
  fromStageColor,
  toStageColor,
  strokeColor,
}: Readonly<{
  piece: ComposedPiece;
  fromBox: DrawnBox;
  toBox: DrawnBox;
  width: number;
  progress: SharedValue<number>;
  settleTravel: SharedValue<number>;
  tintProgress: SharedValue<number>;
  fromStageColor: string;
  toStageColor: string;
  strokeColor: string;
}>) {
  const boxWidth = toBox.w * width;
  const boxHeight = toBox.h * width;
  const travelX = (fromBox.x + fromBox.w / 2 - toBox.x - toBox.w / 2) * width;
  const travelY = (fromBox.y + fromBox.h / 2 - toBox.y - toBox.h / 2) * width;
  const fromScaleX = fromBox.w / toBox.w;
  const fromScaleY = fromBox.h / toBox.h;
  const travelStyle = useAnimatedStyle(() => {
    const remaining = 1 - progress.get();

    return {
      transform: [
        { translateX: travelX * remaining },
        { translateY: travelY * remaining + SETTLE_TRAVEL * settleTravel.get() },
        { scaleX: 1 + (fromScaleX - 1) * remaining },
        { scaleY: 1 + (fromScaleY - 1) * remaining },
      ],
    };
  });
  const tintStyle = useAnimatedStyle(() => ({ opacity: 1 - tintProgress.get() }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.piece,
        { height: boxHeight, left: toBox.x * width, top: toBox.y * width, width: boxWidth },
        travelStyle,
      ]}>
      <PieceArtwork
        fillColor={toStageColor}
        height={boxHeight}
        piece={piece}
        strokeColor={strokeColor}
        width={boxWidth}
      />
      <Animated.View style={[StyleSheet.absoluteFill, tintStyle]}>
        <PieceArtwork
          fillColor={fromStageColor}
          height={boxHeight}
          piece={piece}
          strokeColor={strokeColor}
          width={boxWidth}
        />
      </Animated.View>
    </Animated.View>
  );
}

export function measureGarmentBoardHeight(pieces: readonly GarmentBoardPiece[], width: number, preset: Preset) {
  return width * composePieces(pieces, preset).stageHeight;
}

export function GarmentBoard({
  pieces,
  width,
  preset,
  accessibilityLabel,
  decorative = false,
  entrance,
  rise = false,
  settle,
  stageColor,
  testID,
}: GarmentBoardProps) {
  const theme = useKuyaraTheme();
  const { colors } = theme;
  const result = composePieces(pieces, preset);
  const fillColor = stageColor ?? colors.stage;
  const progress = useSharedValue(0);
  const tintProgress = useSharedValue(0);
  const settleTravel = useSharedValue(0);
  const riseOffset = useSharedValue(rise ? RISE_TRAVEL : 0);
  const riseOpacity = useSharedValue(rise ? 0 : 1);
  const lastSettle = useRef(settle);
  const didStartEntrance = useRef(false);
  const didStartRise = useRef(false);
  const didReportSettled = useRef(false);
  const onSettled = entrance?.onSettled;

  const reportSettled = useCallback(() => {
    if (didReportSettled.current) return;
    didReportSettled.current = true;
    onSettled?.();
  }, [onSettled]);

  useEffect(() => {
    if (!entrance) return;

    if (theme.isReduceMotionEnabled) {
      cancelAnimation(progress);
      cancelAnimation(tintProgress);
      reportSettled();
      return;
    }

    if (width <= 0 || didStartEntrance.current) return;
    didStartEntrance.current = true;
    tintProgress.set(withTiming(1, { duration: theme.motion.normal }));
    // A cancelled spring still leaves the pieces where they are; the captions must not
    // wait on a completion that will never come.
    progress.set(withSpring(1, theme.springs.arrival, () => {
      runOnJS(reportSettled)();
    }));
  }, [
    entrance,
    progress,
    reportSettled,
    theme.isReduceMotionEnabled,
    theme.motion.normal,
    theme.springs.arrival,
    tintProgress,
    width,
  ]);

  // Mount only, like `Entrance`: the travel is spatial and rides the arrival role, the
  // fade is effects motion on `motion.fast`.
  useEffect(() => {
    if (!rise || didStartRise.current || theme.isReduceMotionEnabled) return;
    didStartRise.current = true;
    riseOpacity.set(withTiming(1, { duration: theme.motion.fast }));
    riseOffset.set(withSpring(0, theme.springs.arrival));
  }, [
    rise,
    riseOffset,
    riseOpacity,
    theme.isReduceMotionEnabled,
    theme.motion.fast,
    theme.springs.arrival,
  ]);

  // Law 7's moment: one settle per completing action. The board mounts at its resting
  // value, so a board that opens already complete stays still, and Reduce Motion
  // renders nothing at all.
  useEffect(() => {
    if (settle === lastSettle.current) return;
    lastSettle.current = settle;
    if (theme.isReduceMotionEnabled) return;
    // One landing rather than a pulse: the down leg is travelled on the effects
    // duration instead of teleported, and the return carries the arrival overshoot.
    settleTravel.set(withSequence(
      withTiming(1, { duration: theme.motion.fast }),
      withSpring(0, theme.springs.arrival),
    ));
  }, [
    settle,
    settleTravel,
    theme.isReduceMotionEnabled,
    theme.motion.fast,
    theme.springs.arrival,
  ]);

  useEffect(() => () => {
    cancelAnimation(progress);
    cancelAnimation(tintProgress);
    cancelAnimation(settleTravel);
    cancelAnimation(riseOffset);
    cancelAnimation(riseOpacity);
  }, [progress, riseOffset, riseOpacity, settleTravel, tintProgress]);

  const riseStyle = useAnimatedStyle(() => ({
    opacity: riseOpacity.get(),
    transform: [{ translateY: riseOffset.get() }],
  }));

  const entranceBackgroundStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      tintProgress.get(),
      [0, 1],
      [entrance?.fromStageColor ?? colors.background, colors.background],
    ),
  }));

  const height = width * result.stageHeight;
  const accessibilityProps = {
    accessible: decorative ? undefined : true,
    accessibilityElementsHidden: decorative || undefined,
    accessibilityRole: decorative ? undefined : 'image' as const,
    accessibilityLabel: decorative ? undefined : accessibilityLabel,
    importantForAccessibility: decorative ? 'no-hide-descendants' as const : undefined,
    testID,
  };

  if (!entrance || theme.isReduceMotionEnabled) {
    const board = (
      <Svg {...accessibilityProps} height={height} width={width}>
        {result.order.map((piece) => {
          const box = result.boxes.get(piece)!;
          const kx = box.w / piece.bounds.width;
          const ky = box.h / piece.bounds.height;
          return (
            <G
              key={piece.slot}
              transform={`translate(${(box.x - piece.bounds.x * kx) * width} ${(box.y - piece.bounds.y * ky) * width}) scale(${kx * width} ${ky * width})`}
            >
              {piece.paths.map((path) => (
                <Path
                  key={path.d}
                  d={path.d}
                  fill={path.filled ? fillColor : 'none'}
                  stroke={colors.textPrimary}
                  strokeWidth={1.9}
                  vectorEffect="non-scaling-stroke"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ))}
            </G>
          );
        })}
      </Svg>
    );

    // The wrapper carries no accessibility props, so the rise adds no node a screen
    // reader stops on, and the stage the screen draws stays where it is.
    return rise && !theme.isReduceMotionEnabled
      ? <Animated.View style={riseStyle}>{board}</Animated.View>
      : board;
  }

  const fromResult = composePieces(pieces, entrance.fromPreset);
  const fromBoxes = new Map(fromResult.order.map((piece) => [
    piece.slot,
    fromResult.boxes.get(piece)!,
  ]));

  return (
    <Animated.View
      {...accessibilityProps}
      style={[
        styles.entrance,
        { borderRadius: entrance.fromStageRadius, height, width },
        entranceBackgroundStyle,
      ]}>
      {result.order.map((piece) => (
        <TravellingPiece
          fromBox={fromBoxes.get(piece.slot) ?? result.boxes.get(piece)!}
          fromStageColor={entrance.fromStageColor}
          key={piece.slot}
          piece={piece}
          progress={progress}
          settleTravel={settleTravel}
          strokeColor={colors.textPrimary}
          tintProgress={tintProgress}
          toBox={result.boxes.get(piece)!}
          toStageColor={colors.stage}
          width={width}
        />
      ))}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  entrance: {
    overflow: 'hidden',
  },
  piece: {
    position: 'absolute',
  },
});
