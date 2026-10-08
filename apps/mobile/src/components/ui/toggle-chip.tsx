import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { Icon } from '@/components/ui/icon';
import { PressScale } from '@/components/ui/press-scale';
import { useTextScaling } from '@/components/ui/use-text-scaling';
import { borderWidths, layout, radii, spacing } from '@/theme/theme';
import { easierToSee, useEasierToSee, useStrongEdge } from '@/theme/easier-to-see';
import { useKuyaraTheme } from '@/theme/theme-context';

// Law 6: 16 for the check beside a label.
const CHECK_GLYPH_SIZE = 16;

export type ToggleChipProps = Readonly<{
  label: string;
  selected: boolean;
  onPress: () => void;
  testID?: string;
}>;

/**
 * A capsule with a visible label, which is also its name, that keeps one choice on or off: the
 * `borderDefined` edge at rest and the neutral interactive surface when selected, never the
 * accent, so it never spends the screen's one accent fill. The state is said three ways: the
 * fill, the check that stands before the label, and the selected trait. No haptic (Law 8).
 * The icon-only form is `IconButton` with `selected`.
 */
export function ToggleChip({ label, onPress, selected, testID }: ToggleChipProps) {
  const theme = useKuyaraTheme();
  const { controlScale } = useTextScaling();
  const large = useEasierToSee();
  const strongEdge = useStrongEdge();
  const [isFocused, setIsFocused] = useState(false);

  return (
    <PressScale
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onBlur={() => setIsFocused(false)}
      onFocus={() => setIsFocused(true)}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        large ? { minHeight: easierToSee.chipHeight } : null,
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
      {selected ? <Icon color={theme.colors.iconPrimary} name="check" size={CHECK_GLYPH_SIZE * controlScale} /> : null}
      <AppText variant="label">{label}</AppText>
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
