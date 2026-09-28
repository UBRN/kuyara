import { useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';

import { AppText } from '@/components/ui/app-text';
import { Button } from '@/components/ui/button';
import { PressScale } from '@/components/ui/press-scale';
import type { GarmentTypeId, StructuralCategory } from '@/features/catalog/domain/garment-taxonomy';
import { easierToSee, useEasierToSee } from '@/theme/easier-to-see';
import { borderWidths, interaction, layout, radii, spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

import type { GarmentRoles } from './garment-palette';
import { GarmentCandidateTile } from './garment-tile-artwork';
import { SWAP_HAIRLINE_LENGTH, swapStripLayout } from './swap-gesture';

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
  onHeaderLayout?: (height: number) => void;
  testID: string;
}>;

/** The header's words: drawn from their first frame at `from` and eased in on `motion.fast`. */
function HeaderWords({ from, children }: Readonly<{ from: number; children: ReactNode }>) {
  const theme = useKuyaraTheme();
  const opacity = useSharedValue(from);
  useEffect(() => {
    opacity.set(withTiming(1, { duration: theme.motion.fast }));
  }, [opacity, theme.motion.fast]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

/**
 * Phase 7b's candidate strip under the enlarged piece (vault phase-7b final-spec): a header
 * naming the piece and its place with Done, then the slot's catalog pieces in the picker's
 * order as a grid of 44-point tiles, the current one marked. It lives outside the board's
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
  onHeaderLayout,
  testID,
}: GarmentSwapStripProps) {
  const theme = useKuyaraTheme();
  const { colors } = theme;
  // Easier to see: Done is a 56-point target like every kuyara-drawn button, so the header is too.
  const headerHeight = useEasierToSee() ? easierToSee.primaryActionHeight : layout.minimumTouchTarget;
  const [pressedId, setPressedId] = useState<GarmentTypeId | null>(null);
  const [doneWidth, setDoneWidth] = useState<number>(layout.minimumTouchTarget);
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
        style={[styles.header, { minHeight: headerHeight, paddingRight: doneWidth }]}
        testID={`${testID}-header`}>
        <HeaderWords from={fades === 0 ? 1 : 0} key={fades}>
          <View style={styles.headerLine}>
            <AppText numberOfLines={1} style={styles.name} variant="bodyStrong">{shownName}</AppText>
            <AppText colorRole="textSecondary" style={styles.counter} tabularNumbers variant="caption">
              {labels.counter(shownPosition, candidates.length)}
            </AppText>
          </View>
        </HeaderWords>
      </View>
      <View style={[styles.grid, { height: strip.height, width: strip.width }]} testID={`${testID}-grid`}>
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
      {/* Done reads after the tiles and stands at the header's trailing edge. It is a plain
          button: its press shows the tonal capsule, and Easier to see gives it 56 points and,
          with higher contrast, the strong edge. */}
      <View pointerEvents="box-none" style={[styles.doneRow, { minHeight: headerHeight, width: strip.width }]}>
        <Button
          label={labels.done}
          onLayout={({ nativeEvent }) => {
            if (nativeEvent.layout.width !== doneWidth) setDoneWidth(nativeEvent.layout.width);
          }}
          onPress={onDone}
          size="small"
          style={styles.done}
          testID={`${testID}-done`}
          variant="plain"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  counter: {
    flexShrink: 0,
  },
  // The capsule keeps `spacing.sm` around the word, so the name and counter keep their room.
  done: {
    minWidth: layout.minimumTouchTarget,
    paddingHorizontal: spacing.sm,
  },
  doneRow: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    top: 0,
  },
  grid: {
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
