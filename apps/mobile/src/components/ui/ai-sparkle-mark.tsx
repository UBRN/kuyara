import { useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { Icon } from '@/components/ui/icon';
import { useKuyaraTheme } from '@/theme/theme-context';

// O11: the Worker's "Chosen with AI" mark, V1 "confetti twinkle". The SF Symbol `sparkles` has
// one layer, so no symbol rendering can colour its stars apart: each star is drawn as its own
// layer instead. The inks are approved content colours of this mark only, never theme roles;
// each holds at least 3:1 on `provenanceContainer` in its appearance.
const sparkleInks = {
  light: ['#6A35E8', '#C4198A', '#B87300'],
  dark: ['#B69CFF', '#FF86CF', '#FFC847'],
} as const;

// Each star's centre and width as a fraction of the mark's box, measured from the `sparkles`
// glyph: large, middle, small, which is also the reading order of the appear.
const stars = [
  { cx: 0.5509, cy: 0.642, w: 0.608 },
  { cx: 0.2894, cy: 0.3711, w: 0.2978 },
  { cx: 0.4753, cy: 0.1597, w: 0.1883 },
] as const;

// A four-point star with concave sides in a -1..1 box; the round stroke softens the tips.
const starPath = 'M0 -0.95C0.04 -0.24 0.24 -0.04 0.95 0C0.24 0.04 0.04 0.24 0 0.95'
  + 'C-0.04 0.24 -0.24 0.04 -0.95 0C-0.24 -0.04 -0.04 -0.24 0 -0.95Z';

/** How often the twinkle cascade runs again after the appear. */
export const sparkleTwinkleInterval = 6000;

const twinkleScale = 1.28;
const twinkleTurn = 12;
const sine = Easing.bezier(0.37, 0, 0.63, 1);

type AiSparkleMarkProps = Readonly<{
  color: string;
  size: number;
  /** False holds the stars back until the mark is on screen, then true plays the appear. */
  play?: boolean;
  /** False plays the appear once and never twinkles: the Settings row (O11). */
  repeats?: boolean;
}>;

/**
 * The multicolour animated `sparkles` of the Worker badge (AGENTS.md, ADR 0034). On appear the
 * stars arrive largest first on the arrival spring, then a twinkle runs small, middle, large,
 * and again every six seconds. Only the views' transform and opacity move. Decorative: the
 * badge speaks for it. Android keeps the Material `auto_awesome` glyph in the badge ink.
 */
export function AiSparkleMark({ color, play = true, repeats = true, size }: AiSparkleMarkProps) {
  const theme = useKuyaraTheme();
  const [twinkle, setTwinkle] = useState(0);
  const appearEnd = theme.motion.stagger * (stars.length - 1) + theme.springs.arrival.duration;

  useEffect(() => {
    if (Platform.OS !== 'ios' || !play || !repeats) {
      return undefined;
    }
    let interval: ReturnType<typeof setInterval> | undefined;
    const next = () => setTwinkle((count) => count + 1);
    const first = setTimeout(() => {
      next();
      interval = setInterval(next, sparkleTwinkleInterval);
    }, appearEnd);

    return () => {
      clearTimeout(first);
      clearInterval(interval);
    };
  }, [appearEnd, play, repeats]);

  if (Platform.OS !== 'ios') {
    return <Icon color={color} name="sparkle" size={size} />;
  }

  const inks = sparkleInks[theme.colorScheme];
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={{ height: size, width: size }}
      testID="ai-sparkle-mark">
      {stars.map((star, index) => (
        <Star
          // The cascade runs small, middle, large: the reverse of the appear.
          cascadeIndex={stars.length - 1 - index}
          color={inks[index]}
          index={index}
          key={index}
          play={play}
          size={size}
          twinkle={twinkle}
        />
      ))}
    </View>
  );
}

function Star({
  cascadeIndex,
  color,
  index,
  play,
  size,
  twinkle,
}: Readonly<{ cascadeIndex: number; color: string; index: number; play: boolean; size: number; twinkle: number }>) {
  const theme = useKuyaraTheme();
  const scale = useSharedValue(0.6);
  const turn = useSharedValue(-90);
  const opacity = useSharedValue(0);
  const star = stars[index];
  const side = star.w * size;

  useEffect(() => {
    if (!play) {
      return undefined;
    }
    const delay = index * theme.motion.stagger;
    scale.set(withDelay(delay, withSpring(1, theme.springs.arrival)));
    turn.set(withDelay(delay, withSpring(0, theme.springs.arrival)));
    opacity.set(withDelay(delay, withTiming(1, { duration: theme.motion.normal })));

    return () => {
      cancelAnimation(scale);
      cancelAnimation(turn);
      cancelAnimation(opacity);
    };
  }, [index, opacity, play, scale, theme.motion.normal, theme.motion.stagger, theme.springs.arrival, turn]);

  useEffect(() => {
    if (twinkle === 0) {
      return;
    }
    // One ambient `intense` leg per star, half up and half down, each starting half a leg
    // after the one before it.
    const leg = theme.motion.ambient.intense;
    const half = { duration: leg / 2, easing: sine };
    const delay = cascadeIndex * (leg / 2);
    scale.set(withDelay(delay, withSequence(withTiming(twinkleScale, half), withTiming(1, half))));
    turn.set(withDelay(delay, withSequence(withTiming(twinkleTurn, half), withTiming(0, half))));
  }, [cascadeIndex, scale, theme.motion.ambient.intense, turn, twinkle]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.get(),
    transform: [{ rotate: `${turn.get()}deg` }, { scale: scale.get() }],
  }));

  return (
    <Animated.View
      style={[
        styles.star,
        { height: side, left: star.cx * size - side / 2, top: star.cy * size - side / 2, width: side },
        animatedStyle,
      ]}>
      <Svg height={side} viewBox="-1 -1 2 2" width={side}>
        <Path d={starPath} fill={color} stroke={color} strokeLinejoin="round" strokeWidth={0.1} />
      </Svg>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  star: { position: 'absolute' },
});
