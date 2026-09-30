import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { FullWindowOverlay } from 'react-native-screens';

import { AMBIENT_PULSE_FLOOR, useAmbientPulse } from '@/components/ui/use-ambient-pulse';
import { borderWidths } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

/** A rounded rectangle in window coordinates. */
export type CoachMarkRect = Readonly<{
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
}>;

// The spotlight opens this much larger than its first place and closes onto it.
const OPENING_INFLATE = 28;
// The ring: a 2-point accent outline 4 points outside the live control.
const RING_OFFSET = 4;
// How far the ring's outer edge stands outside the live control. A lit neighbour closer than
// this would be drawn through, so screens keep at least this gap around a ringed control.
export const RING_OUTSET = RING_OFFSET + borderWidths.strong;
// The ring breathes down to 30 % of the accent (approved with the Phase 8 prototype).
const RING_FLOOR = 0.3;
// The dim is five opaque views drawn as one group at the scrim's alpha, so where they overlap
// nothing darkens twice: four rectangles around the cut-out's box, and a frame as thick as the
// corner radius whose inner edge is the cut-out's rounded corners. Reanimated cannot drive
// react-native-svg's props on the new architecture, and one view with a border wider than the
// window is bigger than the largest layer iOS will draw (the Simulator showed no dim at all).
function scrimInk(scrim: string): Readonly<{ color: string; alpha: number }> {
  const match = /^rgba\(\s*(\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\s*\)$/.exec(scrim);
  return match
    ? { color: `rgb(${match[1]}, ${match[2]}, ${match[3]})`, alpha: Number(match[4]) }
    : { color: scrim, alpha: 1 };
}

/**
 * A layer above everything the app draws, native tabs and presented sheets included: on iOS a
 * full-window overlay (a pass-through container on the key window, modal to VoiceOver), on
 * Android a view above the navigator. Touches that land on no view of the layer pass to the
 * app underneath. A container is stacked above what is presented when it mounts, so a caller
 * that needs it above a sheet presented later remounts it by changing `layer`.
 */
function WindowOverlay({ children }: Readonly<{ children: ReactNode }>) {
  if (Platform.OS === 'ios') return <FullWindowOverlay>{children}</FullWindowOverlay>;
  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      {children}
    </View>
  );
}

export type CoachMarkLayerProps = Readonly<{
  /** False fades the whole layer out; `onHidden` fires when it is gone. */
  visible: boolean;
  onHidden: () => void;
  /** The lit area; null dims the whole window. */
  hole: CoachMarkRect | null;
  /** The live control, ringed; null shows no ring. */
  ring: CoachMarkRect | null;
  /** False fades the dim out (a presented sheet dims the app itself). */
  dimmed?: boolean;
  /** Changing it restacks the layer above anything presented since. */
  layer: number;
  accessibilityLabel: string;
  onAccessibilityEscape: () => void;
  children: ReactNode;
}>;

/**
 * The coach-mark layer (Phase 8): the `scrim` dim with a rounded cut-out, the breathing ring
 * around the one live control, and whatever the caller puts on top. Law 7's roles only: the
 * dim fades in on `deliberate` and out on three quarters of it, the cut-out moves and morphs
 * on the `spatial` spring, the ring fades in on `normal` and breathes on the ambient step.
 * It draws and times; the caller decides what is lit and what takes touches.
 */
