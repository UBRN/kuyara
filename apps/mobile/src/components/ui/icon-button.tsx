import { useState } from 'react';
import {
  StyleSheet,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { Icon, type IconName } from '@/components/ui/icon';
import { PressScale } from '@/components/ui/press-scale';
import {
  createPressHandler,
  resolveButtonColors,
  resolveInteractiveAccessibilityState,
} from '@/components/ui/primitive-contracts';
import { borderWidths, layout, radii } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

const GLYPH_SIZE = 20;

export type IconButtonProps = Omit<
  PressableProps,
  'accessibilityLabel' | 'accessibilityRole' | 'children' | 'disabled' | 'style'
> & {
  accessibilityLabel: string;
  icon: IconName;
  disabled?: boolean;
  /** Drawn on a sheet, where the dark appearance lifts the tonal fill. */
  raised?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * O5's rare icon-only action inside content: a 44-point circle on the tonal fill with a
 * 20-point glyph in the primary ink. Bar buttons and sheet close are `GlassButton`.
 */
export function IconButton({
  accessibilityLabel,
  accessibilityState,
  disabled = false,
  icon,
  onBlur,
  onFocus,
  onPress,
  raised = false,
  style,
  ...rest
}: IconButtonProps) {
  const theme = useKuyaraTheme();
  const [isFocused, setIsFocused] = useState(false);
  const pressHandler = createPressHandler(onPress, disabled);

  return (
    <PressScale
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
          backgroundColor: resolveButtonColors(theme, 'tonal', {
            disabled,
            pressed: pressed && !disabled,
            raised,
          }).backgroundColor,
        },
        isFocused && { outlineColor: theme.colors.focusRing },
        style,
      ]}
      {...rest}>
      <Icon
        color={disabled ? theme.colors.borderDefined : theme.colors.iconPrimary}
        name={icon}
        size={GLYPH_SIZE}
      />
    </PressScale>
  );
}

const styles = StyleSheet.create({
  button: {
    width: layout.minimumTouchTarget,
    height: layout.minimumTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
    outlineColor: 'transparent',
    outlineOffset: borderWidths.strong,
    outlineStyle: 'solid',
    outlineWidth: borderWidths.strong,
  },
});
