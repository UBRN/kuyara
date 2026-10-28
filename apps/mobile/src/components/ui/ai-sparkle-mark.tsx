import { useCallback, useEffect, useMemo, useState } from 'react';
import { Animated, Easing, Platform, StyleSheet, View } from 'react-native';
import Reanimated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { Icon } from '@/components/ui/icon';
import { fadeTo } from '@/components/ui/fade';
import { thereAndBack } from '@/components/ui/there-and-back';
import { useWhileVisible } from '@/components/ui/use-screen-visible';
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
// One ambient `intense` leg, half up and half down on the sine ease, played as one native timing.
const twinkleLeg = thereAndBack(Easing.bezier(0.37, 0, 0.63, 1));

/** A star's twinkle inside one interval: still until `start`, one leg there and back, still. */
function twinkleWithin(start: number, leg: number) {
  return (t: number) => {
    const progress = (t * sparkleTwinkleInterval - start) / leg;
    return progress > 0 && progress < 1 ? twinkleLeg(progress) : 0;
  };
}

type AiSparkleMarkProps = Readonly<{
  color: string;
  size: number;
  /** False holds the stars back until the mark is on screen, then true plays the appear. */
  play?: boolean;
  /** False plays the appear once and never twinkles: the Settings row (O11). */
  repeats?: boolean;
}>;

/**
 * The multicolour animated `sparkles` of the Worker badge (ADR 0034). On appear the
 * stars arrive largest first on the arrival spring, then a twinkle runs small, middle, large,
 * and again every six seconds while its screen is in front; each return to it starts that
 * cycle over. Only the views' transform and opacity move. Decorative: the
 * badge speaks for it. Android keeps the Material `auto_awesome` glyph in the badge ink.
 */
export function AiSparkleMark({ color, play = true, repeats = true, size }: AiSparkleMarkProps) {
  const theme = useKuyaraTheme();
  const [twinkles] = useState(() => stars.map(() => new Animated.Value(0)));
  const appearEnd = theme.motion.stagger * (stars.length - 1) + theme.springs.arrival.duration;
  const leg = theme.motion.ambient.intense;

  // The twinkle runs on the native driver, so no frame of it commits the shadow tree: one leg
  // per star, each starting half a leg after the one before it, small, middle, large, the
  // reverse of the appear.
  useWhileVisible(useCallback(() => {
    if (Platform.OS !== 'ios' || !play || !repeats) return undefined;
    const loops = twinkles.map((progress, index) => Animated.loop(Animated.timing(progress, {
      delay: appearEnd,
      duration: sparkleTwinkleInterval,
      easing: twinkleWithin((stars.length - 1 - index) * (leg / 2), leg),
      toValue: 1,
      useNativeDriver: true,
    })));
    loops.forEach((loop) => loop.start());
    return () => {
      loops.forEach((loop) => loop.stop());
      twinkles.forEach((progress) => progress.setValue(0));
    };
  }, [appearEnd, leg, play, repeats, twinkles]));

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
        <Star color={inks[index]} index={index} key={index} play={play} size={size} twinkle={twinkles[index]} />
      ))}
    </View>
  );
}

function Star({
  color,
  index,
  play,
  size,
  twinkle,
}: Readonly<{ color: string; index: number; play: boolean; size: number; twinkle: Animated.Value }>) {
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
    opacity.set(withDelay(delay, fadeTo(1, theme.motion.normal, theme.motion)));

    return () => {
      cancelAnimation(scale);
      cancelAnimation(turn);
      cancelAnimation(opacity);
    };
  }, [index, opacity, play, scale, theme.motion, theme.springs.arrival, turn]);

  // The twinkle turns and scales a wrapper about the same centre, so it composes with the
  // appear exactly as one transform would: turns add and uniform scales multiply.
  const twinkleStyle = useMemo(() => ({
    transform: [
      { rotate: twinkle.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${twinkleTurn}deg`] }) },
      { scale: twinkle.interpolate({ inputRange: [0, 1], outputRange: [1, twinkleScale] }) },
    ],
  }), [twinkle]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.get(),
    transform: [{ rotate: `${turn.get()}deg` }, { scale: scale.get() }],
  }));

  return (
    <Animated.View
      style={[
        styles.star,
        { height: side, left: star.cx * size - side / 2, top: star.cy * size - side / 2, width: side },
        twinkleStyle,
      ]}>
      <Reanimated.View style={[{ height: side, width: side }, animatedStyle]}>
        <Svg height={side} viewBox="-1 -1 2 2" width={side}>
          <Path d={starPath} fill={color} stroke={color} strokeLinejoin="round" strokeWidth={0.1} />
        </Svg>
      </Reanimated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  star: { position: 'absolute' },
});
