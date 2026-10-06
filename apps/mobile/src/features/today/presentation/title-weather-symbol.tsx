import { StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';

import { Icon } from '@/components/ui';
import { useConditionSymbolMotion } from '@/components/ui/use-condition-symbol-motion';
import type { Daypart } from '@/features/weather/domain/atmosphere-state';
import { resolveConditionStyle } from '@/features/weather/domain/condition-style';
import type { AmbientIntensity } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

// Law 6: 24 points beside the 22-point title.
const TITLE_SYMBOL_SIZE = 24;

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
  const animatedStyle = useConditionSymbolMotion(conditionStyle, theme.motion.ambient[intensity]);

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
});
