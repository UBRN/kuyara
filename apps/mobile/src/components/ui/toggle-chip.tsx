import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { Icon, type IconName } from '@/components/ui/icon';
import { PressScale } from '@/components/ui/press-scale';
import { useTextScaling } from '@/components/ui/use-text-scaling';
import { borderWidths, layout, radii, spacing } from '@/theme/theme';
import { easierToSee, useEasierToSee, useStrongEdge } from '@/theme/easier-to-see';
import { useKuyaraTheme } from '@/theme/theme-context';

// Law 6: 20 beside body text for the round button's lone glyph, 16 for the check beside a label.
const ROUND_GLYPH_SIZE = 20;
const CHECK_GLYPH_SIZE = 16;

export type ToggleChipProps = Readonly<{
  selected: boolean;
  onPress: () => void;
  testID?: string;
}> & (
  /** A 44-point round button: the outline glyph at rest, its filled form when selected. */
  | Readonly<{ icon: IconName; selectedIcon: IconName; accessibilityLabel: string; label?: never }>
  /** A capsule with a visible label, which is also its name; selected, a check stands before it. */
  | Readonly<{ label: string; icon?: never; selectedIcon?: never; accessibilityLabel?: never }>
);

/**
 * An outlined control that keeps one choice on or off: the `borderDefined` edge at rest and
 * the neutral interactive surface when selected, never the accent, so it never spends the
 * screen's one accent fill. The state is said three ways: the fill, the glyph's fill or the
 * check, and the selected trait. No haptic (Law 8).
 */
export function ToggleChip(props: ToggleChipProps) {
  const { onPress, selected, testID } = props;
  const theme = useKuyaraTheme();
  const { controlScale } = useTextScaling();
  const large = useEasierToSee();
  const strongEdge = useStrongEdge();
  const [isFocused, setIsFocused] = useState(false);
  const round = props.label === undefined;

  return (
    <PressScale
      accessibilityLabel={props.label ?? props.accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onBlur={() => setIsFocused(false)}
      onFocus={() => setIsFocused(true)}
      onPress={onPress}
      style={({ pressed }) => [
        round ? styles.round : styles.chip,
        !round && large ? { minHeight: easierToSee.chipHeight } : null,
        {
          backgroundColor: pressed
            ? theme.colors.surfaceInteractivePressed
            : selected ? theme.colors.surfaceInteractive : 'transparent',
          borderColor: strongEdge?.borderColor ?? theme.colors.borderDefined,
        },
        strongEdge ? { borderWidth: strongEdge.borderWidth } : null,
        isFocused && { outlineColor: theme.colors.focusRing },
      ]}
      testID={testID}>
      {props.label === undefined ? (
        <Icon
          color={theme.colors.iconPrimary}
          name={selected ? props.selectedIcon : props.icon}
          size={ROUND_GLYPH_SIZE}
        />
      ) : (
        <>
          {selected ? <Icon color={theme.colors.iconPrimary} name="check" size={CHECK_GLYPH_SIZE * controlScale} /> : null}
          <AppText variant="label">{props.label}</AppText>
        </>
      )}
    </PressScale>
  );
}

const focusRing = {
  outlineColor: 'transparent',
  outlineOffset: borderWidths.strong,
  outlineStyle: 'solid',
  outlineWidth: borderWidths.strong,
} as const;

const styles = StyleSheet.create({
  round: {
    ...focusRing,
    width: layout.minimumTouchTarget,
    height: layout.minimumTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
    borderWidth: borderWidths.subtle,
  },
  chip: {
    ...focusRing,
    minHeight: layout.minimumTouchTarget,
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
    borderRadius: radii.pill,
    borderWidth: borderWidths.subtle,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
});
