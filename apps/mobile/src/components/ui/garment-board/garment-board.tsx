import { useCallback, useEffect, useRef, useState } from 'react';
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
import Svg, { Ellipse, G } from 'react-native-svg';

import type { GarmentTypeId, StructuralCategory } from '@/features/catalog/domain/garment-taxonomy';
import type { OutfitSlot } from '@/features/recommendation/domain/outfit-composition';
import { spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

import {
  composeGarmentBoard,
  contactShadeOf,
  detailPreset,
  drawnExtent,
  fitTodayStage,
  placeOnRunway,
  todayPreset,
} from './compose-garment-board';
import { garmentLevelOfDetail, GarmentPainting } from './garment-painting';
import { garmentRolesBySlot, type GarmentOutfitPalette, type GarmentRoles } from './garment-palette';
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
  /** The pieces start where Today's fitted primary stage draws them (P2). */
  fromFit?: boolean;
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
  /**
   * The outfit's palette inputs (O15). Every board, the alternates included, takes its
   * colours from them, so the same outfit is the same colours wherever it is drawn.
   */
  palette: GarmentOutfitPalette;
  /** The plane the board stands on. Left out, it stands on the page ground. */
  stageColor?: string;
  /**
   * Today's primary stage only (P2): the composition is fitted to the stage the way the
   * runway fits it, and the stage is as tall as the fitted pieces. Ignored with `entrance`.
   */
  fit?: boolean;
  /** Today's primary stage only (P2): one flat contact shade under each piece, this colour. */
  contactShade?: string;
  testID?: string;
}>;

export function composePieces(pieces: readonly GarmentBoardPiece[], preset: Preset) {
  return composeGarmentBoard(pieces.map((piece) => ({
    ...piece, ...resolveGarmentSilhouette(piece.garmentTypeId, piece.category),
  })), preset === 'today' ? todayPreset : detailPreset);
}

/** Every piece's drawn box in points, and the stage height, with or without Today's fit. */
function placePieces(pieces: readonly GarmentBoardPiece[], width: number, preset: Preset, fit: boolean) {
  const result = composePieces(pieces, preset);
  if (!fit) {
    const placed = new Map(result.order.map((piece) => {
      const box = result.boxes.get(piece)!;
      return [piece, { x: box.x * width, y: box.y * width, w: box.w * width, h: box.h * width }];
    }));
    return { result, placed, height: width * result.stageHeight };
  }
  const extent = drawnExtent(result.boxes.values());
  const { scale, height } = fitTodayStage(extent, width);
  const placed = new Map(result.order.map((piece) => [
    piece, placeOnRunway(result.boxes.get(piece)!, extent, scale, width, height),
  ]));
  return { result, placed, height };
}

export function layoutGarmentBoard(
  pieces: readonly GarmentBoardPiece[],
  width: number,
  preset: Preset,
): GarmentBoardLayout {
  const { result, placed, height } = placePieces(pieces, width, preset, false);

  return {
    height,
    boxes: result.order.map((piece) => {
      const box = placed.get(piece)!;
      return { slot: piece.slot, garmentTypeId: piece.garmentTypeId, x: box.x, y: box.y, width: box.w, height: box.h };
    }),
  };
}

export type ComposedPiece = ReturnType<typeof composePieces>['order'][number];
export type DrawnBox = ReturnType<typeof composePieces>['boxes'] extends Map<ComposedPiece, infer Box>
  ? Box
  : never;

const NO_ROLES: ReadonlyMap<OutfitSlot, GarmentRoles> = new Map();

/**
 * The colour roles of every piece of one outfit on the plane it stands on, by slot. The
 * board, the Today badges and the runway read the same memoised result for the same outfit.
 */
