import { StyleSheet } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';

/**
 * The plane under the swap board's pieces. From Today's band it first stands the band's height
 * in the band's colour and settles to the board's height as it fades to the page ground; from
 * the fitted stage it has the board's height and the stage's corners.
 */
export function SwapStageTint({
  tint, arrived, fromStageColor, toColor, bandHeight, boardHeight, radius,
}: Readonly<{
  /** 0 in the band's colour, 1 on the page ground. */
  tint: SharedValue<number>;
  /** Whether the entrance has landed: from then on the tint is the board's height. */
  arrived: boolean;
  fromStageColor: string;
  toColor: string;
  /** The band's height, or null for an entrance from the fitted stage. */
  bandHeight: number | null;
  boardHeight: number;
  /** The stage's corner radius, or null for the cornerless band. */
  radius: number | null;
}>) {
  const tintStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(tint.get(), [0, 1], [fromStageColor, toColor]),
    height: bandHeight === null || arrived ? boardHeight
      : interpolate(tint.get(), [0, 1], [bandHeight, boardHeight], Extrapolation.CLAMP),
  }), [arrived, bandHeight, boardHeight, toColor, fromStageColor]);
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.tint, radius !== null && { borderRadius: radius }, tintStyle]}
    />
  );
}

const styles = StyleSheet.create({
  tint: {
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
});
