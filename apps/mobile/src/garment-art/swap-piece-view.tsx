import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedReaction, useAnimatedStyle, withTiming, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { useKuyaraTheme } from '@/theme/theme-context';

import { fadeEasing } from '@/components/ui/fade';
import { PieceArtwork, type PieceShadow } from './garment-board';
import { SWAP_HANDOFF_AFTER } from './swap-gesture';
import { lerpBox } from './swap-layout';
import { SETTLE_TRAVEL } from './swap-motion';
import type { Box, Instance } from './swap-reconcile';

/**
 * One piece on the swap board: its resting drawing, the old colours draining off over it, and
 * while it is enlarged a crisp big drawing. The view stands at the stage's origin and its
 * piece's shared values alone place it.
 */
export function SwapPieceView({
  instance, ink, outline, shadow, settleTravel, stageWidth, stageLimit, clip, onBigDone, testID,
}: Readonly<{
  instance: Instance;
  ink: string;
  outline?: number;
  shadow: PieceShadow;
  settleTravel: SharedValue<number>;
  stageWidth: number;
  stageLimit: SharedValue<number>;
  /** The paging window this piece is clipped to, in stage points, or null. */
  clip: Box | null;
  onBigDone: (key: string) => void;
  testID: string;
}>) {
  const theme = useKuyaraTheme();
  const fadeEase = useMemo(() => fadeEasing(theme.motion), [theme.motion]);
  const { base, values, big, key } = instance;
  const { from, to, p, dx, dy, op, sc, drain, hand, handFrom, handTo } = values;
  const fast = theme.motion.fast;
  const pieceStyle = useAnimatedStyle(() => {
    const box = lerpBox(from.get(), to.get(), p.get());
    const scale = sc.get();
    const w = box.w * scale;
    const h = box.h * scale;
    let centreX = box.x + box.w / 2;
    let centreY = box.y + box.h / 2;
    if (scale > 1) {
      // Grown about its centre, then shifted just enough to stay on the held stage.
      centreX = Math.min(Math.max(centreX - w / 2, 0), stageWidth - w) + w / 2;
      centreY = Math.min(Math.max(centreY - h / 2, 0), stageLimit.get() - h) + h / 2;
    }
    // The view stands at the stage's origin and the transform alone places it, so a re-layout
    // that only moves the piece changes nothing React draws: no frame shows the new place
    // before the motion that travels there.
    return {
      opacity: op.get(),
      transform: [
        { translateX: centreX + dx.get() - base.w / 2 },
        { translateY: centreY - base.h / 2 + SETTLE_TRAVEL * settleTravel.get() + dy.get() },
        { scaleX: w / base.w },
        { scaleY: h / base.h },
      ],
    };
  }, [base.h, base.w, stageWidth]);
  const drainStyle = useAnimatedStyle(() => ({ opacity: drain.get() }));
  // The resting drawing hides once the big one is fully over it, so no two outlines show.
  const restStyle = useAnimatedStyle(() => ({ opacity: big !== null && hand.get() >= 1 ? 0 : 1 }), [big]);
  const bigStyle = useAnimatedStyle(() => ({ opacity: hand.get() }));
  // A shrinking piece hands back to its resting drawing once its scale is a quarter of the way.
  useAnimatedReaction(() => sc.get(), (scale) => {
    const target = handTo.get();
    if (Number.isNaN(target)) return;
    const start = handFrom.get();
    if (start === target || (scale - start) / (target - start) >= SWAP_HANDOFF_AFTER) {
      handTo.set(Number.NaN);
      hand.set(withTiming(0, { duration: fast, easing: fadeEase }, (finished) => {
        if (finished) scheduleOnRN(onBigDone, key);
      }));
    }
  }, [fadeEase, fast, key, onBigDone]);

  return (
    <View
      pointerEvents="none"
      style={clip ? [styles.clip, { height: clip.h, left: clip.x, top: clip.y, width: clip.w }] : styles.free}
      testID={testID}>
      <View style={clip ? [styles.free, { left: -clip.x, top: -clip.y }] : styles.free}>
        <Animated.View style={[styles.piece, styles.origin, { height: base.h, width: base.w }, pieceStyle]}>
          <Animated.View style={[StyleSheet.absoluteFill, restStyle]}>
            <PieceArtwork height={base.h} ink={ink} outline={outline} piece={instance.piece} roles={instance.roles}
              shadow={shadow} width={base.w} />
            {instance.drainRoles ? (
              // The ADR 0026 section 7 technique: the old colours drain off over the new. The
              // shadow under them is the resting drawing's, so it does not darken twice.
              <Animated.View style={[StyleSheet.absoluteFill, drainStyle]}>
                <PieceArtwork height={base.h} ink={ink} outline={outline} piece={instance.piece}
                  roles={instance.drainRoles} width={base.w} />
              </Animated.View>
            ) : null}
          </Animated.View>
          {big !== null ? (
            // Drawn once at the grow size and mapped back by a static 1 / G, so the enlarged
            // piece shows a crisp 1.9-point outline instead of an upscaled one.
            <Animated.View
              style={[styles.piece, {
                height: base.h * big,
                left: (base.w - base.w * big) / 2,
                top: (base.h - base.h * big) / 2,
                transform: [{ scale: 1 / big }],
                width: base.w * big,
              }, bigStyle]}
              testID={`${testID}-big`}>
              <PieceArtwork height={base.h * big} ink={ink} outline={outline} piece={instance.piece}
                roles={instance.roles} shadow={{
                  ...shadow,
                  dx: shadow.dx * big,
                  dy: shadow.dy * big,
                  blur: shadow.blur * big,
                  margin: shadow.margin * big,
                }} width={base.w * big} />
            </Animated.View>
          ) : null}
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  clip: {
    overflow: 'hidden',
    position: 'absolute',
  },
  // Spans its parent: React Native reuses a closed screen's native view for a new one and skips
  // writing a zero-size frame at the origin, so a zero-size wrapper keeps its earlier position.
  free: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  origin: {
    left: 0,
    top: 0,
  },
  piece: {
    position: 'absolute',
  },
});
