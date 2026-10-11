import { useEffect, useRef } from 'react';
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
  // The drawn colour lives on the UI thread only: a new colour changes nothing until the effect
  // sets where it moves from and to together with the start, so no frame shows the new colour
  // before the move begins.
  const from = useSharedValue(color);
  const to = useSharedValue(color);
  const progress = useSharedValue(1);
  const previous = useRef(color);

  useEffect(() => {
    if (previous.current === color) return;
    from.set(previous.current);
    to.set(color);
    previous.current = color;
    progress.set(0);
    progress.set(fadeTo(1, theme.motion.normal, theme.motion));
  }, [color, from, progress, theme.motion, to]);

  const tint = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.get(), [0, 1], [from.get(), to.get()]),
  }));

  return (
    <OnPlate color={color}>
      <Animated.View {...props} style={[style, tint]} />
    </OnPlate>
  );
}