export function useGarmentRoles(
  palette: GarmentOutfitPalette | null,
  stageColor?: string,
): ReadonlyMap<OutfitSlot, GarmentRoles> {
  const { colors, colorScheme } = useKuyaraTheme();
  if (palette === null) return NO_ROLES;
  return garmentRolesBySlot({
    ...palette,
    appearance: colorScheme,
    stageColor: stageColor ?? colors.background,
    accessoryStageColor: colors.background,
    inkColor: colors.textPrimary,
  });
}

/** One composed piece in its own box, the viewBox fitted to its drawn bounds. */
export function PieceArtwork({
  piece,
  roles,
  ink,
  width,
  height,
  layer,
}: Readonly<{
  piece: ComposedPiece;
  roles: GarmentRoles;
  ink: string;
  width: number;
  height: number;
  layer?: 'all' | 'fill' | 'outline';
}>) {
  const { bounds } = piece;

  return (
    <Svg
      height={height}
      preserveAspectRatio="none"
      viewBox={`${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`}
      width={width}>
      <GarmentPainting
        ink={ink}
        layer={layer}
        lod={garmentLevelOfDetail(Math.max(width, height))}
        roles={roles}
        scale={width / bounds.width}
        silhouette={piece}
      />
    </Svg>
  );
}

// Each travelling piece is a plain view carrying a native transform, because Reanimated
// cannot drive react-native-svg's `transform` or `fill` on the new architecture: the
// strings reach the native view unprocessed. The piece keeps its colours across the move.
function TravellingPiece({
  piece,
  fromBox,
  toBox,
  width,
  progress,
  settleTravel,
  roles,
  ink,
}: Readonly<{
  piece: ComposedPiece;
  fromBox: DrawnBox;
  toBox: DrawnBox;
  width: number;
  progress: SharedValue<number>;
  settleTravel: SharedValue<number>;
  roles: GarmentRoles;
  ink: string;
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
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.piece,
        { height: boxHeight, left: toBox.x * width, top: toBox.y * width, width: boxWidth },
        travelStyle,
      ]}>
      <PieceArtwork height={boxHeight} ink={ink} piece={piece} roles={roles} width={boxWidth} />
    </Animated.View>
  );
}

/**
 * Where an entering board's pieces start, by slot, in stage-width units: the from preset's
 * composition, or with `fit` the boxes Today's fitted primary stage draws at this width.
 */
export function entranceStartBoxes(
  pieces: readonly GarmentBoardPiece[],
  width: number,
  preset: Preset,
  fit: boolean,
): ReadonlyMap<OutfitSlot, DrawnBox> {
  // Before the first layout the width is 0 and there is nothing to fit to.
  const fitted = fit && width > 0;
  const unit = fitted ? width : 1;
  const { result, placed } = placePieces(pieces, unit, preset, fitted);
  return new Map(result.order.map((piece) => {
    const box = placed.get(piece)!;
    return [piece.slot, { x: box.x / unit, y: box.y / unit, w: box.w / unit, h: box.h / unit }];
  }));
}

