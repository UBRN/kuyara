import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { Icon } from '@/components/ui';
import type { Daypart } from '@/features/today/domain/atmosphere-state';
import {
  resolveConditionStyle,
  type ConditionGlyphShape,
} from '@/features/today/domain/condition-style';
import type { AmbientIntensity } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

const BOB_OFFSET = 2;
const GLYPH_SIZE = 32;

function useBobOffset(enabled: boolean, cycleMs: number) {
  const offset = useSharedValue(0);

  useEffect(() => {
    if (!enabled) {
      cancelAnimation(offset);
      offset.set(0);
      return;
    }

    offset.set(
      withRepeat(
        withSequence(
          withTiming(-BOB_OFFSET, { duration: cycleMs }),
          withTiming(0, { duration: cycleMs }),
        ),
        -1,
      ),
    );

    return () => cancelAnimation(offset);
  }, [cycleMs, enabled, offset]);

  return offset;
}

export function WeatherGlyph({
  condition = 'unknown',
  daypart = null,
  intensity = 'calm',
  testID = 'weather-glyph',
}: Readonly<{
  condition?: string;
  daypart?: Daypart | null;
  intensity?: AmbientIntensity;
  testID?: string;
}>) {
  const theme = useKuyaraTheme();
  const conditionStyle = resolveConditionStyle(condition, daypart);
  const isClear = conditionStyle.ink === 'clearDay' || conditionStyle.ink === 'clearNight';
  const offset = useBobOffset(
    !isClear && conditionStyle.ink !== 'neutral',
    theme.motion.ambient[intensity],
  );
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: offset.get() }],
  }));

  return (
    <View style={styles.container} testID={testID}>
      <Animated.View style={animatedStyle}>
        <Icon
          color={theme.condition[conditionStyle.ink]}
          name={conditionStyle.shape}
          size={GLYPH_SIZE}
        />
      </Animated.View>
    </View>
  );
}

// ADR 0020's closed vocabulary for the condition symbol beside Today's title: the sun turns,
// clouds drift, what comes down falls. A night sky and an unknown condition hold still.
type SymbolMotion = 'turn' | 'drift' | 'fall' | 'still';

const motionByShape: Readonly<Record<ConditionGlyphShape, SymbolMotion>> = {
  conditionClear: 'turn',
  conditionMostlyClear: 'turn',
  conditionClearNight: 'still',
  conditionMostlyClearNight: 'still',
  conditionPartlyCloudy: 'drift',
  conditionPartlyCloudyNight: 'drift',
  conditionCloudy: 'drift',
  conditionFog: 'drift',
  conditionDrizzle: 'fall',
  conditionRain: 'fall',
  conditionHeavyRain: 'fall',
  conditionSleet: 'fall',
  conditionSnow: 'fall',
  conditionThunderstorm: 'fall',
};

// Law 6: 24 points beside the 22-point title. The sun's eight rays repeat every 45 degrees,
// so one leg turns it by 45 and the restart is invisible; a drift or a fall travels about a
// point and a half and comes back.
const TITLE_SYMBOL_SIZE = 24;
const TURN_DEGREES = 45;
const DRIFT_TRAVEL = 1.3;
const FALL_TRAVEL = 1.5;

/**
 * The condition symbol inside Today's title, in its condition ink. Each leg of its loop is
 * the ambient step the condition's intensity selects, so its tempo follows the weather.
 */
export function TitleWeatherSymbol({
  condition,
  daypart,
  intensity,
  testID,
}: Readonly<{
  condition: string;
  daypart: Daypart | null;
  intensity: AmbientIntensity;
  testID?: string;
}>) {
  const theme = useKuyaraTheme();
  const conditionStyle = resolveConditionStyle(condition, daypart);
  const motion = conditionStyle.ink === 'neutral' ? 'still' : motionByShape[conditionStyle.shape];
  const legMs = theme.motion.ambient[intensity];
  const progress = useSharedValue(0);

  useEffect(() => {
    cancelAnimation(progress);
    progress.set(0);
    if (motion === 'still') return undefined;
    progress.set(motion === 'turn'
      ? withRepeat(withTiming(1, { duration: legMs, easing: Easing.linear }), -1, false)
      : withRepeat(withTiming(1, { duration: legMs }), -1, true));
    return () => cancelAnimation(progress);
  }, [legMs, motion, progress]);

  const animatedStyle = useAnimatedStyle(() => {
    const value = progress.get();
    if (motion === 'turn') return { transform: [{ rotate: `${value * TURN_DEGREES}deg` }] };
    if (motion === 'drift') return { transform: [{ translateX: value * DRIFT_TRAVEL }] };
    return { transform: [{ translateY: value * FALL_TRAVEL }] };
  });

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.titleSymbol, animatedStyle]}
      testID={testID}>
      <Icon
        color={theme.condition[conditionStyle.ink]}
        name={conditionStyle.shape}
        size={TITLE_SYMBOL_SIZE}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  titleSymbol: {
    height: TITLE_SYMBOL_SIZE,
    width: TITLE_SYMBOL_SIZE,
  },
  container: {
    alignItems: 'center',
    height: GLYPH_SIZE + BOB_OFFSET,
    justifyContent: 'center',
    width: 36,
  },
});
