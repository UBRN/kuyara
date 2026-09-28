import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { useKuyaraTheme } from '@/theme/theme-context';

/** Text enters once its container is this share open: container before content (Law 7). */
export const PRESENCE_TEXT_AFTER = 0.9;

export type PresenceProps = Readonly<{
  visible: boolean;
  children: ReactNode;
  testID?: string;
}>;

/**
 * A block that appears or leaves in place (Law 7): its height is spatial motion on
 * `springs.spatial`, its fade effects motion on `motion.fast`, so the content under it
 * glides instead of jumping. The two are sequenced so no line is ever cut mid-glyph: an
 * entering block opens its height and its text fades in once `PRESENCE_TEXT_AFTER` of it is
 * open; a leaving block fades its text out first and closes after. A block visible on mount
 * is drawn at rest. A hidden block is out of the reading order at once and its content
 * leaves the tree once it has collapsed.
 */
export function Presence({ visible, children, testID }: PresenceProps) {
  const theme = useKuyaraTheme();
  const { fast } = theme.motion;
  const spatial = theme.springs.spatial;
  const [shownOnMount] = useState(visible);
  const [height, setHeight] = useState<number | null>(null);
  // The content leaves the tree once a collapse has finished, and returns with the block.
  const [collapsed, setCollapsed] = useState(!visible);
  if (visible && collapsed) setCollapsed(false);
  // A block shown on mount keeps its natural height until it first leaves.
  const [moved, setMoved] = useState(false);
  if (visible !== shownOnMount && !moved) setMoved(true);
  const drawnAtRest = shownOnMount && !moved;

  const blockHeight = useSharedValue(0);
  const full = useSharedValue(0);
  const textOpacity = useSharedValue(visible ? 1 : 0);
  const wanted = useSharedValue(visible ? 1 : 0);
  const textPending = useSharedValue(0);
  const acted = useRef(shownOnMount);

  useAnimatedReaction(() => blockHeight.get(), (value) => {
    if (textPending.get() === 1 && value >= PRESENCE_TEXT_AFTER * full.get()) {
      textPending.set(0);
      textOpacity.set(withTiming(1, { duration: fast }));
    }
  }, [fast]);

  useLayoutEffect(() => {
    if (height === null) return;
    const was = acted.current;
    acted.current = visible;
    full.set(height);
    wanted.set(visible ? 1 : 0);
    if (visible) {
      if (!was) {
        // Entering: the height opens, the text follows at 90 per cent.
        textPending.set(1);
        textOpacity.set(0);
      }
      blockHeight.set(withSpring(height, spatial, (finished) => {
        if (finished && textPending.get() === 1) {
          textPending.set(0);
          textOpacity.set(withTiming(1, { duration: fast }));
        }
      }));
      return;
    }
    if (!was) return;
    // Leaving: the text goes first, then the height closes.
    textPending.set(0);
    blockHeight.set(height);
    textOpacity.set(withTiming(0, { duration: fast }, (faded) => {
      if (!faded || wanted.get() === 1) return;
      blockHeight.set(withSpring(0, spatial, (closed) => {
        if (closed && wanted.get() === 0) runOnJS(setCollapsed)(true);
      }));
    }));
  }, [blockHeight, fast, full, height, spatial, textOpacity, textPending, visible, wanted]);

  const presenceStyle = useAnimatedStyle(() => (drawnAtRest ? { opacity: 1 } : {
    height: blockHeight.get(),
    opacity: textOpacity.get(),
  }), [drawnAtRest]);

  return (
    <Animated.View
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}
      pointerEvents={visible ? 'auto' : 'none'}
      style={[styles.clip, presenceStyle]}
      testID={testID}>
      {visible || !collapsed ? (
        <View
          onLayout={({ nativeEvent }) => {
            const measured = nativeEvent.layout.height;
            // A block at rest holds its measured height, so its first leave starts from it.
            if (drawnAtRest) blockHeight.set(measured);
            if (measured !== height) setHeight(measured);
          }}
          style={drawnAtRest ? undefined : styles.measured}>
          {children}
        </View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  clip: {
    overflow: 'hidden',
  },
  measured: {
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
});
