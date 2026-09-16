import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { AppText } from '@/components/ui';
import { borderWidths, interaction, layout, radii, spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

// Law 6's ladder: the mark sits beside a `bodyStrong` 17 label, so it is 20, not 24.
const MARK_SIZE = 20;

type WardrobeOptionProps = Readonly<{
  label: string;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
  testID?: string;
}>;

export function WardrobeOption({
  disabled = false,
  label,
  onPress,
  selected,
  testID,
}: WardrobeOptionProps) {
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
            ? theme.colors.brandAccent
            : theme.colors.surface,
          borderColor: selected
            ? theme.colors.brandAccent
            : theme.colors.borderDefined,
        };

        return [
          styles.option,
          selectedStyle,
          pressed && !disabled && styles.pressed,
          disabled && styles.disabled,
        ];
      }}>
      <AppText
        colorRole={selected ? 'textOnBrand' : 'textPrimary'}
        style={styles.label}
        testID={testID ? `${testID}-label` : undefined}
        variant="bodyStrong">
        {label}
      </AppText>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={styles.mark}
        testID={testID ? `${testID}-mark` : undefined}>
        <SymbolView
          name={{
            ios: selected ? 'checkmark.circle.fill' : 'circle',
            android: selected ? 'check_circle' : 'radio_button_unchecked',
            web: selected ? 'check_circle' : 'radio_button_unchecked',
          }}
          size={MARK_SIZE}
          tintColor={
            selected ? theme.colors.textOnBrand : theme.colors.iconSecondary
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
  mark: {
    flexShrink: 0,
    height: MARK_SIZE,
    width: MARK_SIZE,
  },
  pressed: {
    opacity: interaction.pressedOpacity,
  },
  disabled: {
    opacity: interaction.disabledOpacity,
  },
});
