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
import { useKuyaraTheme } from '@/theme/theme-context';

// Counts and sizes follow the runway render. Each loop is a whole number of ambient legs:
// rain crosses the band on about one moderate leg, snow on four to six calm legs, and wisps
// and motes drift across on eight to thirteen.
const COUNT: Readonly<Record<RunwayParticleKind, number>> = { rain: 26, snow: 22, wisp: 12, mote: 12 };
// Particles start and end this far outside the band, so the loop restarts out of sight.
const EDGE = 40;

// A fixed seed: the same kind always scatters the same way, so the band never reshuffles
// on a re-render and tests see a stable layout.
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
}

type Particle = Readonly<{ x: number; y: number; size: number; phase: number; legs: number }>;

function scatter(kind: RunwayParticleKind): readonly Particle[] {
  const random = seeded(kind.length * 97 + 11);
  return Array.from({ length: COUNT[kind] }, () => ({
    x: random(),
    y: random(),
    size: random(),
    phase: random(),
    legs: random(),
  }));
}

function particleShape(kind: RunwayParticleKind, size: number): ViewStyle {
  switch (kind) {
    case 'rain': return { borderRadius: 1, height: 8 + size * 6, transform: [{ rotate: '12deg' }], width: 1.6 };
    case 'snow': return { borderRadius: 3, height: 3 + size * 2.5, width: 3 + size * 2.5 };
    case 'mote': return { borderRadius: 3, height: 3 + size * 3, width: 3 + size * 3 };
    case 'wisp': return { borderRadius: 2, height: 3, width: 16 + size * 22 };
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
  const falls = kind === 'rain' || kind === 'snow';
  const duration = kind === 'rain'
    ? theme.motion.ambient.moderate * (1 + particle.legs * 0.4)
    : kind === 'snow'
      ? theme.motion.ambient.calm * (4 + particle.legs * 2)
      : theme.motion.ambient.calm * (8 + particle.legs * 5);

  useEffect(() => {
    progress.set(withRepeat(withTiming(1, { duration, easing: Easing.linear }), -1, false));
    return () => cancelAnimation(progress);
  }, [duration, progress]);

  const travel = (falls ? height : width) + 2 * EDGE;
  const { phase } = particle;
  const animatedStyle = useAnimatedStyle(() => {
    const offset = ((progress.get() + phase) % 1) * travel - EDGE;
    return { transform: [falls ? { translateY: offset } : { translateX: offset }] };
  });
  const position: StyleProp<ViewStyle> = falls
    ? { left: particle.x * width, top: 0 }
    : { left: 0, top: particle.y * height };

  return (
    <Animated.View style={[styles.particle, position, animatedStyle]}>
      <View style={[particleShape(kind, particle.size), { backgroundColor: color }]} />
    </Animated.View>
  );
}

/**
 * The weather in the runway's board band, behind the pieces and never behind the heading or
 * the line. Flat and opaque in one colour the runway derives from its own atmosphere.
 */
export function RunwayParticles({
  kind,
  color,
  width,
  height,
  style,
}: Readonly<{ kind: RunwayParticleKind; color: string; width: number; height: number; style?: StyleProp<ViewStyle> }>) {
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
          color={color}
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
