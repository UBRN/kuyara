import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { useKuyaraTheme } from '@/theme/theme-context';

export type CrossfadeProps = Readonly<{
  /** What the content says. A new key replaces the content with a crossfade. */
  contentKey: string;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}>;

/**
 * Content that fades in when it replaces other content (effects motion), still on mount. It
 * waits until the leaving content is gone, so two lines of text are never drawn over each other.
 */
function FadeIn({ animate, children }: Readonly<{ animate: boolean; children: ReactNode }>) {
  const theme = useKuyaraTheme();
  const opacity = useSharedValue(animate ? 0 : 1);
  useEffect(() => {
    if (!animate) return;
    opacity.set(withDelay(theme.motion.fast, withTiming(1, { duration: theme.motion.normal })));
  }, [animate, opacity, theme.motion.fast, theme.motion.normal]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  return <Animated.View pointerEvents="box-none" style={style}>{children}</Animated.View>;
}

/** Leaving content: whole in its first frame, gone on `fast`, then out of the tree. */
function FadeOut({ onDone, children }: Readonly<{ onDone: () => void; children: ReactNode }>) {
  const theme = useKuyaraTheme();
  const opacity = useSharedValue(1);
  useEffect(() => {
    opacity.set(withTiming(0, { duration: theme.motion.fast }, (finished) => {
      if (finished) scheduleOnRN(onDone);
    }));
  }, [onDone, opacity, theme.motion.fast]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, style]}>
      {children}
    </Animated.View>
  );
}

type Layers = Readonly<{ key: string; shown: ReactNode; leaving: ReactNode; changes: number }>;

/**
 * Content that changes in place (Law 7, a state change on something already on screen): the
 * old content leaves on `fast`, and the new arrives on `normal` once it has gone, so the two
 * never double-expose. Each change mounts both layers afresh, so the new content's first
 * frame is transparent and the old one's is whole. Content there on mount is drawn at rest, and the same key re-renders in place. The
 * leaving layer is out of the reading order and takes no touch, so a screen reader meets
 * only the new content.
 */
export function Crossfade({ contentKey, children, style, testID }: CrossfadeProps) {
  const [layers, setLayers] = useState<Layers>({ key: contentKey, shown: children, leaving: null, changes: 0 });
  // The leaving layer is what was last on screen, so the latest content is kept for it.
  if (layers.key !== contentKey) {
    setLayers({ key: contentKey, shown: children, leaving: layers.shown, changes: layers.changes + 1 });
  } else if (layers.shown !== children) {
    setLayers({ ...layers, shown: children });
  }
  const clearLeaving = useCallback(() => setLayers((value) => ({ ...value, leaving: null })), []);

  return (
    <View style={style} testID={testID}>
      <FadeIn animate={layers.changes > 0} key={`in-${layers.changes}`}>{children}</FadeIn>
      {layers.leaving !== null ? (
        <FadeOut key={`out-${layers.changes}`} onDone={clearLeaving}>{layers.leaving}</FadeOut>
      ) : null}
    </View>
  );
}
