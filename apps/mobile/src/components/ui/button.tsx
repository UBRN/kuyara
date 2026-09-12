import { useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  View,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { haptics } from '@/components/ui/haptics';
import { PressScale } from '@/components/ui/press-scale';
import {
  createPressHandler,
  resolveButtonColors,
  resolveInteractiveAccessibilityState,
  type ButtonVariant,
} from '@/components/ui/primitive-contracts';
import { borderWidths, interaction, layout, radii, spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

export type ButtonProps = Omit<
  PressableProps,
  'accessibilityRole' | 'children' | 'disabled' | 'style'
> & {
  label: string;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Button({
  accessibilityLabel,
  accessibilityState,
  disabled = false,
  label,
  loading = false,
  onBlur,
  onFocus,
  onPress,
  onPressIn,
  style,
  variant = 'primary',
  ...rest
}: ButtonProps) {
  const theme = useKuyaraTheme();
  const [isFocused, setIsFocused] = useState(false);
  const isUnavailable = disabled || loading;
  const pressHandler = createPressHandler(onPress, isUnavailable);

  return (
    <PressScale
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole="button"
      accessibilityState={resolveInteractiveAccessibilityState(
        disabled,
        loading,
        accessibilityState,
      )}
      disabled={isUnavailable}
      onBlur={(event) => {
        setIsFocused(false);
        onBlur?.(event);
      }}
      onFocus={(event) => {
        setIsFocused(true);
        onFocus?.(event);
      }}
      onPress={pressHandler}
      onPressIn={(event) => {
        // Law 8: the screen's main action confirms the press itself; no other control
        // does. The wrapper routes Android to its own feedback rather than the iOS call.
        if (variant === 'primary') haptics.impactLight();
        onPressIn?.(event);
      }}
      style={({ pressed }) => {
        const colors = resolveButtonColors(theme, variant, pressed);

        return [
          styles.button,
          { backgroundColor: colors.backgroundColor, borderColor: colors.borderColor },
          pressed && !isUnavailable && styles.pressed,
          isUnavailable && styles.disabled,
          isFocused && { borderColor: theme.colors.focusRing },
          style,
        ];
      }}
      {...rest}>
      {({ pressed }) => {
        const colors = resolveButtonColors(theme, variant, pressed);

        return (
          <View style={styles.content}>
            <AppText
              accessibilityElementsHidden
              colorRole={
                variant === 'primary'
                  ? 'textOnPrimaryFill'
                  : variant === 'destructive'
                    ? 'textOnBrand'
                  : variant === 'quiet'
                    ? 'brandAccent'
                    : 'textPrimary'
              }
              importantForAccessibility="no"
              variant="label"
              style={[styles.label, loading && styles.hiddenLabel, { color: colors.textColor }]}>
              {label}
            </AppText>
            {loading && (
              <ActivityIndicator
                accessibilityElementsHidden
                color={colors.textColor}
                importantForAccessibility="no-hide-descendants"
                style={styles.spinner}
              />
            )}
          </View>
        );
      }}
    </PressScale>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: layout.minimumTouchTarget,
    maxWidth: '100%',
    flexShrink: 1,
    justifyContent: 'center',
    borderRadius: radii.control,
    borderWidth: borderWidths.strong,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  content: {
    minHeight: 20,
    maxWidth: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    flexShrink: 1,
    textAlign: 'center',
  },
  hiddenLabel: {
    opacity: 0,
  },
  spinner: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  pressed: {
    opacity: interaction.pressedOpacity,
  },
  disabled: {
    opacity: interaction.disabledOpacity,
  },
});
