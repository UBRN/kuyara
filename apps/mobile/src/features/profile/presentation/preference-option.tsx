import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { AppText } from '@/components/ui';
import { borderWidths, interaction, layout, radii, spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

type PreferenceOptionProps = Readonly<{
  label: string;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
  testID?: string;
}>;

export function PreferenceOption({
  disabled = false,
  label,
  onPress,
  selected,
  testID,
}: PreferenceOptionProps) {
  const theme = useKuyaraTheme();

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
          backgroundColor: selected
            ? theme.colors.surfaceInteractive
            : theme.colors.surface,
          borderColor: selected
            ? theme.colors.borderStrong
            : theme.colors.borderSubtle,
        };

        return [
          styles.option,
          selectedStyle,
          pressed && !disabled && styles.pressed,
          disabled && styles.disabled,
        ];
      }}>
      <AppText variant="bodyStrong" style={styles.label}>
        {label}
      </AppText>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <SymbolView
          name={{
            ios: selected ? 'checkmark.circle.fill' : 'circle',
            android: selected ? 'check_circle' : 'radio_button_unchecked',
            web: selected ? 'check_circle' : 'radio_button_unchecked',
          }}
          size={24}
          tintColor={
            selected ? theme.colors.iconPrimary : theme.colors.iconSecondary
          }
        />
      </View>
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
  label: {
    flex: 1,
    flexShrink: 1,
  },
  pressed: {
    opacity: interaction.pressedOpacity,
  },
  disabled: {
    opacity: 0.48,
  },
});
