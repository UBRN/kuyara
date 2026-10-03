import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { useKuyaraTheme } from '@/theme/theme-context';
import { FadeIn, fadeTo } from './fade';

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
type Size = Readonly<{ width: number; height: number }>;

/**
 * Leaving content: whole in its first frame, gone on `fast`, then out of the tree. It keeps the
 * size it had on screen, pinned to the top left, so it never re-wraps or truncates to the box of
 * the content replacing it; the container still follows the new content.
 */
function FadeOut({ id, onDone, size, children }: Readonly<{
  id: number;
  onDone: (id: number) => void;
  size: Size | null;
  children: ReactNode;
}>) {
  const theme = useKuyaraTheme();
  const opacity = useSharedValue(1);
  useEffect(() => {
    opacity.set(fadeTo(0, theme.motion.fast, theme.motion, (finished) => {
      'worklet';
      if (finished) scheduleOnRN(onDone, id);
    }));
  }, [id, onDone, opacity, theme.motion]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[styles.leaving, size, style]}
      testID="crossfade-leaving">
      {children}
    </Animated.View>
  );
}

type Layers = Readonly<{
  key: string;
  shown: ReactNode;
  leaving: ReactNode;
  leavingSize: Size | null;
  /** Which leaving layer this is: it advances only when content starts leaving, so a change
   *  that lands mid-fade lets the layer already leaving carry on instead of restarting it. */
  leavingId: number;
  changes: number;
}>;

/**
 * Content that changes in place (Law 7, a state change on something already on screen): the
 * old content leaves on `fast`, and the new arrives on `normal` once it has gone, so the two
 * never double-expose. Each change mounts both layers afresh, so the new content's first
 * frame is transparent and the old one's is whole. Content there on mount is drawn at rest, and the same key re-renders in place. The
 * leaving layer is out of the reading order and takes no touch, so a screen reader meets
 * only the new content.
 */
export function Crossfade({ contentKey, children, style, testID }: CrossfadeProps) {
  const theme = useKuyaraTheme();
  const [layers, setLayers] = useState<Layers>({
    key: contentKey, shown: children, leaving: null, leavingSize: null, leavingId: 0, changes: 0,
  });
  // The size the shown content last laid out at, handed to it when it becomes the leaving layer.
  const [shownSize, setShownSize] = useState<Size | null>(null);
  // The leaving layer is what was last on screen, so the latest content is kept for it. When a
  // change lands while another is still fading, the shown content never faded in (it is still
  // in its delay): the layer already leaving stays, and the shown content is dropped unseen.
  if (layers.key !== contentKey) {
    const midFade = layers.leaving !== null;
    setLayers({
      key: contentKey,
      shown: children,
      leaving: midFade ? layers.leaving : layers.shown,
      leavingSize: midFade ? layers.leavingSize : shownSize,
      leavingId: midFade ? layers.leavingId : layers.leavingId + 1,
      changes: layers.changes + 1,
    });
  } else if (layers.shown !== children) {
    setLayers({ ...layers, shown: children });
  }
  // A fade's end clears only its own layer: one arriving after a newer fade began is stale.
  const clearLeaving = useCallback((id: number) => setLayers((value) => (
    value.leavingId === id ? { ...value, leaving: null, leavingSize: null } : value
  )), []);
  const measureShown = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setShownSize((value) => (value?.width === width && value.height === height ? value : { width, height }));
  }, []);

  return (
    <View style={style} testID={testID}>
      <FadeIn animate={layers.changes > 0} delay={theme.motion.fast} duration={theme.motion.normal} key={`in-${layers.changes}`} onLayout={measureShown} pointerEvents="box-none">
        {children}
      </FadeIn>
      {layers.leaving !== null ? (
        <FadeOut id={layers.leavingId} key={`out-${layers.leavingId}`} onDone={clearLeaving} size={layers.leavingSize}>
          {layers.leaving}
        </FadeOut>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  leaving: { position: 'absolute', top: 0, left: 0 },
});
