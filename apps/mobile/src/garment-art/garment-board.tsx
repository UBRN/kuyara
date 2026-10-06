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
import Svg, {
  Defs,
  FeComposite,
  FeFlood,
  FeGaussianBlur,
  FeMerge,
  FeMergeNode,
  FeOffset,
  Filter,
  G,
} from 'react-native-svg';

import type { GarmentTypeId, StructuralCategory } from '@/features/catalog/domain/garment-taxonomy';
import type { OutfitSlot } from '@/features/recommendation/domain/outfit-composition';
import { useStableEntries } from '@/hooks/use-stable-value';
import { shiftOklchLightness } from '@/theme/color-oklch';
import { easierToSee as easierToSeeValues, useEasierToSee } from '@/theme/easier-to-see';
import { plateTheme, spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

import { PRESENCE_TEXT_AFTER } from '@/components/ui/presence';
import { fadeTo } from '@/components/ui/fade';
import { composeFlatLay, fitTodayStage, flatLayPreset } from './compose-flat-lay';
import {
  composeGarmentBoard,
  detailPreset,
  drawnExtent,
  easierToSeeRule,
  footwearPairDrawing,
  garmentShadowOf,
  garmentShadowRule,
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

export { composeGarmentBoard, garmentBoardDressingOrder } from './compose-garment-board';

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

// Law 7's exit: a hero board taken off its stage for another outfit drops one small rhythm
// step and fades on `fast`, as one view, its shadows with it, before the new pieces rise.
const EXIT_TRAVEL = spacing.sm;

/** The leaving board: drawn at rest, it drops and fades once on mount, then reports it has left. */
function LeavingLayer({ children, onLeft }: Readonly<{ children: ReactNode; onLeft: () => void }>) {
  const theme = useKuyaraTheme();
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.set(fadeTo(1, theme.motion.fast, theme.motion, (finished) => {
      'worklet';
      if (finished) scheduleOnRN(onLeft);
    }));
  }, [onLeft, progress, theme.motion]);
  const style = useAnimatedStyle(() => ({
    opacity: 1 - progress.get(),
    transform: [{ translateY: EXIT_TRAVEL * progress.get() }],
  }));
  return <Animated.View pointerEvents="none" style={style}>{children}</Animated.View>;
}

/**
 * One rising piece, with its shadow, on its own native view: Reanimated cannot move a group
 * inside one SVG on the new architecture. The pieces leave in the board's reading order, each
 * one `motion.stagger` after the piece before it (ADR 0020), while the views stack in the
 * board's stacking order, so a later piece lies over an earlier one from its first frame. The travel
 * rides the arrival role, the fade is effects motion on `motion.fast`. It starts once, when
 * `held` is false.
 */
function RisingLayer({
  after,
  children,
  held,
  index,
  style,
}: Readonly<{ after: number; children: ReactNode; held: boolean; index: number; style: StyleProp<ViewStyle> }>) {
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
    const delay = after + index * theme.motion.stagger;
    opacity.set(withDelay(delay, fadeTo(1, theme.motion.fast, theme.motion)));
    offset.set(withDelay(delay, withSpring(0, theme.springs.arrival, (finished) => {
      if (finished) scheduleOnRN(setRisen, true);
    })));
  }, [after, held, index, offset, opacity, theme.motion, theme.springs.arrival]);

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
   * `entrance` is set: a travelling board already arrives. Turned off, the pieces are drawn
   * at rest: Today turns it off for the outfit the first-generation runway carried onto it.
   */
  rise?: boolean;
  /**
   * Holds a rising board's pieces at their start, unseen, until it turns false, so the
   * rise plays when nothing covers the stage (the first-run runway). It starts once.
   */
  holdRise?: boolean;
  /**
   * Law 7's exit: the board is the outfit Today's stage has just let go. Drawn at rest, it
   * drops and fades as one on `fast`, then calls this so its screen can unmount it.
   */
  onLeft?: () => void;
  /** The board takes another outfit's place: its rise waits out that board's exit. */
  replaces?: boolean;
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
  testID?: string;
}>;

const withSilhouettes = (pieces: readonly GarmentBoardPiece[]) => pieces.map((piece) => ({
  ...piece, ...resolveGarmentSilhouette(piece.garmentTypeId, piece.category),
}));

function ruleOf(preset: Preset, large: boolean) {
  const rule = preset === 'today' ? todayPreset : detailPreset;
  return large ? easierToSeeRule(rule, easierToSeeValues.boardScale, easierToSeeValues.boardSideMinimum) : rule;
}

export function composePieces(pieces: readonly GarmentBoardPiece[], preset: Preset, large = false) {
  return composeGarmentBoard(withSilhouettes(pieces), ruleOf(preset, large));
}

/**
 * Every piece's drawn box in points, the stage height and the board's unit (the points one
 * composition unit is drawn at): the worn board, or with `fit` Today's flat lay fitted to its
 * band.
 */
