import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Icon } from '@/components/ui';
import { useConditionSymbolMotion } from '@/components/ui/use-condition-symbol-motion';
import type { Daypart } from '@/features/weather/domain/atmosphere-state';
import { conditionSymbolMotion, resolveConditionStyle } from '@/features/weather/domain/condition-style';
import type { AmbientIntensity } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

const GLYPH_SIZE = 32;

/**
 * The condition symbol beside Weather's current reading. It moves in the same closed
 * vocabulary as Today's (ADR 0020), so one sky moves one way on both tabs.
 */
export function WeatherGlyph({
  condition = 'unknown',
  daypart = null,
  intensity = 'calm',
}: Readonly<{
  condition?: string;
  daypart?: Daypart | null;
  intensity?: AmbientIntensity;
}>) {
  const theme = useKuyaraTheme();
  const conditionStyle = resolveConditionStyle(condition, daypart);
  const animatedStyle = useConditionSymbolMotion(conditionSymbolMotion(conditionStyle), theme.motion.ambient[intensity]);

  return (
    <View style={styles.container} testID="weather-glyph">
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
    height: GLYPH_SIZE,
    justifyContent: 'center',
    width: 36,
  },
});
