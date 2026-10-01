import { useState, type ReactNode } from 'react';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

// Law 7's scroll depth: a header with no native large title recedes behind the content
// scrolling over it, the way a large title gives way. It travels at a quarter of the scroll's
// speed, so the content passes over it, and shrinks by the press scale's step while it fades.
// The values live here so no feature file authors a motion value.
export const DEPTH_TRAVEL = 0.25;
export const DEPTH_SCALE = 0.97;

export type ScrollDepthProps = Readonly<{
  children: ReactNode;
  /** The scroll view's offset, from `useScrollOffset`. */
  scrollOffset: SharedValue<number>;
}>;

/**
 * Follows the scroll on the UI thread, with no timing of its own: the finger drives it and a
 * scroll back returns it exactly. It recedes over its own height, and a pull past the top
 * leaves it at rest. It adds no accessibility node.
 */
export function ScrollDepth({ children, scrollOffset }: ScrollDepthProps) {
  const [height, setHeight] = useState(0);
  const style = useAnimatedStyle(() => {
    // Held once it has receded, so it never trails into the content it gave way to.
    const scrolled = Math.min(Math.max(scrollOffset.get(), 0), height);
    const share = height > 0 ? scrolled / height : 0;
    return {
      opacity: 1 - share,
      transform: [
        { translateY: scrolled * DEPTH_TRAVEL },
        { scale: 1 - (1 - DEPTH_SCALE) * share },
      ],
    };
  }, [height]);

  return (
    <Animated.View onLayout={({ nativeEvent }) => setHeight(nativeEvent.layout.height)} style={style}>
      {children}
    </Animated.View>
  );
}
