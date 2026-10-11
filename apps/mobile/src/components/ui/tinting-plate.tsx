import { useEffect, useState } from 'react';
import type { ViewProps } from 'react-native';
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';

import { OnPlate } from '@/theme/plate-theme';
import { useKuyaraTheme } from '@/theme/theme-context';
import { fadeTo } from './fade';

export type TintingPlateProps = ViewProps & Readonly<{ color: string }>;

/**
 * A garment plate whose colour can change while it is on screen: a new sky's tint arrives as
 * effects motion on `motion.normal` (Law 7), as `ShrinkingPlate` takes its colour. Drawn at rest
 * in its colour on mount. What it holds stands on the colour it is moving to.
 */
export function TintingPlate({ color, style, ...props }: TintingPlateProps) {
  const theme = useKuyaraTheme();
  // The colour it moves from and to; a change mid-move starts from the colour it was going to.
  const [tints, setTints] = useState({ from: color, to: color });
  if (tints.to !== color) setTints({ from: tints.to, to: color });
  const progress = useSharedValue(1);

  useEffect(() => {
    if (tints.from === tints.to) return;
    progress.set(0);
    progress.set(fadeTo(1, theme.motion.normal, theme.motion));
  }, [progress, theme.motion, tints]);

  const tint = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.get(), [0, 1], [tints.from, tints.to]),
  }));

  return (
    <OnPlate color={color}>
      <Animated.View {...props} style={[style, tint]} />
    </OnPlate>
  );
}