export function CoachMarkLayer({
  accessibilityLabel,
  children,
  dimmed = true,
  hole,
  layer,
  onAccessibilityEscape,
  onHidden,
  ring,
  visible,
}: CoachMarkLayerProps) {
  const theme = useKuyaraTheme();
  const { height, width } = useWindowDimensions();
  const opacity = useSharedValue(0);
  const x = useSharedValue(width / 2);
  const y = useSharedValue(height / 2);
  const w = useSharedValue(0);
  const h = useSharedValue(0);
  const r = useSharedValue(0);
  const dim = useSharedValue(dimmed ? 1 : 0);
  const placed = useRef(false);
  const hidden = useRef(onHidden);
  useEffect(() => {
    hidden.current = onHidden;
  }, [onHidden]);
  const finishHiding = useCallback(() => hidden.current(), []);

  useEffect(() => {
    opacity.set(visible
      ? withTiming(1, { duration: theme.motion.deliberate, easing: Easing.out(Easing.quad) })
      : withTiming(0, {
        duration: Math.round(theme.motion.deliberate * 0.75),
        easing: Easing.in(Easing.quad),
      }, (finished) => {
        if (finished) runOnJS(finishHiding)();
      }));
  }, [finishHiding, opacity, theme.motion.deliberate, visible]);

  const target = hole ?? { x: width / 2, y: height / 2, width: 0, height: 0, radius: 0 };
  useEffect(() => {
    if (!placed.current && hole) {
      // The first place: start larger and close onto it.
      placed.current = true;
      x.set(hole.x - OPENING_INFLATE);
      y.set(hole.y - OPENING_INFLATE);
      w.set(hole.width + OPENING_INFLATE * 2);
      h.set(hole.height + OPENING_INFLATE * 2);
      r.set(hole.radius + OPENING_INFLATE);
    }
    const spring = theme.springs.spatial;
    x.set(withSpring(target.x, spring));
    y.set(withSpring(target.y, spring));
    w.set(withSpring(target.width, spring));
    h.set(withSpring(target.height, spring));
    r.set(withSpring(target.radius, spring));
  }, [h, hole, r, target.height, target.radius, target.width, target.x, target.y,
    theme.springs.spatial, w, x, y]);

  useEffect(() => {
    dim.set(withTiming(dimmed ? 1 : 0, { duration: theme.motion.normal }));
  }, [dim, dimmed, theme.motion.normal]);

  const layerStyle = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  const topStyle = useAnimatedStyle(() => ({
    height: Math.max(0, y.get()), left: 0, top: 0, width,
  }));
  const bottomStyle = useAnimatedStyle(() => ({
    height: Math.max(0, height - y.get() - h.get()), left: 0, top: y.get() + h.get(), width,
  }));
  const leftStyle = useAnimatedStyle(() => ({
    height: h.get(), left: 0, top: y.get(), width: Math.max(0, x.get()),
  }));
  const rightStyle = useAnimatedStyle(() => ({
    height: h.get(), left: x.get() + w.get(), top: y.get(), width: Math.max(0, width - x.get() - w.get()),
  }));
  const cornerStyle = useAnimatedStyle(() => {
    const radius = Math.max(0, Math.min(r.get(), w.get() / 2, h.get() / 2));
    return {
      borderRadius: radius * 2,
      borderWidth: radius,
      height: h.get() + radius * 2,
      left: x.get() - radius,
      top: y.get() - radius,
      width: w.get() + radius * 2,
    };
  });
  const ink = scrimInk(theme.colors.scrim);
  const dimStyle = useAnimatedStyle(() => ({ opacity: ink.alpha * dim.get() }));

  return (
    <WindowOverlay key={layer}>
      <Animated.View
        accessibilityLabel={accessibilityLabel}
        accessibilityViewIsModal
        onAccessibilityEscape={onAccessibilityEscape}
        pointerEvents="box-none"
        style={[StyleSheet.absoluteFill, layerStyle]}
        testID="coach-mark-layer">
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, dimStyle]}
          testID="coach-mark-scrim">
          {[topStyle, bottomStyle, leftStyle, rightStyle].map((style, index) => (
            <Animated.View key={index} style={[styles.scrimPiece, { backgroundColor: ink.color }, style]} />
          ))}
          <Animated.View style={[styles.scrimPiece, { borderColor: ink.color }, cornerStyle]} />
        </Animated.View>
        {ring ? <CoachMarkRing rect={ring} /> : null}
        {children}
      </Animated.View>
    </WindowOverlay>
  );
}

/**
 * The ring around the one live control: a 2-point accent outline 4 points outside it,
 * fading in on `normal` and breathing on the ambient step down to 30 % of the accent. It
 * takes no touches. Placed by its caller's coordinates, so a presented sheet can draw it in
 * its own space.
 */
export function CoachMarkRing({ rect }: Readonly<{ rect: CoachMarkRect }>) {
  const theme = useKuyaraTheme();
  const opacity = useSharedValue(0);
  const pulse = useAmbientPulse();
  useEffect(() => {
    opacity.set(withTiming(1, { duration: theme.motion.normal }));
  }, [opacity, theme.motion.normal]);
  const style = useAnimatedStyle(() => {
    const breath = (pulse.get() - AMBIENT_PULSE_FLOOR) / (1 - AMBIENT_PULSE_FLOOR);
    return { opacity: opacity.get() * (RING_FLOOR + (1 - RING_FLOOR) * breath) };
  });
  const inset = RING_OUTSET;

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.ring, {
        borderColor: theme.colors.brandAccent,
        borderRadius: rect.radius + inset,
        height: rect.height + inset * 2,
        left: rect.x - inset,
        top: rect.y - inset,
        width: rect.width + inset * 2,
      }, style]}
      testID="coach-mark-ring"
    />
  );
}

/**
 * Content that arrives beside a lit area (the coach-mark bubble): it fades in on `fast` and
 * travels its last 12 points on the `arrival` spring, rising from below or dropping from
 * above. It arrives once per mount.
 */
export function CoachMarkArrival({
  children,
  from,
}: Readonly<{ children: ReactNode; from: 'below' | 'above' }>) {
  const theme = useKuyaraTheme();
  const opacity = useSharedValue(0);
  const offset = useSharedValue(from === 'below' ? ARRIVAL_TRAVEL : -ARRIVAL_TRAVEL);

  useEffect(() => {
    opacity.set(withTiming(1, { duration: theme.motion.fast, easing: Easing.out(Easing.quad) }));
    offset.set(withSpring(0, theme.springs.arrival));
  }, [offset, opacity, theme.motion.fast, theme.springs.arrival]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.get(),
    transform: [{ translateY: offset.get() }],
  }));

  return <Animated.View pointerEvents="box-none" style={style}>{children}</Animated.View>;
}

const ARRIVAL_TRAVEL = 12;

const styles = StyleSheet.create({
  scrimPiece: { position: 'absolute' },
  ring: { borderWidth: borderWidths.strong, position: 'absolute' },
});
