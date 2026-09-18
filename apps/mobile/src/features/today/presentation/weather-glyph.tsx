import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { Icon } from '@/components/ui';
import type { Daypart } from '@/features/today/domain/atmosphere-state';
import { resolveConditionStyle } from '@/features/today/domain/condition-style';
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
    !theme.isReduceMotionEnabled && !isClear && conditionStyle.ink !== 'neutral',
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

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    height: GLYPH_SIZE + BOB_OFFSET,
    justifyContent: 'center',
    width: 36,
  },
});
