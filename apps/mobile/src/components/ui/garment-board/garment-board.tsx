import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  interpolateColor,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import Svg, { Ellipse, G } from 'react-native-svg';

import type { GarmentTypeId, StructuralCategory } from '@/features/catalog/domain/garment-taxonomy';
import type { OutfitSlot } from '@/features/recommendation/domain/outfit-composition';
import { useStableEntries } from '@/hooks/use-stable-value';
import { easierToSee as easierToSeeValues, useEasierToSee } from '@/theme/easier-to-see';
import { spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

import { PRESENCE_TEXT_AFTER } from '../presence';
import {
  composeGarmentBoard,
  contactShadeOf,
  detailPreset,
  drawnExtent,
  easierToSeeRule,
  fitTodayStage,
  placeOnRunway,
  todayPreset,
} from './compose-garment-board';
import { garmentLevelOfDetail, GarmentPainting } from './garment-painting';
import {
  garmentRolesBySlot,
  paletteWithGarment,
  type GarmentOutfitPalette,
  type GarmentRoles,
} from './garment-palette';
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

/**
 * One rising piece, or its contact shade, on its own native view: Reanimated cannot move a
 * group inside one SVG on the new architecture. The pieces leave in the board's reading
 * order, each one `motion.stagger` after the piece before it (ADR 0020); a piece's shade
 * rises with it. The travel rides the arrival role, the fade is effects motion on
 * `motion.fast`. It starts once, when `held` is false.
 */
function RisingLayer({
  children,
  held,
  index,
  style,
}: Readonly<{ children: ReactNode; held: boolean; index: number; style: StyleProp<ViewStyle> }>) {
  const theme = useKuyaraTheme();
  const offset = useSharedValue<number>(RISE_TRAVEL);
  const opacity = useSharedValue(0);
  const didStart = useRef(false);
  // Once landed, React holds the resting style itself: Reanimated drops a settled view's
  // props natively 2 s after its last frame and only syncs them to React if a JS tick
  // lands 1 to 2 s after it, so a stall across that window left the zero-opacity start
  // for the next re-render to commit, and the pieces vanished from a still stage.
  const [risen, setRisen] = useState(false);

  useEffect(() => {
    if (held || didStart.current) return;
    didStart.current = true;
    const delay = index * theme.motion.stagger;
    opacity.set(withDelay(delay, withTiming(1, { duration: theme.motion.fast })));
    offset.set(withDelay(delay, withSpring(0, theme.springs.arrival, (finished) => {
      if (finished) scheduleOnRN(setRisen, true);
    })));
  }, [held, index, offset, opacity, theme.motion.fast, theme.motion.stagger, theme.springs.arrival]);

  useEffect(() => () => {
    cancelAnimation(offset);
    cancelAnimation(opacity);
  }, [offset, opacity]);

  const riseStyle = useAnimatedStyle(() => ({
    opacity: opacity.get(),
    transform: [{ translateY: offset.get() }],
  }));

  return <Animated.View pointerEvents="none" style={[style, risen ? undefined : riseStyle]}>{children}</Animated.View>;
}

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
   * Law 7's arrival: the pieces rise into a still stage once, on mount, one by one in
   * reading order. A refresh, a focus change or new data never replays it. Ignored while
   * `entrance` is set: a travelling board already arrives.
   */
  rise?: boolean;
  /**
   * Holds a rising board's pieces at their start, unseen, until it turns false, so the
   * rise plays when nothing covers the stage (the first-run runway). It starts once.
   */
  holdRise?: boolean;
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

export function composePieces(pieces: readonly GarmentBoardPiece[], preset: Preset, large = false) {
  const rule = preset === 'today' ? todayPreset : detailPreset;
  return composeGarmentBoard(pieces.map((piece) => ({
    ...piece, ...resolveGarmentSilhouette(piece.garmentTypeId, piece.category),
  })), large
    ? easierToSeeRule(rule, easierToSeeValues.boardScale, easierToSeeValues.boardSideMinimum)
    : rule);
}

/** Every piece's drawn box in points, and the stage height, with or without Today's fit. */
function placePieces(pieces: readonly GarmentBoardPiece[], width: number, preset: Preset, fit: boolean, large = false) {
  const result = composePieces(pieces, preset, large);
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
  /** O13: the "Easier to see" board; pass `useEasierToSee()`. */
  large = false,
): GarmentBoardLayout {
  const { result, placed, height } = placePieces(pieces, width, preset, false, large);

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

/**
 * The colour roles of every piece of one outfit on the plane it stands on, by slot. The
 * board, the Today badges and the runway read the same memoised result for the same outfit.
 * A piece whose colours an outfit change leaves as they were keeps its roles' instance, so
 * its drawing does not paint again.
 */
export function useGarmentRoles(
  palette: GarmentOutfitPalette | null,
  stageColor?: string,
): ReadonlyMap<OutfitSlot, GarmentRoles> {
  const { colors, colorScheme } = useKuyaraTheme();
  return useStableEntries(palette === null ? [] : [...garmentRolesBySlot({
    ...palette,
    appearance: colorScheme,
    stageColor: stageColor ?? colors.background,
    accessoryStageColor: colors.background,
    inkColor: colors.textPrimary,
  })]);
}

/**
 * Phase 7's picker: the colours each candidate would take in one slot of the outfit, so a
 * tile shows the piece as the changed outfit would draw it.
 */
export function useGarmentCandidateRoles(
  palette: GarmentOutfitPalette | null,
  slot: OutfitSlot | null,
  garmentTypeIds: readonly GarmentTypeId[],
): ReadonlyMap<GarmentTypeId, GarmentRoles> {
  const { colors, colorScheme } = useKuyaraTheme();
  // A step leaves the other candidates' colours as they were: their tiles keep their roles.
  return useStableEntries(palette === null || slot === null ? [] : garmentTypeIds.flatMap((garmentTypeId) => {
    const roles = garmentRolesBySlot({
      ...paletteWithGarment(palette, slot, garmentTypeId),
      appearance: colorScheme,
      stageColor: colors.background,
      accessoryStageColor: colors.background,
      inkColor: colors.textPrimary,
    }).get(slot);
    return roles ? [[garmentTypeId, roles] as const] : [];
  }));
}

/** One composed piece in its own box, the viewBox fitted to its drawn bounds. */
export function PieceArtwork({
  piece,
  roles,
  ink,
  width,
  height,
  layer,
  outline,
}: Readonly<{
  piece: ComposedPiece;
  roles: GarmentRoles;
  ink: string;
  width: number;
  height: number;
  layer?: 'all' | 'fill' | 'outline';
  /** The board outline in points; O13's mode draws it heavier. */
  outline?: number;
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
        outline={outline}
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
  outline,
}: Readonly<{
  piece: ComposedPiece;
  fromBox: DrawnBox;
  toBox: DrawnBox;
  width: number;
  progress: SharedValue<number>;
  settleTravel: SharedValue<number>;
  roles: GarmentRoles;
  ink: string;
  outline?: number;
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
      <PieceArtwork height={boxHeight} ink={ink} outline={outline} piece={piece} roles={roles} width={boxWidth} />
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
  large = false,
): ReadonlyMap<OutfitSlot, DrawnBox> {
  // Before the first layout the width is 0 and there is nothing to fit to.
  const fitted = fit && width > 0;
  const unit = fitted ? width : 1;
  const { result, placed } = placePieces(pieces, unit, preset, fitted, large);
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
  /** O13: the "Easier to see" board; pass `useEasierToSee()`. */
  large = false,
) {
  return placePieces(pieces, width, preset, fit, large).height;
}

export function GarmentBoard({
  pieces,
  width,
  preset,
  accessibilityLabel,
  decorative = false,
  entrance,
  rise = false,
  holdRise = false,
  settle,
  palette,
  stageColor,
  fit = false,
  contactShade,
  testID,
}: GarmentBoardProps) {
  const theme = useKuyaraTheme();
  const { colors } = theme;
  const large = useEasierToSee();
  const outline = large ? easierToSeeValues.boardOutline : undefined;
  const roles = useGarmentRoles(palette, stageColor);
  const progress = useSharedValue(0);
  const tintProgress = useSharedValue(0);
  const settleTravel = useSharedValue(0);
  const lastSettle = useRef(settle);
  const didStartEntrance = useRef(false);
  const didReportSettled = useRef(false);
  const onSettled = entrance?.onSettled;

  const reportSettled = useCallback(() => {
    if (didReportSettled.current) return;
    didReportSettled.current = true;
    onSettled?.();
  }, [onSettled]);

  // What waits for the pieces follows once nine tenths of the arrival is travelled, as
  // Presence's text follows its container, instead of waiting out the spring's overshoot.
  useAnimatedReaction(() => progress.get() >= PRESENCE_TEXT_AFTER, (reached, was) => {
    if (reached && !was) scheduleOnRN(reportSettled);
  }, [reportSettled]);

  useEffect(() => {
    if (!entrance) return;

    if (width <= 0 || didStartEntrance.current) return;
    didStartEntrance.current = true;
    tintProgress.set(withTiming(1, { duration: theme.motion.normal }));
    // A cancelled spring still leaves the pieces where they are; the captions must not
    // wait on a completion that will never come.
    progress.set(withSpring(1, theme.springs.arrival, () => {
      scheduleOnRN(reportSettled);
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
  }, [progress, settleTravel, tintProgress]);

  const entranceBackgroundStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      tintProgress.get(),
      [0, 1],
      [entrance?.fromStageColor ?? colors.background, colors.background],
    ),
  }));

  // Composed after the last hook: React Compiler cannot keep a value in a memo block across a
  // hook call, so a composition read above the hooks was redone, and every piece redrawn, on
  // each render even when the outfit and width were unchanged.
  const { result, placed, height } = placePieces(pieces, width, preset, fit && !entrance, large);

  const accessibilityProps = {
    accessible: decorative ? undefined : true,
    accessibilityElementsHidden: decorative || undefined,
    accessibilityRole: decorative ? undefined : 'image' as const,
    accessibilityLabel: decorative ? undefined : accessibilityLabel,
    importantForAccessibility: decorative ? 'no-hide-descendants' as const : undefined,
    testID,
  };

  if (!entrance && rise) {
    // The stage the screen draws stays where it is; the layers carry no accessibility
    // props, so the rise adds no node a screen reader stops on. Every shade layer sits
    // under every piece, so no shade ever crosses a garment.
    return (
      <View {...accessibilityProps} style={{ height, width }}>
        {contactShade ? result.order.map((piece, index) => (
          <RisingLayer held={holdRise} index={index} key={`shade-${piece.slot}`} style={StyleSheet.absoluteFill}>
            <Svg height={height} width={width}>
              <Ellipse fill={contactShade} {...contactShadeOf(placed.get(piece)!)} />
            </Svg>
          </RisingLayer>
        )) : null}
        {result.order.map((piece, index) => {
          const box = placed.get(piece)!;
          return (
            <RisingLayer
              held={holdRise}
              index={index}
              key={piece.slot}
              style={[styles.piece, { height: box.h, left: box.x, top: box.y, width: box.w }]}>
              <PieceArtwork height={box.h} ink={colors.textPrimary} outline={outline} piece={piece}
                roles={roles.get(piece.slot)!} width={box.w} />
            </RisingLayer>
          );
        })}
      </View>
    );
  }

  if (!entrance) {
    return (
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
                outline={outline}
                roles={roles.get(piece.slot)!}
                scale={scale}
                silhouette={piece}
              />
            </G>
          );
        })}
      </Svg>
    );
  }

  const fromBoxes = entranceStartBoxes(pieces, width, entrance.fromPreset, entrance.fromFit === true, large);

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
          outline={outline}
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
