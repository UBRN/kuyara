import { useState } from 'react';
import { StyleSheet, type PressableProps } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { PressScale } from '@/components/ui/press-scale';
import {
  createPressHandler,
  resolveInteractiveAccessibilityState,
} from '@/components/ui/primitive-contracts';
import { borderWidths, layout, radii, spacing } from '@/theme/theme';
import { easierToSee, useEasierToSee } from '@/theme/easier-to-see';
import { useKuyaraTheme } from '@/theme/theme-context';

export type TextButtonProps = Omit<
  PressableProps,
  'accessibilityRole' | 'children' | 'disabled' | 'hitSlop' | 'style'
> & {
  label: string;
  disabled?: boolean;
  /** Drawn as an inline link (brand ink, underlined), still a button with the same target. */
  link?: boolean;
};

/**
 * A quiet secondary action drawn as small text, such as an offer's "Not now" beside its
 * button. It looks like a caption but is a button: role, label, focus ring and a box at
 * least 44 points tall and wide (56 tall while Easier to see is on), so the target never
 * shrinks with the ink. `link` draws the caption as the sign-in footnote's links are drawn.
 */
export function TextButton({
  accessibilityLabel,
  accessibilityState,
  disabled = false,
  label,
  link = false,
  onBlur,
  onFocus,
  onPress,
  ...rest
}: TextButtonProps) {
  const theme = useKuyaraTheme();
  const large = useEasierToSee();
  const [isFocused, setIsFocused] = useState(false);

  return (
    <PressScale
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole="button"
      accessibilityState={resolveInteractiveAccessibilityState(disabled, false, accessibilityState)}
      disabled={disabled}
      onBlur={(event) => {
        setIsFocused(false);
        onBlur?.(event);
      }}
      onFocus={(event) => {
        setIsFocused(true);
        onFocus?.(event);
      }}
      onPress={createPressHandler(onPress, disabled)}
      style={[
        styles.button,
        { minHeight: large ? easierToSee.primaryActionHeight : layout.minimumTouchTarget },
        isFocused && { outlineColor: theme.colors.focusRing },
      ]}
      {...rest}>
      {({ pressed }) => (
        <AppText
          accessibilityElementsHidden
          colorRole={disabled ? 'borderDefined' : pressed ? 'textPrimary' : link ? 'brandPrimary' : 'textSecondary'}
          importantForAccessibility="no"
          style={link ? styles.link : undefined}
          variant="caption">
          {label}
        </AppText>
      )}
    </PressScale>
  );
}

const styles = StyleSheet.create({
  link: { textDecorationLine: 'underline' },
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: layout.minimumTouchTarget,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.pill,
    outlineColor: 'transparent',
    outlineOffset: borderWidths.strong,
    outlineStyle: 'solid',
    outlineWidth: borderWidths.strong,
  },
});
