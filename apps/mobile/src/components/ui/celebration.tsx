import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  type SharedValue,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Path } from 'react-native-svg';

import {
  celebrationScatter,
  stitchPath,
  stitchSegments,
  type CelebrationPiece,
  type CelebrationShape,
} from '@/components/ui/celebration-scatter';
import { spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

const AnimatedPath = Animated.createAnimatedComponent(Path);

// Shares of the celebration's run: the stitch draws in the first half, and everything fades
// over the last third.
const STITCH_SHARE = 0.5;
const FADE_FROM = 0.65;
// A shape peaks this far into the run, at its rise above the plate's foot (a share of the
// plate's height), then falls back past the foot; it travels sideways up to a share of the width.
const APEX = 0.42;
const RISE = { min: 0.35, span: 0.3 } as const;
const THROW = 0.45;
const SIZE = { min: 8, span: 6 } as const;
const SPIN_DEGREES = 540;
const DASH = [5, 4];
const STITCH_WIDTH = 1.5;

function fade(progress: number): number {
  'worklet';
  return Math.min(1, Math.max(0, (1 - progress) / (1 - FADE_FROM)));
}

/** One small garment shape, filled with an outfit colour inside the plate's ink edge. */
function Shape({ shape, color, ink, size }: Readonly<{ shape: CelebrationShape; color: string; ink: string; size: number }>) {
  return (
    <Svg height={size} viewBox="0 0 12 12" width={size}>
      {shape === 'button' ? (
        <>
          <Circle cx={6} cy={6} fill={color} r={5} stroke={ink} strokeWidth={1} />
          {[[4.6, 4.6], [7.4, 4.6], [4.6, 7.4], [7.4, 7.4]].map(([cx, cy]) => (
            <Circle cx={cx} cy={cy} fill={ink} key={`${cx}-${cy}`} r={0.8} />
          ))}
        </>
      ) : shape === 'tee' ? (
        <Path d="M4 1.5 L1 3.5 L2.3 5.6 L3.4 5 V10.5 H8.6 V5 L9.7 5.6 L11 3.5 L8 1.5 C7.4 2.6 4.6 2.6 4 1.5 Z"
          fill={color} stroke={ink} strokeLinejoin="round" strokeWidth={0.8} />
      ) : shape === 'hanger' ? (
        <Path d="M6 4.6 V3.6 A1.3 1.3 0 1 0 4.7 2.3 M6 4.6 L11 9.4 H1 Z"
          fill="none" stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} />
      ) : (
        <>
          <Path d="M3.5 3 H8.5 V9 H3.5 Z" fill={color} stroke={ink} strokeWidth={0.8} />
          <Path d="M2 1.5 H10 V3 H2 Z M2 9 H10 V10.5 H2 Z" fill={ink} />
        </>
      )}
    </Svg>
  );
}

function Piece({ color, height, index, ink, piece, progress, width }: Readonly<{
  color: string; height: number; index: number; ink: string; piece: CelebrationPiece;
  progress: SharedValue<number>; width: number;
}>) {
  const side = SIZE.min + piece.size * SIZE.span;
  const rise = height * (RISE.min + piece.rise * RISE.span);
  const reach = Math.sin(piece.angle) * width * THROW;
  const spin = piece.spin * SPIN_DEGREES;
  // A thrown body under gravity: sideways at a steady speed, up to its apex and back down.
  const style = useAnimatedStyle(() => {
    const run = progress.get();
    const time = run / APEX;
    return {
      opacity: fade(run),
      transform: [
        { translateX: reach * run },
        { translateY: -rise * (2 * time - time * time) },
        { rotate: `${spin * run}deg` },
      ],
    };
  });
  return (
    <Animated.View style={[styles.piece, { left: (width - side) / 2, top: height - side }, style]}
      testID={`celebration-piece-${index}`}>
      <Shape color={color} ink={ink} shape={piece.shape} size={side} />
    </Animated.View>
  );
}

function Stitch({ height, ink, progress, radius, width }: Readonly<{
  height: number; ink: string; progress: SharedValue<number>; radius: number; width: number;
}>) {
  const corner = Math.max(0, radius - spacing.sm);
  const segments = useMemo(() => stitchSegments(width, height, spacing.sm, corner), [corner, height, width]);
  const perimeter = segments.reduce((sum, { length }) => sum + length, 0);
  const animatedProps = useAnimatedProps(() => {
    const run = progress.get();
    const drawn = Math.min(1, run / STITCH_SHARE);
    return { d: stitchPath(segments, perimeter * (1 - (1 - drawn) ** 3), corner), strokeOpacity: fade(run) };
  });
  return (
    <Svg height={height} style={StyleSheet.absoluteFill} testID="celebration-stitch" width={width}>
      <AnimatedPath animatedProps={animatedProps} fill="none" stroke={ink} strokeDasharray={DASH}
        strokeLinecap="round" strokeWidth={STITCH_WIDTH} />
    </Svg>
  );
}

function Burst({ colors, height, radius, seed, width }: Readonly<{
  colors: readonly string[]; height: number; radius: number; seed: string; width: number;
}>) {
  const theme = useKuyaraTheme();
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.set(withTiming(1, { duration: theme.motion.celebration, easing: Easing.linear }));
  }, [progress, theme.motion.celebration]);
  const ink = theme.colors.textPrimary;
  return (
    <>
      <Stitch height={height} ink={ink} progress={progress} radius={radius} width={width} />
      {celebrationScatter(seed).map((piece, index) => (
        <Piece
          color={colors.length > 0 ? colors[Math.floor(piece.color * colors.length)] : ink}
          height={height}
          index={index}
          ink={ink}
          // The scatter is fixed for the seed, so the index is the piece's identity.
          key={index}
          piece={piece}
          progress={progress}
          width={width}
        />
      ))}
    </>
  );
}

/**
 * The worn moment's celebration (ADR 0020, "A moment"), laid over a plate it fills: a dashed
 * stitch drawn once around the plate's inner edge, and one burst of small garment shapes
 * (buttons, tees, hangers, spools) in `colors`, thrown up from the plate's foot, falling and
 * fading within `motion.celebration`. It plays once each time `play` grows, and the day `seed`
 * fixes the scatter. Decorative: hidden from assistive technology, every touch passes through,
 * and the words beside it carry the state.
 */
export function Celebration({ colors, play, radius, seed, testID }: Readonly<{
  colors: readonly string[];
  play: number;
  /** The plate's corner radius; the stitch follows it, one `spacing.sm` inside. */
  radius: number;
  seed: string;
  testID?: string;
}>) {
  const theme = useKuyaraTheme();
  const [seen, setSeen] = useState(play);
  const [playing, setPlaying] = useState<number | null>(null);
  const [size, setSize] = useState<Readonly<{ width: number; height: number }> | null>(null);
  if (play !== seen) {
    setSeen(play);
    if (play > seen) setPlaying(play);
  }
  useEffect(() => {
    if (playing === null) return undefined;
    const timer = setTimeout(() => setPlaying(null), theme.motion.celebration);
    return () => clearTimeout(timer);
  }, [playing, theme.motion.celebration]);
  if (playing === null) return null;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onLayout={({ nativeEvent }) => setSize({ width: nativeEvent.layout.width, height: nativeEvent.layout.height })}
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, styles.clip, { borderRadius: radius }]}
      testID={testID}>
      {size ? (
        <Burst colors={colors} height={size.height} key={playing} radius={radius} seed={seed} width={size.width} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
  piece: { position: 'absolute' },
});
