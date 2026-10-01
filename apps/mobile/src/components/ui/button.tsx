import { useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { haptics } from '@/components/ui/haptics';
import { Icon, type IconName } from '@/components/ui/icon';
import { PressScale } from '@/components/ui/press-scale';
import {
  buttonGeometry,
  createPressHandler,
  resolveButtonColors,
  resolveInteractiveAccessibilityState,
  type ButtonSize,
  type ButtonVariant,
} from '@/components/ui/primitive-contracts';
import { useTextScaling } from '@/components/ui/use-text-scaling';
import { borderWidths, layout, radii, spacing } from '@/theme/theme';
import { easierToSee, useEasierToSee, useStrongEdge } from '@/theme/easier-to-see';
import { useKuyaraTheme } from '@/theme/theme-context';

export type ButtonProps = Omit<
  PressableProps,
  'accessibilityRole' | 'children' | 'disabled' | 'hitSlop' | 'style'
> & {
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** At most one leading icon, and only when it names the action faster than the words. */
  icon?: IconName;
  disabled?: boolean;
  loading?: boolean;
  /**
   * False for a primary action whose outcome confirms itself with Law 8's success
   * notification: one press, one haptic.
   */
  pressHaptic?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * The O5 button: a capsule in one of four roles and three sizes. Pressed shrinks by 3%
 * and steps the fill; loading turns the leading slot into a spinner and keeps the label;
 * the label wraps rather than truncates. Only the prominent role fires a haptic (Law 8).
 */
export function Button({
  accessibilityLabel,
  accessibilityState,
  disabled = false,
  icon,
  label,
  loading = false,
  onBlur,
  onFocus,
  onPress,
  onPressIn,
  pressHaptic = true,
  size = 'medium',
  style,
  variant = 'prominent',
  ...rest
}: ButtonProps) {
  const theme = useKuyaraTheme();
  const { controlScale } = useTextScaling();
  const [isFocused, setIsFocused] = useState(false);
  const isUnavailable = disabled || loading;
  const pressHandler = createPressHandler(onPress, isUnavailable);
  // O13: every kuyara-drawn button is a 56-point primary-action target while Easier to see
  // is on; the label, icon and padding keep their size.
  const large = useEasierToSee();
  // Owner decision 9: a button that is not already a dark fill takes the 2-point strong edge
  // while higher contrast applies; a disabled one keeps the edge in its inert ink.
  const strongEdge = useStrongEdge();
  const edge = strongEdge && variant !== 'prominent'
    ? { ...strongEdge, borderColor: disabled ? theme.colors.borderDefined : strongEdge.borderColor }
    : null;
  const geometry = buttonGeometry[size];
  const box = useButtonBox(size);
  const iconSize = geometry.iconSize * controlScale;

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
      // Small is drawn at 36 and reaches the 44-point target through the slop.
      hitSlop={large ? 0 : Math.max(0, (layout.minimumTouchTarget - geometry.height) / 2)}
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
        if (variant === 'prominent' && pressHaptic) haptics.impactLight();
        onPressIn?.(event);
      }}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: resolveButtonColors(theme, variant, {
            disabled,
            pressed: pressed && !isUnavailable,
          }).backgroundColor,
          columnGap: geometry.gap,
          ...box,
          paddingHorizontal: geometry.paddingHorizontal,
        },
        edge,
        isFocused && { outlineColor: theme.colors.focusRing },
        style,
      ]}
      {...rest}>
      {({ pressed }) => {
        const { textColor } = resolveButtonColors(theme, variant, {
          disabled,
          pressed: pressed && !isUnavailable,
        });

        return (
          <>
            {loading ? (
              <ActivityIndicator
                accessibilityElementsHidden
                color={textColor}
                importantForAccessibility="no-hide-descendants"
                style={{ height: iconSize, width: iconSize }}
              />
            ) : icon ? (
              <Icon color={textColor} name={icon} size={iconSize} />
            ) : null}
            <AppText
              accessibilityElementsHidden
              importantForAccessibility="no"
              variant={geometry.labelRole}
              style={[styles.label, { color: textColor }]}>
              {label}
            </AppText>
          </>
        );
      }}
    </PressScale>
  );
}

/**
 * A button's box at a size: its drawn height (56 while Easier to see is on) and its vertical
 * padding. A view that stands in for a button, as a saved state replacing its action, takes
 * the same box so nothing around it moves when one replaces the other.
 */
export function useButtonBox(size: ButtonSize = 'medium') {
  const large = useEasierToSee();
  const { height } = buttonGeometry[size];
  return {
    minHeight: large ? Math.max(height, easierToSee.primaryActionHeight) : height,
    paddingVertical: spacing.sm,
  } as const;
}

const styles = StyleSheet.create({
  button: {
    maxWidth: '100%',
    flexShrink: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
    // The focus ring sits 2 points outside the capsule and is transparent until focused.
    outlineColor: 'transparent',
    outlineOffset: borderWidths.strong,
    outlineStyle: 'solid',
    outlineWidth: borderWidths.strong,
  },
  label: {
    flexShrink: 1,
    minWidth: 0,
    textAlign: 'center',
  },
});
