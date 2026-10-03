import { createContext, use, useEffect, useMemo, useState, type ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { Entrance, fadeEasing, fadeTo, Icon, Pill } from '@/components/ui';
import { AiSparkleMark } from '@/components/ui/ai-sparkle-mark';
import { useAmbientPulse } from '@/components/ui/use-ambient-pulse';
import type { LoadedTodayPresentation } from '@/features/today/presentation/today-presentation';
import { useKuyaraTheme } from '@/theme/theme-context';

export type GenerationMode = NonNullable<LoadedTodayPresentation['generationMode']>;

// While the first-generation runway hands its outfit to Today, the words around the stage
// wait unseen; once the field has shrunk into the stage plate they arrive in reading order.
export const HandoffHoldContext = createContext(false);

/**
 * One block of Today's words in reading order. It takes part only if it was drawn while
 * the runway's hand-off was pending; anywhere else it is drawn at rest, as it always is.
 */
export function ArrivesAfterHandoff({ children, index }: Readonly<{ children: ReactNode; index: number }>) {
  const holding = use(HandoffHoldContext);
  const [arrives] = useState(holding);
  return arrives ? <Entrance index={index} waiting={holding}>{children}</Entrance> : children;
}

/**
 * The provenance badge under the title (ADR 0034 section 4, M1). Apple Intelligence: the
 * multicolor `apple.intelligence` symbol and the words on the muted neutral, never purple.
 * The Worker's AI: the multicolour animated `sparkles` (O11) on the provenance container. The
 * badge speaks one sentence; its visible words are grouped under it. Law 7: it arrives and
 * leaves as a state change, so it fades on the `normal` duration and moves nothing. A hidden
 * badge keeps its space and is out of the reading order.
 */
export function ProvenanceBadge({
  generationMode,
  hidden,
}: Readonly<{ generationMode: GenerationMode; hidden: boolean }>) {
  const theme = useKuyaraTheme();
  const opacity = useSharedValue<number>(0);
  const onDevice = generationMode.mode === 'on-device-ai';

  useEffect(() => {
    opacity.set(fadeTo(hidden ? 0 : 1, theme.motion.normal, theme.motion));
  }, [hidden, opacity, theme.motion]);

  const arrivalStyle = useAnimatedStyle(() => ({ opacity: opacity.get() }));

  return (
    <View
      accessibilityElementsHidden={hidden}
      accessibilityLabel={generationMode.accessibilityLabel}
      accessible={!hidden}
      importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}
      testID="today-provenance-badge">
      <Animated.View style={arrivalStyle}>
        <Pill
          icon={(color) => (onDevice ? (
            <Icon color={color} name="appleIntelligence" rendering="multicolor" size={16} />
          ) : (
            <AiSparkleMark color={color} size={16} />
          ))}
          label={generationMode.label}
          testID="today-generation-mode"
          tone={onDevice ? 'muted' : 'provenance'}
        />
      </Animated.View>
    </View>
  );
}

/**
 * Dims the outfit while a day-type change regenerates it (f7), on the `normal` duration. Given
 * a `revealKey`, new content arriving while still dimmed (the new outfit landing before the
 * wait has closed) lifts the dim on `fast`, with the rise's own fade, so the new outfit is
 * never seen arriving under grey.
 */
export function Dimmed({
  children,
  dimmed,
  revealKey,
  style,
}: Readonly<{ children: ReactNode; dimmed: boolean; revealKey?: string; style?: StyleProp<ViewStyle> }>) {
  const theme = useKuyaraTheme();
  // The content the dim began on; any other content under the same dim is the new arrival.
  const [dimmedKey, setDimmedKey] = useState<string | undefined>(dimmed ? revealKey : undefined);
  if (dimmed && dimmedKey === undefined && revealKey !== undefined) setDimmedKey(revealKey);
  if (!dimmed && dimmedKey !== undefined) setDimmedKey(undefined);
  const replaced = dimmed && dimmedKey !== undefined && dimmedKey !== revealKey;
  const target = dimmed && !replaced ? theme.interaction.disabledOpacity : 1;
  const duration = replaced ? theme.motion.fast : theme.motion.normal;
  const easing = useMemo(() => fadeEasing(theme.motion), [theme.motion]);
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: withTiming(target, { duration, easing }),
  }));

  return <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>;
}

// Law 6: a waiting mark, sized to the text it sits beside and drawn in the secondary icon
// ink rather than the accent, because the wait is not the screen's one accent-filled
// element. It is a clock rather than a sparkle: `visual-identity.md` refuses the AI-sparkle
// convention, and the pulsing mark is where that convention was most visible. Law 7: it
// breathes on the ambient moderate step and stays out
// of the accessibility tree because the adjacent line is the state.
export function PhaseMark({ size, testID }: Readonly<{ size: number; testID: string }>) {
  const theme = useKuyaraTheme();
  const pulse = useAmbientPulse();
  const animatedStyle = useAnimatedStyle(() => ({ opacity: pulse.get() }));

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={animatedStyle}
      testID={testID}>
      <Icon color={theme.colors.iconSecondary} name="clock" size={size} />
    </Animated.View>
  );
}
