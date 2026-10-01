import { useEffect, useRef, useState } from 'react';
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

type Roll = Readonly<{ from: string; to: string; up: boolean; id: number; fromWidth: number }>;

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

function RollingRow({ roll, textProps, onDone }: Readonly<{
  roll: Roll;
  textProps: Omit<AppTextProps, 'children'>;
  onDone: () => void;
}>) {
  const theme = useKuyaraTheme();
  const progress = useSharedValue(0);
  const didStart = useRef(false);

  // Once per roll: a later change mounts a new row.
  useEffect(() => {
    if (didStart.current) return;
    didStart.current = true;
    progress.set(withTiming(1, { duration: theme.motion.normal, easing: ROLL_EASING }, (finished) => {
      if (finished) scheduleOnRN(onDone);
    }));
  }, [onDone, progress, theme.motion.normal]);
  useEffect(() => () => cancelAnimation(progress), [progress]);

  // Characters are matched place by place. A value that gains or loses a character has
  // no place in common with the old one, so it rolls as one piece from where it stood.
  const sameLength = [...roll.from].length === [...roll.to].length;
  const to = sameLength ? [...roll.to] : [roll.to];
  const from = sameLength ? [...roll.from] : [roll.from];
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={styles.row}>
      {to.map((character, index) => {
        const before = from[index] ?? '';
        return before === character ? (
          <AppText {...textProps} key={index}>{character}</AppText>
        ) : (
          <RollingCell
            from={before}
            key={index}
            minWidth={sameLength ? undefined : roll.fromWidth}
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
 * once, and the unchanged ones stay. Drawn at rest on mount, so a value shown from the cache
 * never rolls. At rest it is one plain text, which also holds the layout while a roll plays
 * over it, so nothing beside or under the value moves.
 */
export function RollingText({ children: text, value, style, ...rest }: RollingTextProps) {
  const [shown, setShown] = useState({ text, value });
  const [roll, setRoll] = useState<Roll | null>(null);
  const [width, setWidth] = useState(0);
  if (shown.text !== text) {
    setShown({ text, value });
    setRoll({ from: shown.text, to: text, up: value >= shown.value, id: (roll?.id ?? 0) + 1, fromWidth: width });
  }
  // The roll draws each character at the role's own size, unshrunk.
  const textProps = { ...rest, adjustsFontSizeToFit: undefined, minimumFontScale: undefined, numberOfLines: 1 };

  return (
    <View>
      <AppText
        {...rest}
        onLayout={({ nativeEvent }) => setWidth(nativeEvent.layout.width)}
        style={[style, roll ? styles.held : null]}>
        {text}
      </AppText>
      {roll ? (
        <RollingRow
          key={roll.id}
          onDone={() => setRoll(null)}
          roll={roll}
          textProps={{ ...textProps, style }}
        />
      ) : null}
    </View>
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
  row: {
    flexDirection: 'row',
    left: 0,
    position: 'absolute',
    top: 0,
  },
});
