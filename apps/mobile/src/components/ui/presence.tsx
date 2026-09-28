import { useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, withSpring, withTiming } from 'react-native-reanimated';

import { useKuyaraTheme } from '@/theme/theme-context';

export type PresenceProps = Readonly<{
  visible: boolean;
  children: ReactNode;
  testID?: string;
}>;

/**
 * A block that appears or leaves in place (Law 7): its height is spatial motion on
 * `springs.spatial`, its fade effects motion on `motion.fast`, so the content under it
 * glides instead of jumping. A block visible on mount is drawn at rest. A hidden block is
 * out of the reading order at once and its content leaves the tree once it has collapsed.
 */
export function Presence({ visible, children, testID }: PresenceProps) {
  const theme = useKuyaraTheme();
  const [shownOnMount] = useState(visible);
  const [height, setHeight] = useState<number | null>(null);
  // The content leaves the tree once a collapse has finished, and returns with the block.
  const [collapsed, setCollapsed] = useState(!visible);
  // A block shown on mount takes its first measured height without motion.
  const [animates, setAnimates] = useState(!visible);
  if (visible && collapsed) setCollapsed(false);

  useEffect(() => {
    if (visible) return undefined;
    const timer = setTimeout(() => setCollapsed(true), theme.springs.spatial.duration);
    return () => clearTimeout(timer);
  }, [theme.springs.spatial.duration, visible]);

  const drawnAtRest = height === null && shownOnMount;
  const target = visible ? height ?? 0 : 0;
  const presenceStyle = useAnimatedStyle(() => (drawnAtRest ? { opacity: 1 } : {
    height: animates ? withSpring(target, theme.springs.spatial) : target,
    opacity: animates ? withTiming(visible ? 1 : 0, { duration: theme.motion.fast }) : visible ? 1 : 0,
  }), [animates, drawnAtRest, target, theme.motion.fast, theme.springs.spatial, visible]);

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
            if (nativeEvent.layout.height === height) return;
            if (height === null && !animates) requestAnimationFrame(() => setAnimates(true));
            setHeight(nativeEvent.layout.height);
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