export function measureGarmentBoardHeight(
  pieces: readonly GarmentBoardPiece[],
  width: number,
  preset: Preset,
  fit = false,
) {
  return placePieces(pieces, width, preset, fit).height;
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
  palette,
  stageColor,
  fit = false,
  contactShade,
  testID,
}: GarmentBoardProps) {
  const theme = useKuyaraTheme();
  const { colors } = theme;
  const { result, placed, height } = placePieces(pieces, width, preset, fit && !entrance);
  const roles = useGarmentRoles(palette, stageColor);
  const progress = useSharedValue(0);
  const tintProgress = useSharedValue(0);
  const settleTravel = useSharedValue(0);
  const riseOffset = useSharedValue(rise ? RISE_TRAVEL : 0);
  const riseOpacity = useSharedValue(rise ? 0 : 1);
  const lastSettle = useRef(settle);
  const didStartEntrance = useRef(false);
  const didStartRise = useRef(false);
  const didReportSettled = useRef(false);
  // Once landed, React holds the resting style itself: Reanimated drops a settled view's
  // props natively 2 s after its last frame and only syncs them to React if a JS tick
  // lands 1 to 2 s after it, so a stall across that window left the zero-opacity start
  // for the next re-render to commit, and the pieces vanished from a still stage.
  const [risen, setRisen] = useState(!rise);
  const onSettled = entrance?.onSettled;

  const reportSettled = useCallback(() => {
    if (didReportSettled.current) return;
    didReportSettled.current = true;
    onSettled?.();
  }, [onSettled]);

  useEffect(() => {
    if (!entrance) return;

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
    theme.motion.normal,
    theme.springs.arrival,
    tintProgress,
    width,
  ]);

  // Mount only, like `Entrance`: the travel is spatial and rides the arrival role, the
  // fade is effects motion on `motion.fast`.
  useEffect(() => {
    if (!rise || didStartRise.current) return;
    didStartRise.current = true;
    riseOpacity.set(withTiming(1, { duration: theme.motion.fast }));
    riseOffset.set(withSpring(0, theme.springs.arrival, (finished) => {
      if (finished) runOnJS(setRisen)(true);
    }));
  }, [
    rise,
    riseOffset,
    riseOpacity,
    theme.motion.fast,
    theme.springs.arrival,
  ]);

  // Law 7's moment: one settle per completing action. The board mounts at its resting
  // value, so a board that opens already complete stays still.
  useEffect(() => {
    if (settle === lastSettle.current) return;
    lastSettle.current = settle;
    // One landing rather than a pulse: the down leg is travelled on the effects
    // duration instead of teleported, and the return carries the arrival overshoot.
    settleTravel.set(withSequence(
      withTiming(1, { duration: theme.motion.fast }),
      withSpring(0, theme.springs.arrival),
    ));
  }, [
    settle,
    settleTravel,
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

  const accessibilityProps = {
    accessible: decorative ? undefined : true,
    accessibilityElementsHidden: decorative || undefined,
    accessibilityRole: decorative ? undefined : 'image' as const,
    accessibilityLabel: decorative ? undefined : accessibilityLabel,
    importantForAccessibility: decorative ? 'no-hide-descendants' as const : undefined,
    testID,
  };

  if (!entrance) {
    const board = (
      <Svg {...accessibilityProps} height={height} width={width}>
        {/* Every shade is drawn before any piece, so no shade ever crosses a garment. */}
        {contactShade ? result.order.map((piece) => {
          const shade = contactShadeOf(placed.get(piece)!);
          return <Ellipse fill={contactShade} key={`shade-${piece.slot}`} {...shade} />;
        }) : null}
        {result.order.map((piece) => {
          const box = placed.get(piece)!;
          // The composition keeps each drawing's aspect ratio, so one scale serves both axes.
          const scale = box.w / piece.bounds.width;
          return (
            <G
              key={piece.slot}
              transform={`translate(${box.x - piece.bounds.x * scale} ${box.y - piece.bounds.y * scale}) scale(${scale})`}
            >
              <GarmentPainting
                ink={colors.textPrimary}
                lod={garmentLevelOfDetail(Math.max(box.w, box.h))}
                roles={roles.get(piece.slot)!}
                scale={scale}
                silhouette={piece}
              />
            </G>
          );
        })}
      </Svg>
    );

    // The wrapper carries no accessibility props, so the rise adds no node a screen
    // reader stops on, and the stage the screen draws stays where it is.
    return rise
      ? <Animated.View style={risen ? undefined : riseStyle}>{board}</Animated.View>
      : board;
  }

  const fromBoxes = entranceStartBoxes(pieces, width, entrance.fromPreset, entrance.fromFit === true);

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
          ink={colors.textPrimary}
          key={piece.slot}
          piece={piece}
          progress={progress}
          roles={roles.get(piece.slot)!}
          settleTravel={settleTravel}
          toBox={result.boxes.get(piece)!}
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
