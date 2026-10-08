import { useState } from 'react';
import { StyleSheet, type PressableProps } from 'react-native';

import { Icon, type IconName } from '@/components/ui/icon';
import { PressScale } from '@/components/ui/press-scale';
import {
  createPressHandler,
  resolveButtonColors,
  resolveInteractiveAccessibilityState,
} from '@/components/ui/primitive-contracts';
import { borderWidths, layout, radii } from '@/theme/theme';
import { useStrongEdge } from '@/theme/easier-to-see';
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
} & (
  /** A toggle: the outlined button keeps one choice on or off, with `selectedIcon` when on. */
  | Readonly<{ selected: boolean; selectedIcon: IconName }>
  | Readonly<{ selected?: undefined; selectedIcon?: undefined }>
);

/**
 * O5's rare icon-only action inside content: a 44-point circle on the tonal fill with a
 * 20-point glyph in the primary ink. Bar buttons and sheet close are `GlassButton`.
 *
 * With `selected` it is a toggle instead: the `borderDefined` edge on a transparent fill at
 * rest, the filled glyph and the neutral `surfaceInteractive` fill when selected, never the
 * accent, and the selected trait says the same. A toggle fires no haptic (Law 8).
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
  selected,
  selectedIcon,
  ...rest
}: IconButtonProps) {
  const theme = useKuyaraTheme();
  const strongEdge = useStrongEdge();
  const [isFocused, setIsFocused] = useState(false);
  const toggle = selected !== undefined;
  const pressHandler = createPressHandler(onPress, disabled);

  return (
    <PressScale
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={resolveInteractiveAccessibilityState(
        disabled,
        false,
        toggle ? { ...accessibilityState, selected } : accessibilityState,
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
        toggle
          ? {
              backgroundColor: pressed && !disabled
                ? theme.colors.surfaceInteractivePressed
                : selected ? theme.colors.surfaceInteractive : 'transparent',
              borderColor: strongEdge?.borderColor ?? theme.colors.borderDefined,
              borderWidth: strongEdge?.borderWidth ?? borderWidths.subtle,
            }
          : {
              backgroundColor: resolveButtonColors(theme, 'tonal', {
                disabled,
                pressed: pressed && !disabled,
                raised,
              }).backgroundColor,
            },
        isFocused && { outlineColor: theme.colors.focusRing },
      ]}
      {...rest}>
      <Icon
        color={disabled ? theme.colors.borderDefined : theme.colors.iconPrimary}
        name={selected ? selectedIcon : icon}
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
