import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { AppText, type AppTextProps } from './app-text';
import { useKuyaraTheme } from '@/theme/theme-context';

// The roll ends the way a counter wheel stops: quickly at first, settling into place.
const ROLL_EASING = Easing.bezier(0.23, 1, 0.32, 1);

export type RollingTextProps = Omit<AppTextProps, 'children'> & Readonly<{
  children: string;
  /** The number the text shows: a rise rolls the changed characters up, a fall down. */
  value: number;
}>;

type Shown = Readonly<{ text: string; value: number; id: number }>;
/** A change waiting for its new text to be measured, so the roll starts knowing both widths. */
type Pending = Readonly<{
  from: string;
  to: string;
  toValue: number;
  up: boolean;
  id: number;
  /** The old text's width with nothing constraining it. */
  fromNatural: number;
  /** The width the old text took on screen: smaller than natural when it shrank to fit. */
  fromFitted: number;
}>;
type Roll = Pending & Readonly<{ toNatural: number }>;

/** The scale the old text was drawn at: below 1 when it shrank to fit its line. */
export function rollScale(roll: Pick<Roll, 'fromNatural' | 'fromFitted'>): number {
  return roll.fromNatural > 0 ? Math.min(roll.fromFitted / roll.fromNatural, 1) : 1;
}

/**
 * How far the value's footprint is from its new width when the roll starts: the space it
 * still holds (or still lacks) for what sits beside it, closed as the roll plays.
 */
export function rollFootprintGap(roll: Roll): number {
  return roll.fromFitted - roll.toNatural * rollScale(roll);
}

/** One character cell whose character changed: the old one leaves as the new one arrives. */
function RollingCell({ from, to, up, progress, textProps, minWidth }: Readonly<{
  from: string;
  to: string;
  up: boolean;
  /** At least as wide as the leaving text, so a longer old value is never cut short. */
  minWidth?: number;
  progress: SharedValue<number>;
  textProps: Omit<AppTextProps, 'children'>;
}>) {
  const height = useSharedValue(0);
  const travel = up ? -1 : 1;
  const leaving = useAnimatedStyle(() => ({
    opacity: 1 - progress.get(),
    transform: [{ translateY: travel * height.get() * progress.get() }],
  }));
  const arriving = useAnimatedStyle(() => ({
    opacity: progress.get(),
    transform: [{ translateY: -travel * height.get() * (1 - progress.get()) }],
  }));

  return (
    <View onLayout={({ nativeEvent }) => height.set(nativeEvent.layout.height)} style={[styles.cell, { minWidth }]}>
      {/* The arriving character sizes the cell; the leaving one is laid over it. */}
      <Animated.View style={arriving}>
        <AppText {...textProps}>{to}</AppText>
      </Animated.View>
      <Animated.View style={[styles.layer, leaving]}>
        <AppText {...textProps}>{from}</AppText>
      </Animated.View>
    </View>
  );
}

function RollingRow({ roll, progress, textProps }: Readonly<{
  roll: Roll;
  progress: SharedValue<number>;
  textProps: Omit<AppTextProps, 'children'>;
}>) {
  // Characters are matched place by place. A value that gains or loses a character has
  // no place in common with the old one, so it rolls as one piece from where it stood.
  const sameLength = [...roll.from].length === [...roll.to].length;
  const to = sameLength ? [...roll.to] : [roll.to];
  const from = sameLength ? [...roll.from] : [roll.from];
  const scale = rollScale(roll);
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      // A value that shrank to fit its line rolls at the size it was drawn at.
      style={[styles.row, scale < 1 && { transform: [{ scale }], transformOrigin: 'left top' }]}
      testID="rolling-text-roll">
      {to.map((character, index) => {
        const before = from[index] ?? '';
        return before === character ? (
          <AppText {...textProps} key={index}>{character}</AppText>
        ) : (
          <RollingCell
            from={before}
            key={index}
            minWidth={sameLength ? undefined : roll.fromNatural}
            progress={progress}
            textProps={textProps}
            to={character}
            up={roll.up}
          />
        );
      })}
    </View>
  );
}

