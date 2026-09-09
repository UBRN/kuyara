import { Pressable, StyleSheet } from 'react-native';

import { AppText } from '@/components/ui';
import { borderWidths, interaction, radii, spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

// ADR 0029 section 2. `Pill` (`components/ui/pill.tsx`) is a display-only badge with a
// hardcoded non-token type size baked into its style and no press handling, selected
// state, or `borderDefined` boundary; giving it all of that would be a larger change
// than this small, dedicated primitive. State is the segmented control; category is
// scope, so this chip is radio-like rather than a toggle: exactly one of "All" and the
// present categories is selected at a time. No haptic here, unlike the segmented
// control (ADR 0029 section 2).
const CHIP_MINIMUM_HEIGHT = 40;
const CHIP_HIT_SLOP = 2;

export type WardrobeCategoryChipProps = Readonly<{
  label: string;
  selected: boolean;
  onPress: () => void;
  testID?: string;
}>;

export function WardrobeCategoryChip({
  label,
  onPress,
  selected,
  testID,
}: WardrobeCategoryChipProps) {
  const theme = useKuyaraTheme();

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      hitSlop={{ bottom: CHIP_HIT_SLOP, top: CHIP_HIT_SLOP }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: selected ? theme.colors.brandAccent : 'transparent',
          borderColor: selected ? theme.colors.brandAccent : theme.colors.borderDefined,
        },
        pressed && styles.pressed,
      ]}
      testID={testID}>
      <AppText colorRole={selected ? 'textOnBrand' : 'textPrimary'} variant="label">
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignItems: 'center',
    borderRadius: radii.pill,
    borderWidth: borderWidths.subtle,
    justifyContent: 'center',
    minHeight: CHIP_MINIMUM_HEIGHT,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  pressed: {
    opacity: interaction.pressedOpacity,
  },
});