function placePieces(pieces: readonly GarmentBoardPiece[], width: number, preset: Preset, fit: boolean, large = false) {
  if (!fit) {
    const result = composePieces(pieces, preset, large);
    const placed = new Map(result.order.map((piece) => {
      const box = result.boxes.get(piece)!;
      return [piece, { x: box.x * width, y: box.y * width, w: box.w * width, h: box.h * width }];
    }));
    return { result, placed, height: width * result.stageHeight, unit: width };
  }
  const result = composeFlatLay(withSilhouettes(pieces), ruleOf(preset, large));
  const extent = drawnExtent(result.boxes.values());
  const coreWidth = Math.max(...result.core.map((piece) => result.boxes.get(piece)!.w));
  const coreCap = flatLayPreset.coreWidth * (large ? easierToSeeValues.boardScale : 1);
  const { scale, height } = fitTodayStage(extent, width, coreWidth, coreCap);
  const placed = new Map(result.order.map((piece) => [
    piece, placeOnRunway(result.boxes.get(piece)!, extent, scale, width, height),
  ]));
  return { result, placed, height, unit: scale };
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
  const theme = useKuyaraTheme();
  const { colors, colorScheme } = plateTheme(theme, stageColor ?? theme.colors.background);
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
  const theme = useKuyaraTheme();
  // The picker's tiles are garment plates.
  const { colors, colorScheme } = plateTheme(theme, theme.colors.garmentTile);
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

// One shoe drawing per shoe silhouette: every composition makes a new footwear piece, and a
// drawing whose silhouette keeps its identity is not painted again.
const pairShoes = new WeakMap<object, ComposedPiece>();
function pairShoeOf(piece: ComposedPiece, single: NonNullable<ComposedPiece['single']>) {
  const known = pairShoes.get(single);
  if (known) return known;
  const shoe = { ...piece, bounds: single } as ComposedPiece;
  pairShoes.set(single, shoe);
  return shoe;
}

/**
 * One composed piece's drawing, in its drawing units: a board's footwear is its one shoe
 * drawn twice as a pair (ADR 0025 section 2), far shoe first, each at the pair's scale.
 */
function BoardPainting({ piece, scale, ...props }: Readonly<{
  piece: ComposedPiece;
  scale: number;
  ink: string;
  lod: ReturnType<typeof garmentLevelOfDetail>;
  outline?: number;
  layer?: 'all' | 'fill' | 'outline';
  roles: GarmentRoles;
}>) {
  const { single } = piece;
  if (!single) return <GarmentPainting {...props} scale={scale} silhouette={piece} />;
  const pair = footwearPairDrawing(single);
  const shoe = pairShoeOf(piece, single);
  return (
    <G>
      {pair.shoes.map(({ dx, dy }, index) => (
        <G key={index === 0 ? 'far' : 'near'} transform={`translate(${dx} ${dy}) scale(${pair.scale})`}>
          <GarmentPainting {...props} scale={scale * pair.scale} silhouette={shoe} />
        </G>
      ))}
    </G>
  );
}

/** A piece's soft shadow in points (ADR 0025 section 9), and its colour. */
export type PieceShadow = ReturnType<typeof garmentShadowOf> & Readonly<{ color: string }>;

/** The shadow the pieces of a board drawn at `unit` points cast on the plane `stageColor`. */
export function pieceShadowOf(unit: number, stageColor: string, colorScheme: 'light' | 'dark'): PieceShadow {
  return { ...garmentShadowOf(unit), color: shiftOklchLightness(stageColor, garmentShadowRule.step[colorScheme]) };
}

/**
 * One piece painted at its drawn box, in points, casting its shadow. The filter reads only
 * the painting's alpha, so it follows whatever the drawing paints; `only` draws the shadow
 * alone. Its units are points: the scale lives on the inner group.
 */
function ShadowedPainting({
  id,
  piece,
  box,
  roles,
  ink,
  outline,
  layer,
  shadow,
  only = false,
}: Readonly<{
  id: string;
  piece: ComposedPiece;
  box: DrawnBox;
  roles: GarmentRoles;
  ink: string;
  outline?: number;
  layer?: 'all' | 'fill' | 'outline';
  shadow: PieceShadow;
  only?: boolean;
}>) {
  // The composition keeps each drawing's aspect ratio, so one scale serves both axes.
  const scale = box.w / piece.bounds.width;
  const painting = (
    <G transform={`translate(${box.x - piece.bounds.x * scale} ${box.y - piece.bounds.y * scale}) scale(${scale})`}>
      <BoardPainting
        ink={ink}
        layer={layer}
        lod={garmentLevelOfDetail(Math.max(box.w, box.h))}
        outline={outline}
        piece={piece}
        roles={roles}
        scale={scale}
      />
    </G>
  );
  const { margin } = shadow;
  return (
    <G>
      <Defs>
        <Filter
          filterUnits="userSpaceOnUse"
          height={box.h + 2 * margin}
          id={id}
          width={box.w + 2 * margin}
          x={box.x - margin}
          y={box.y - margin}>
          <FeGaussianBlur in="SourceAlpha" stdDeviation={shadow.blur} />
          <FeOffset dx={shadow.dx} dy={shadow.dy} result="offset" />
          <FeFlood floodColor={shadow.color} />
          <FeComposite in2="offset" operator="in" result="shadow" />
          {only ? null : (
            <FeMerge>
              <FeMergeNode in="shadow" />
              <FeMergeNode in="SourceGraphic" />
            </FeMerge>
          )}
        </Filter>
      </Defs>
      <G filter={`url(#${id})`}>{painting}</G>
    </G>
  );
}

/**
 * One composed piece in its own box, the viewBox fitted to its drawn bounds. With a shadow
 * the drawing spreads past the box by the shadow's margin, so nothing clips it.
 */
export function PieceArtwork({
  piece,
  roles,
  ink,
  width,
  height,
  layer,
  outline,
  shadow = null,
  shadowOnly = false,
}: Readonly<{
  piece: ComposedPiece;
  roles: GarmentRoles;
  ink: string;
  width: number;
  height: number;
  layer?: 'all' | 'fill' | 'outline';
  /** The board outline in points; O13's mode draws it heavier. */
  outline?: number;
  shadow?: PieceShadow | null;
  /** Draws the shadow alone, for a layer that shows it under a painting drawn elsewhere. */
  shadowOnly?: boolean;
}>) {
  const { bounds } = piece;

  if (shadow) {
    const { margin } = shadow;
    return (
      <View pointerEvents="none" style={{ height, width }}>
        <Svg
          height={height + 2 * margin}
          style={[styles.piece, { left: -margin, top: -margin }]}
          width={width + 2 * margin}>
          <ShadowedPainting
            box={{ x: margin, y: margin, w: width, h: height }}
            id="piece-shadow"
            ink={ink}
            layer={layer}
            only={shadowOnly}
            outline={outline}
            piece={piece}
            roles={roles}
            shadow={shadow}
          />
        </Svg>
      </View>
    );
  }

  return (
    <Svg
      height={height}
      preserveAspectRatio="none"
      viewBox={`${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`}
      width={width}>
      <BoardPainting
        ink={ink}
        layer={layer}
        lod={garmentLevelOfDetail(Math.max(width, height))}
        outline={outline}
        piece={piece}
        roles={roles}
        scale={width / bounds.width}
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
  shadow,
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
  shadow: PieceShadow;
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
      <PieceArtwork height={boxHeight} ink={ink} outline={outline} piece={piece} roles={roles} shadow={shadow}
        width={boxWidth} />
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
  onLeft,
  replaces = false,
  settle,
  palette,
  stageColor,
  fit = false,
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
  const { result, placed, height, unit } = placePieces(pieces, width, preset, fit && !entrance, large);
  const shadow = pieceShadowOf(unit, stageColor ?? colors.background, theme.colorScheme);

  const accessibilityProps = {
    accessible: decorative ? undefined : true,
    accessibilityElementsHidden: decorative || undefined,
    accessibilityRole: decorative ? undefined : 'image' as const,
    accessibilityLabel: decorative ? undefined : accessibilityLabel,
    importantForAccessibility: decorative ? 'no-hide-descendants' as const : undefined,
    testID,
  };

  // Every board draws its pieces in its stacking order (the dressing order, or the flat lay's
  // on Today's band), so where two overlap the later one lies over the earlier and casts its
  // shadow on it.
  const reading = new Map(result.order.map((piece, index) => [piece, index]));

  if (!entrance && rise) {
    // The stage the screen draws stays where it is; the layers carry no accessibility
    // props, so the rise adds no node a screen reader stops on.
    return (
      <View {...accessibilityProps} style={{ height, width }}>
        {result.stack.map((piece) => {
          const box = placed.get(piece)!;
          return (
            <RisingLayer
              after={replaces ? theme.motion.fast : 0}
              held={holdRise}
              index={reading.get(piece)!}
              key={piece.slot}
              style={[styles.piece, { height: box.h, left: box.x, top: box.y, width: box.w }]}>
              <PieceArtwork height={box.h} ink={colors.textPrimary} outline={outline} piece={piece}
                roles={roles.get(piece.slot)!} shadow={shadow} width={box.w} />
            </RisingLayer>
          );
        })}
      </View>
    );
  }

  if (!entrance) {
    const board = (
      <Svg {...accessibilityProps} height={height} width={width}>
        {result.stack.map((piece) => (
          <ShadowedPainting
            box={placed.get(piece)!}
            id={`shadow-${piece.slot}`}
            ink={colors.textPrimary}
            key={piece.slot}
            outline={outline}
            piece={piece}
            roles={roles.get(piece.slot)!}
            shadow={shadow}
          />
        ))}
      </Svg>
    );
    return onLeft ? <LeavingLayer onLeft={onLeft}>{board}</LeavingLayer> : board;
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
      {result.stack.map((piece) => (
        <TravellingPiece
          fromBox={fromBoxes.get(piece.slot) ?? result.boxes.get(piece)!}
          ink={colors.textPrimary}
          key={piece.slot}
          outline={outline}
          piece={piece}
          progress={progress}
          roles={roles.get(piece.slot)!}
          settleTravel={settleTravel}
          shadow={shadow}
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
