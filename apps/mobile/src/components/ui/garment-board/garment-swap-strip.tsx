import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';

import { AppText } from '@/components/ui/app-text';
import { PressScale } from '@/components/ui/press-scale';
import type { GarmentTypeId, StructuralCategory } from '@/features/catalog/domain/garment-taxonomy';
import { borderWidths, layout, radii, spacing } from '@/theme/theme';
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
  /** Spoken on the tiles after the hairline: they can make the outfit unusual. */
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
  const [lastShown, setLastShown] = useState(shownId);
  const [fades, setFades] = useState(0);
  if (lastShown !== shownId) {
    setLastShown(shownId);
    if (pressedId === null && previewId === null) setFades((count) => count + 1);
  }
  const headerOpacity = useSharedValue(1);
  useEffect(() => {
    if (fades === 0) return;
    headerOpacity.set(0);
    headerOpacity.set(withTiming(1, { duration: theme.motion.fast }));
  }, [fades, headerOpacity, theme.motion.fast]);
  const headerStyle = useAnimatedStyle(() => ({ opacity: headerOpacity.get() }));

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
      <Animated.View
        accessibilityLabel={labels.pieceValue(shownName, shownPosition, candidates.length)}
        accessible
        onLayout={({ nativeEvent }) => onHeaderLayout?.(nativeEvent.layout.height)}
        style={[styles.header, { paddingRight: doneWidth }, headerStyle]}
        testID={`${testID}-header`}>
        <View style={styles.headerLine}>
          <AppText numberOfLines={1} style={styles.name} variant="bodyStrong">{shownName}</AppText>
          <AppText colorRole="textSecondary" style={styles.counter} tabularNumbers variant="caption">
            {labels.counter(shownPosition, candidates.length)}
          </AppText>
        </View>
      </Animated.View>
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
              style={[styles.tile, { left: tile.x, top: tile.y }]}
              testID={`${testID}-tile-${candidate.garmentTypeId}`}>
              <GarmentCandidateTile
                category={candidate.category}
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
      {/* Done reads after the tiles and stands at the header's trailing edge, flush with the grid. */}
      <View pointerEvents="box-none" style={[styles.doneRow, { width: strip.width }]}>
        <PressScale
          accessibilityLabel={labels.done}
          accessibilityRole="button"
          onLayout={({ nativeEvent }) => {
            if (nativeEvent.layout.width !== doneWidth) setDoneWidth(nativeEvent.layout.width);
          }}
          onPress={onDone}
          style={styles.done}
          testID={`${testID}-done`}>
          <AppText colorRole="brandAccent" variant="label">{labels.done}</AppText>
        </PressScale>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  counter: {
    flexShrink: 0,
  },
  done: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    minHeight: layout.minimumTouchTarget,
    minWidth: layout.minimumTouchTarget,
    paddingLeft: spacing.sm,
  },
  doneRow: {
    alignItems: 'flex-end',
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
    minHeight: layout.minimumTouchTarget,
  },
  headerLine: {
    alignItems: 'baseline',
    columnGap: spacing.sm,
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
