import { Pressable, StyleSheet, type ViewStyle } from 'react-native';

import { AppText, Icon } from '@/components/ui';
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

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="radio"
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => {
        const selectedStyle: ViewStyle = {
          backgroundColor: selected ? theme.colors.brandAccent : theme.colors.surface,
          borderColor: selected ? theme.colors.brandAccent : theme.colors.borderSubtle,
        };

        return [
          styles.option,
          isRow && styles.rowOption,
          selectedStyle,
          pressed && !disabled && styles.pressed,
          disabled && styles.disabled,
        ];
      }}>
      <AppText
        colorRole={selected ? 'textOnBrand' : 'textPrimary'}
        style={[styles.label, isRow && styles.rowLabel]}
        variant="bodyStrong">
        {label}
      </AppText>
      <Icon
        color={selected ? theme.colors.textOnBrand : theme.colors.iconSecondary}
        name={selected ? 'checkCircle' : 'circle'}
        size={24}
      />
    </Pressable>
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
    flex: 0,
    textAlign: 'center',
  },
  pressed: {
    opacity: interaction.pressedOpacity,
  },
  disabled: {
    opacity: interaction.disabledOpacity,
  },
});
