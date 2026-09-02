import { useState, type ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import {
  createPressHandler,
  resolveInteractiveAccessibilityState,
} from '@/components/ui/primitive-contracts';
import { borderWidths, interaction, layout, radii } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

export type IconButtonProps = Omit<
  PressableProps,
  'accessibilityLabel' | 'accessibilityRole' | 'children' | 'disabled' | 'style'
> & {
  accessibilityLabel: string;
  icon: (color: string) => ReactNode;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function IconButton({
  accessibilityLabel,
  accessibilityState,
  disabled = false,
  icon,
  onBlur,
  onFocus,
  onPress,
  style,
  ...rest
}: IconButtonProps) {
  const theme = useKuyaraTheme();
  const [isFocused, setIsFocused] = useState(false);
  const pressHandler = createPressHandler(onPress, disabled);

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={resolveInteractiveAccessibilityState(
        disabled,
        false,
        accessibilityState,
      )}
      disabled={disabled}
      onBlur={(event) => {
        setIsFocused(false);
        onBlur?.(event);
      }}
      onFocus={(event) => {
        setIsFocused(true);
        onFocus?.(event);
      }}
      onPress={pressHandler}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: theme.colors.surfaceInteractive,
          borderColor: theme.colors.borderDefined,
        },
        pressed && !disabled && styles.pressed,
        disabled && styles.disabled,
        isFocused && { borderColor: theme.colors.focusRing },
        style,
      ]}
      {...rest}>
      {icon(theme.colors.iconPrimary)}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: layout.minimumTouchTarget,
    height: layout.minimumTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.control,
    borderWidth: borderWidths.strong,
  },
  pressed: {
    opacity: interaction.pressedOpacity,
  },
  disabled: {
    opacity: interaction.disabledOpacity,
  },
});
