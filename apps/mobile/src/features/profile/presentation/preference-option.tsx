import { StyleSheet, View, type ViewStyle } from 'react-native';

import { AppText, Icon, PressScale } from '@/components/ui';
import { borderWidths, interaction, layout, radii, spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

type PreferenceOptionProps = Readonly<{
  label: string;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
  testID?: string;
  layout?: 'stacked' | 'row';
}>;

// Onboarding's option row. ADR 0019 names onboarding a surface where kuyara's identity
// lives, so the row stays kuyara-drawn rather than becoming a system control.
//
// Selection is a `brandAccent` ring plus a filled `checkCircle`, never an accent fill:
// step 2 already spends the viewport's single accent fill on Continue, and in dark
// `brandPrimary` and `brandAccent` are the same hex, so a filled option put three fills of
// one hue where `design-language.md:60` allows one. `design-language.md:315` carries the
// state on the glyph instead, which is the idiom `garment-type-tile.tsx` already ships.
// The ring is drawn at the same width in both states, so selecting never moves the row.
export function PreferenceOption({
  disabled = false,
  label,
  layout: optionLayout = 'stacked',
  onPress,
  selected,
  testID,
}: PreferenceOptionProps) {
  const theme = useKuyaraTheme();
  const isRow = optionLayout === 'row';
  const surfaceStyle: ViewStyle = {
    backgroundColor: theme.colors.surface,
    borderColor: selected ? theme.colors.brandAccent : theme.colors.borderDefined,
  };

  // `design-language.md:405-407`: the press scales to 0.97 with `motion.fast`, and the
  // opacity keeps the pressed state visible when that motion is suppressed.
  return (
    <PressScale
      accessibilityLabel={label}
      accessibilityRole="radio"
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.option,
        isRow && styles.rowOption,
        surfaceStyle,
        pressed && !disabled && styles.pressed,
        disabled && styles.disabled,
      ]}>
      <AppText
        style={[styles.label, isRow && styles.rowLabel]}
        testID={testID ? `${testID}-label` : undefined}
        variant="bodyStrong">
        {label}
      </AppText>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={styles.mark}
        testID={testID ? `${testID}-mark` : undefined}>
        <Icon
          color={selected ? theme.colors.brandAccent : theme.colors.iconSecondary}
          name={selected ? 'checkCircle' : 'circle'}
          size={24}
        />
      </View>
    </PressScale>
  );
}

const styles = StyleSheet.create({
  option: {
    alignItems: 'center',
    borderRadius: radii.control,
    borderWidth: borderWidths.strong,
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
    minHeight: layout.minimumTouchTarget,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  rowOption: {
    flex: 1,
    justifyContent: 'center',
  },
  label: {
    flex: 1,
    flexShrink: 1,
  },
  rowLabel: {
    textAlign: 'center',
  },
  mark: {
    flexShrink: 0,
    height: 24,
    width: 24,
  },
  pressed: {
    opacity: interaction.pressedOpacity,
  },
  disabled: {
    opacity: interaction.disabledOpacity,
  },
});
