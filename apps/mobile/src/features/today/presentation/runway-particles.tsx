import { useEffect } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import type { RunwayParticleKind } from '@/features/today/presentation/runway-palette';
import type { MotionTokens } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

// Counts, sizes and tempos follow the O1 timeline, denser than the interim runway (P1).
const COUNT: Readonly<Record<RunwayParticleKind, number>> = { rain: 46, snow: 34, wisp: 14, mote: 24 };
// Falling particles start and end this far outside the band, so the loop restarts out of sight.
const EDGE = 30;
// Rain falls on a 14 degree slant and drifts a quarter of the band sideways as it falls.
const RAIN_SLANT = 14;
const RAIN_DRIFT = 0.25;
// Snow sways up to this far either way as it falls.
const SNOW_SWAY = 30;
// Motes breathe on a short diagonal and back; wisps cross the band and start again.
const MOTE_PATH = { x: [-8, 10], y: [10, -14] } as const;
const WISP_OVERRUN = 80;

// A fixed seed: the same kind always scatters the same way, so the band never reshuffles
// on a re-render and tests see a stable layout.
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

type Particle = Readonly<{ x: number; y: number; size: number; phase: number; sway: number }>;

function scatter(kind: RunwayParticleKind): readonly Particle[] {
  const random = seeded(kind.length * 131 + 7);
  return Array.from({ length: COUNT[kind] }, () => ({
    x: random(),
    y: random(),
    size: random(),
    phase: random(),
    sway: random() - 0.5,
  }));
}

function particleShape(kind: RunwayParticleKind, size: number): ViewStyle {
  switch (kind) {
    case 'rain': return { borderRadius: 1, height: 12 + size * 10, transform: [{ rotate: `${RAIN_SLANT}deg` }], width: 2 };
    case 'snow': {
      const diameter = 3.5 + size * 3.5;
      return { borderRadius: diameter / 2, height: diameter, width: diameter };
    }
    case 'mote': {
      const diameter = 4.5 + size * 7;
      return { borderRadius: diameter / 2, height: diameter, width: diameter };
    }
    case 'wisp': return { borderRadius: 2, height: 4, width: 18 + size * 26 };
  }
}

// Each loop is a whole number of ambient legs on the tempo its weather moves at: rain on the
// intense leg, snow and the clear sky's motes on the calm one, and cloud slowest of all.
function loopDuration(kind: RunwayParticleKind, size: number, ambient: MotionTokens['ambient']): number {
  switch (kind) {
    case 'rain': return ambient.intense * (1 + size * 0.6);
    case 'snow': return ambient.calm * (10 / 3 + size * 2);
    case 'mote': return ambient.calm * (8 / 3 + size * 8 / 3);
    case 'wisp': return ambient.calm * (28 / 3 + size * 16 / 3);
  }
}

function RunwayParticle({
  kind,
  particle,
  color,
  width,
  height,
}: Readonly<{ kind: RunwayParticleKind; particle: Particle; color: string; width: number; height: number }>) {
  const theme = useKuyaraTheme();
  const progress = useSharedValue(0);
  const duration = loopDuration(kind, particle.size, theme.motion.ambient);

  useEffect(() => {
    // Motes breathe there and back on an eased leg; everything else travels one way, linear.
    const mote = kind === 'mote';
    progress.set(withRepeat(
      withTiming(1, { duration, easing: mote ? Easing.inOut(Easing.ease) : Easing.linear }),
      -1,
      mote,
    ));
    return () => cancelAnimation(progress);
  }, [duration, kind, progress]);

  const { phase, sway } = particle;
  const animatedStyle = useAnimatedStyle(() => {
    const value = kind === 'mote' ? progress.get() : (progress.get() + phase) % 1;
    switch (kind) {
      case 'rain':
        return { transform: [
          { translateX: -RAIN_DRIFT * height * value },
          { translateY: value * (height + 2 * EDGE) - EDGE },
        ] };
      case 'snow':
        return { transform: [
          { translateX: 2 * sway * SNOW_SWAY * value },
          { translateY: value * (height + 2 * EDGE) - EDGE },
        ] };
      case 'mote':
        return { transform: [
          { translateX: MOTE_PATH.x[0] + (MOTE_PATH.x[1] - MOTE_PATH.x[0]) * value },
          { translateY: MOTE_PATH.y[0] + (MOTE_PATH.y[1] - MOTE_PATH.y[0]) * value },
        ] };
      case 'wisp':
        return { transform: [{ translateX: value * (width + 2 * WISP_OVERRUN) - WISP_OVERRUN }] };
    }
  });
  const position: StyleProp<ViewStyle> = kind === 'rain' || kind === 'snow'
    ? { left: particle.x * width, top: 0 }
    : kind === 'wisp'
      ? { left: 0, top: particle.y * height }
      : { left: particle.x * width, top: particle.y * height };

  return (
    <Animated.View style={[styles.particle, position, animatedStyle]}>
      <View style={[particleShape(kind, particle.size), { backgroundColor: color }]} />
    </Animated.View>
  );
}

/**
 * The weather across the runway's board band, edge to edge and behind the pieces, never
 * behind the heading or the line. Flat and opaque in the condition's full ink (P1); a
 * sparkle colour, when given, takes two motes in three.
 */
export function RunwayParticles({
  kind,
  color,
  sparkle = null,
  width,
  height,
  style,
}: Readonly<{
  kind: RunwayParticleKind;
  color: string;
  sparkle?: string | null;
  width: number;
  height: number;
  style?: StyleProp<ViewStyle>;
}>) {
  if (width <= 0 || height <= 0) return null;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[styles.band, style]}
      testID="first-generation-particles">
      {scatter(kind).map((particle, index) => (
        <RunwayParticle
          color={sparkle !== null && index % 3 ? sparkle : color}
          height={height}
          key={index}
          kind={kind}
          particle={particle}
          width={width}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  band: { overflow: 'hidden', position: 'absolute' },
  particle: { position: 'absolute' },
});
