import { useCallback, useEffect, useRef } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  cancelAnimation,
  interpolateColor,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { G, Path } from 'react-native-svg';

import type { GarmentTypeId, StructuralCategory } from '@/features/catalog/domain/garment-taxonomy';
import type { OutfitSlot } from '@/features/recommendation/domain/outfit-composition';
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
        { translateY: travelY * remaining },
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
  stageColor,
  testID,
}: GarmentBoardProps) {
  const theme = useKuyaraTheme();
  const { colors } = theme;
  const result = composePieces(pieces, preset);
  const fillColor = stageColor ?? colors.stage;
  const progress = useSharedValue(0);
  const tintProgress = useSharedValue(0);
  const didStartEntrance = useRef(false);
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
    progress.set(withSpring(1, theme.springs.spatial, () => {
      runOnJS(reportSettled)();
    }));
  }, [
    entrance,
    progress,
    reportSettled,
    theme.isReduceMotionEnabled,
    theme.motion.normal,
    theme.springs.spatial,
    tintProgress,
    width,
  ]);

  useEffect(() => () => {
    cancelAnimation(progress);
    cancelAnimation(tintProgress);
  }, [progress, tintProgress]);

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
    return (
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
