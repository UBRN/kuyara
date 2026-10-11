import { useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, type SharedValue } from 'react-native-reanimated';

import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { PressScale } from '@/components/ui/press-scale';
import { fadeTo } from '@/components/ui/fade';
import type { GarmentSwatchId } from '@/features/catalog/domain/garment-swatch';
import type { GarmentTypeId, StructuralCategory } from '@/features/catalog/domain/garment-taxonomy';
import { closetSolidForBoardSwatch } from '@/features/wardrobe/domain/closet-board-swatch';
import { easierToSee, useEasierToSee } from '@/theme/easier-to-see';
import { borderWidths, interaction, layout, radii, spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

import { ColorSwatch, ColorWellFace } from './color-swatch';
import type { GarmentRoles } from './garment-palette';
import { GarmentCandidateTile } from './garment-tile-artwork';
import { SWAP_HAIRLINE_LENGTH, swapStripLayout, type SwapStripLayout } from './swap-gesture';

export type GarmentSwapStripCandidate = Readonly<{
  garmentTypeId: GarmentTypeId;
  category: StructuralCategory;
  suitable: boolean;
}>;

export type GarmentSwapStripLabels = Readonly<{
  pieceName: (garmentTypeId: GarmentTypeId) => string;
  counter: (position: number, total: number) => string;
  pieceValue: (piece: string, position: number, total: number) => string;
  done: string;
  /** Spoken on each tile after the hairline: that piece can make the outfit unusual. */
  otherHint: string;
  /** Each board swatch's colour name, the Closet palette's. */
  colorName: (swatchId: GarmentSwatchId) => string;
  moreColors: string;
  /** The reader's own pieces' heading, and each one's whole spoken name. */
  own: string;
  ownPiece: (piece: string, color: string) => string;
}>;

/**
 * The enlarged piece's colours: its drawing's own, most natural first, with "More colours"
 * (`onMore`) offering the Closet's 33, or those 33 once opened. `held` is how many swatches the
 * grid keeps room for through the whole enlargement, so a step never moves a tile under a finger.
 */
export type GarmentSwapStripColors = Readonly<{
  swatches: readonly GarmentSwatchId[];
  held: number;
  current: GarmentSwatchId | null;
  label: string;
  onMore: (() => void) | null;
  onPaint: (swatchId: GarmentSwatchId) => void;
}>;

/** One of the reader's own Closet pieces that fits the slot, drawn in the swatch it paints the board in. */
export type GarmentSwapOwnPiece = Readonly<{
  id: string;
  garmentTypeId: GarmentTypeId;
  category: StructuralCategory;
  swatchId: GarmentSwatchId;
}>;

export type GarmentSwapStripOwn = Readonly<{
  pieces: readonly GarmentSwapOwnPiece[];
  roles: ReadonlyMap<string, GarmentRoles>;
  /** The Closet marker each own piece carries. */
  badge: ReactNode;
  onChoose: (piece: GarmentSwapOwnPiece) => void;
}>;

type GarmentSwapStripProps = Readonly<{
  candidates: readonly GarmentSwapStripCandidate[];
  current: GarmentTypeId;
  /** A drag past half a step already names the piece a release lands on. */
  previewId: GarmentTypeId | null;
  roles: ReadonlyMap<GarmentTypeId, GarmentRoles>;
  columnWidth: number;
  labels: GarmentSwapStripLabels;
  /** The marker's position, written by the board's drag; without it the marker stands on its tile. */
  marker: Readonly<{ x: SharedValue<number>; y: SharedValue<number> }> | null;
  /** A leaving strip is drawn for the eye only while it fades. */
  interactive: boolean;
  onChoose: (garmentTypeId: GarmentTypeId) => void;
  onDone: () => void;
  /** A layer the reader can take off: a plain text action before Done, with a whole spoken sentence. */
  takeOff?: Readonly<{ label: string; accessibilityLabel: string; onPress: () => void }> | null;
  paint?: GarmentSwapStripColors | null;
  own?: GarmentSwapStripOwn | null;
  onHeaderLayout?: (height: number) => void;
  onOwnLabelLayout?: (height: number) => void;
  testID: string;
}>;

const gridStyle = (grid: SwapStripLayout) => ({ height: grid.height, width: grid.width });
const tileAt = (grid: SwapStripLayout, index: number) => ({ left: grid.tiles[index].x, top: grid.tiles[index].y });

/** The header's words: drawn from their first frame at `from` and eased in on `motion.fast`. */
function HeaderWords({ from, children }: Readonly<{ from: number; children: ReactNode }>) {
  const theme = useKuyaraTheme();
  const opacity = useSharedValue(from);
  useEffect(() => {
    opacity.set(fadeTo(1, theme.motion.fast, theme.motion));
  }, [opacity, theme.motion]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

/**
 * Phase 7b's candidate strip under the enlarged piece: a header
 * naming the piece and its place with Done (and Take off for a layer), the piece's colours,
 * the reader's own Closet pieces of the slot under "Yours" and a hairline, then the slot's
 * catalog pieces in the picker's order as a grid of 44-point tiles, the current one marked.
 * Every section wraps in rows, never a sideways scroller. It lives outside the board's
 * gesture: a tile, Done or a gap between tiles never reaches the board. A pressed tile names
 * itself in the header before release, because two pieces can share a drawing.
 */
export function GarmentSwapStrip({
  candidates,
  current,
  previewId,
  roles,
  columnWidth,
  labels,
  marker,
  interactive,
  onChoose,
  onDone,
  takeOff = null,
  paint = null,
  own = null,
  onHeaderLayout,
  onOwnLabelLayout,
  testID,
}: GarmentSwapStripProps) {
  const theme = useKuyaraTheme();
  const { colors } = theme;
  // Easier to see: Done is a 56-point target like every kuyara-drawn button, so the header is too.
  const headerHeight = useEasierToSee() ? easierToSee.primaryActionHeight : layout.minimumTouchTarget;
  const [pressedId, setPressedId] = useState<GarmentTypeId | null>(null);
  // The header's actions are measured, so the name and counter keep clear of them.
  const [actionsWidth, setActionsWidth] = useState<number>(layout.minimumTouchTarget);
  const suitableCount = candidates.filter(({ suitable }) => suitable).length;
  const strip = swapStripLayout(candidates.length, suitableCount, columnWidth);
  const indexOf = (garmentTypeId: GarmentTypeId) =>
    candidates.findIndex((candidate) => candidate.garmentTypeId === garmentTypeId);
  const shownId = pressedId ?? previewId ?? current;
  const shownName = labels.pieceName(shownId);
  const shownPosition = indexOf(shownId) + 1;

  // The header fades only when its words change without a preview having named them first.
  // The new words mount transparent, so they never show whole for a frame before the fade.
  const [lastShown, setLastShown] = useState(shownId);
  const [fades, setFades] = useState(0);
  if (lastShown !== shownId) {
    setLastShown(shownId);
    if (pressedId === null && previewId === null) setFades((count) => count + 1);
  }

  const colorGrid = paint ? swapStripLayout(paint.held, paint.held, columnWidth) : null;
  const ownGrid = own ? swapStripLayout(own.pieces.length, own.pieces.length, columnWidth) : null;

  const currentTile = strip.tiles[Math.max(0, indexOf(current))] ?? { x: 0, y: 0 };
  const markerStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: marker ? marker.x.get() : currentTile.x },
      { translateY: marker ? marker.y.get() : currentTile.y },
    ],
  }), [currentTile.x, currentTile.y, marker]);

  return (
    <View
      accessibilityElementsHidden={!interactive}
      importantForAccessibility={interactive ? 'auto' : 'no-hide-descendants'}
      onAccessibilityEscape={onDone}
      pointerEvents={interactive ? 'box-none' : 'none'}
      style={{ width: strip.width }}
      testID={testID}>
      <View
        accessibilityLabel={labels.pieceValue(shownName, shownPosition, candidates.length)}
        accessible
        onLayout={({ nativeEvent }) => onHeaderLayout?.(nativeEvent.layout.height)}
        style={[styles.header, { minHeight: headerHeight, paddingRight: actionsWidth }]}
        testID={`${testID}-header`}>
        <HeaderWords from={fades === 0 ? 1 : 0} key={fades}>
          <View style={styles.headerLine}>
            {/* A long name wraps rather than truncates, the counter beside it; one that fits keeps one line. */}
            <AppText style={styles.name} variant="bodyStrong">{shownName}</AppText>
            <AppText colorRole="textSecondary" style={styles.counter} tabularNumbers variant="caption">
              {labels.counter(shownPosition, candidates.length)}
            </AppText>
          </View>
        </HeaderWords>
      </View>
      {/* Under the header, `sm` then each section, `md` after the colours, the reader's own
          pieces closing on a hairline `sm` either side: `swapPanelHeight` adds the same. */}
      {paint && colorGrid ? (
        // A radio group: the screen reader names the piece's colour once and each swatch by its name.
        <View
          accessibilityLabel={paint.label}
          accessibilityRole="radiogroup"
          style={[styles.section, gridStyle(colorGrid)]}
          testID={`${testID}-colors`}>
          {paint.swatches.map((swatchId, index) => (
            <View key={swatchId} style={[styles.tile, tileAt(colorGrid, index)]}>
              <ColorSwatch
                choice={{ kind: 'option', id: closetSolidForBoardSwatch(swatchId) }}
                disabled={false}
                label={labels.colorName(swatchId)}
                onPress={() => paint.onPaint(swatchId)}
                selected={swatchId === paint.current}
                testID={`${testID}-color-${swatchId}`}
              />
            </View>
          ))}
          {paint.onMore ? (
            <PressScale
              accessibilityLabel={labels.moreColors}
              accessibilityRole="button"
              onPress={paint.onMore}
              style={({ pressed }) => [styles.tile, styles.more, tileAt(colorGrid, paint.swatches.length),
                pressed && styles.pressed]}
              testID={`${testID}-more-colors`}>
              <ColorWellFace hex={null} testID={`${testID}-more-colors-face`} />
            </PressScale>
          ) : null}
        </View>
      ) : null}
      {own && ownGrid ? (
        <View style={paint ? styles.group : styles.section} testID={`${testID}-own`}>
          <AppText
            colorRole="textSecondary"
            onLayout={({ nativeEvent }) => onOwnLabelLayout?.(nativeEvent.layout.height)}
            variant="caption">
            {labels.own}
          </AppText>
          <View style={[styles.ownGrid, gridStyle(ownGrid)]} testID={`${testID}-own-grid`}>
            {own.pieces.map((piece, index) => (
              <PressScale
                accessibilityLabel={labels.ownPiece(labels.pieceName(piece.garmentTypeId), labels.colorName(piece.swatchId))}
                accessibilityRole="button"
                key={piece.id}
                onPress={() => own.onChoose(piece)}
                style={({ pressed }) => [styles.tile, tileAt(ownGrid, index), pressed && styles.pressed]}
                testID={`${testID}-own-${piece.id}`}>
                <GarmentCandidateTile
                  category={piece.category}
                  control
                  garmentTypeId={piece.garmentTypeId}
                  roles={own.roles.get(piece.id)}
                  testIDPrefix={`${testID}-own-art`}
                />
                <View style={styles.badge}>{own.badge}</View>
              </PressScale>
            ))}
          </View>
          <View
            style={[styles.hairlineAcross, { backgroundColor: colors.borderSubtle, width: strip.width }]}
            testID={`${testID}-own-hairline`}
          />
        </View>
      ) : null}
      <View
        style={[paint && !own ? styles.group : styles.section, { height: strip.height, width: strip.width }]}
        testID={`${testID}-grid`}>
        {candidates.map((candidate, index) => {
          const tile = strip.tiles[index];
          const selected = candidate.garmentTypeId === current;
          return (
            <PressScale
              accessibilityHint={candidate.suitable ? undefined : labels.otherHint}
              accessibilityLabel={labels.pieceName(candidate.garmentTypeId)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              key={candidate.garmentTypeId}
              onPress={() => onChoose(candidate.garmentTypeId)}
              onPressIn={() => setPressedId(candidate.garmentTypeId)}
              onPressOut={() => setPressedId(null)}
              // A held tile dims (the tiles' pressed token); the scale rides on top of it.
              style={({ pressed }) => [styles.tile, {
                left: tile.x, opacity: pressed ? interaction.pressedOpacity : 1, top: tile.y,
              }]}
              testID={`${testID}-tile-${candidate.garmentTypeId}`}>
              <GarmentCandidateTile
                category={candidate.category}
                control
                garmentTypeId={candidate.garmentTypeId}
                roles={roles.get(candidate.garmentTypeId)}
                testIDPrefix={`${testID}-art`}
              />
            </PressScale>
          );
        })}
        {strip.hairline ? (
          <View
            pointerEvents="none"
            style={[styles.hairline, { backgroundColor: colors.borderSubtle, left: strip.hairline.x, top: strip.hairline.y }]}
            testID={`${testID}-hairline`}
          />
        ) : null}
        <Animated.View
          pointerEvents="none"
          style={[styles.marker, { borderColor: colors.focusRing }, markerStyle]}
          testID={`${testID}-marker`}
        />
      </View>
      {/* Take off and Done read after the tiles and stand at the header's trailing edge. Each
          is a plain button: its press shows the tonal capsule, and Easier to see gives it 56
          points and, with higher contrast, the strong edge. */}
      <View pointerEvents="box-none" style={[styles.actionsRow, { minHeight: headerHeight, width: strip.width }]}>
        <View
          onLayout={({ nativeEvent }) => {
            if (nativeEvent.layout.width !== actionsWidth) setActionsWidth(nativeEvent.layout.width);
          }}
          pointerEvents="box-none"
          style={styles.actions}>
          {takeOff ? (
            <Button
              accessibilityLabel={takeOff.accessibilityLabel}
              label={takeOff.label}
              onPress={takeOff.onPress}
              size="small"
              style={styles.action}
              testID={`${testID}-take-off`}
              variant="plain"
            />
          ) : null}
          <Button
            label={labels.done}
            onPress={onDone}
            size="small"
            style={styles.action}
            testID={`${testID}-done`}
            variant="plain"
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  counter: {
    flexShrink: 0,
  },
  // The capsule keeps `spacing.sm` around the word, so the name and counter keep their room.
  action: {
    minWidth: layout.minimumTouchTarget,
    paddingHorizontal: spacing.sm,
  },
  actions: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  actionsRow: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    top: 0,
  },
  // The Closet marker in the own piece's corner, inside its 44-point target.
  badge: {
    position: 'absolute',
    right: 0,
    top: 0,
  },
  group: {
    marginTop: spacing.md,
  },
  hairlineAcross: {
    height: borderWidths.subtle,
    marginTop: spacing.sm,
  },
  more: {
    alignItems: 'center',
    borderRadius: layout.minimumTouchTarget / 2,
    height: layout.minimumTouchTarget,
    justifyContent: 'center',
    width: layout.minimumTouchTarget,
  },
  ownGrid: {
    marginTop: spacing.xs,
  },
  pressed: {
    opacity: interaction.pressedOpacity,
  },
  section: {
    marginTop: spacing.sm,
  },
  hairline: {
    height: SWAP_HAIRLINE_LENGTH,
    position: 'absolute',
    width: borderWidths.subtle,
  },
  header: {
    justifyContent: 'center',
  },
  // Law 2: `xs` binds the counter to the name it counts.
  headerLine: {
    alignItems: 'baseline',
    columnGap: spacing.xs,
    flexDirection: 'row',
  },
  marker: {
    borderRadius: radii.control,
    borderWidth: borderWidths.strong,
    height: layout.minimumTouchTarget,
    left: 0,
    position: 'absolute',
    top: 0,
    width: layout.minimumTouchTarget,
  },
  name: {
    flexShrink: 1,
  },
  tile: {
    position: 'absolute',
  },
});