/**
 * A value that rolls when it changes (Law 7, a state change on something already on
 * screen): only the characters that changed travel one line up or down on `motion.normal`,
 * once, and the unchanged ones stay. The new text is measured first, and the value's
 * footprint then eases from the old width to the new one with the roll, so what sits
 * beside it moves with it and is never drawn over. Drawn at rest on mount, so a value
 * shown from the cache never rolls. At rest it is one plain text, which the screen reader
 * meets and which holds the layout while a roll plays over it.
 */
export function RollingText({ children: text, value, style, ...rest }: RollingTextProps) {
  const theme = useKuyaraTheme();
  const [shown, setShown] = useState<Shown>({ text, value, id: 0 });
  const [pending, setPending] = useState<Pending | null>(null);
  const [roll, setRoll] = useState<Roll | null>(null);
  const [natural, setNatural] = useState(0);
  const [fitted, setFitted] = useState(0);
  if (text !== shown.text && pending?.to !== text) {
    setPending({
      from: shown.text, to: text, toValue: value, up: value >= shown.value, id: shown.id + 1,
      fromNatural: natural, fromFitted: fitted,
    });
  } else if (text === shown.text && pending !== null) {
    setPending(null);
  }

  const measured = (width: number) => {
    if (pending !== null && pending.to === text) {
      setRoll({ ...pending, toNatural: width });
      setShown({ text: pending.to, value: pending.toValue, id: pending.id });
      setPending(null);
    }
    setNatural(width);
  };

  // One effect per roll that cancels on cleanup and starts from the top on setup, so a
  // re-run (a remount in development) replays the roll instead of leaving it held.
  const progress = useSharedValue(0);
  const rollId = roll?.id ?? 0;
  const { normal } = theme.motion;
  useEffect(() => {
    if (rollId === 0) return;
    const finish = (id: number) => setRoll((current) => (current?.id === id ? null : current));
    progress.set(0);
    progress.set(withTiming(1, { duration: normal, easing: ROLL_EASING }, (finished) => {
      if (finished) scheduleOnRN(finish, rollId);
    }));
    return () => cancelAnimation(progress);
  }, [normal, progress, rollId]);

  const gap = roll === null ? 0 : rollFootprintGap(roll);
  const footprint = useAnimatedStyle(() => ({ marginRight: gap * (1 - progress.get()) }), [gap]);

  // The roll draws each character at the role's own size; a fitted value is scaled whole.
  const textProps = { ...rest, adjustsFontSizeToFit: undefined, minimumFontScale: undefined, numberOfLines: 1 };

  return (
    <Animated.View style={footprint}>
      <AppText
        {...rest}
        onLayout={({ nativeEvent }) => setFitted(nativeEvent.layout.width)}
        style={[style, roll ? styles.held : null]}>
        {shown.text}
      </AppText>
      {roll ? <RollingRow key={roll.id} progress={progress} roll={roll} textProps={{ ...textProps, style }} /> : null}
      {/* Measures the latest text at its own width, out of sight and out of the reading order. */}
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
        style={styles.measure}>
        <AppText
          {...textProps}
          key={text}
          onLayout={({ nativeEvent }) => measured(nativeEvent.layout.width)}
          style={[style, styles.measured]}
          testID="rolling-text-measure">
          {text}
        </AppText>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  cell: {
    overflow: 'hidden',
  },
  held: {
    opacity: 0,
  },
  layer: {
    left: 0,
    position: 'absolute',
    top: 0,
  },
  measure: {
    height: 0,
    left: 0,
    overflow: 'hidden',
    position: 'absolute',
    top: 0,
    width: 10000,
  },
  measured: {
    alignSelf: 'flex-start',
  },
  row: {
    flexDirection: 'row',
    left: 0,
    position: 'absolute',
    top: 0,
  },
});
