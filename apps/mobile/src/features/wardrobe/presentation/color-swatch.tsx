import { Pressable, StyleSheet, View } from 'react-native';

import { colorFamilyFills } from '@/components/ui';
import type { ColorFamily } from '@/features/catalog/domain/garment-taxonomy';
import { borderWidths, interaction, layout } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

// The colour family is a colour, so the control shows the colour rather than naming it
// fourteen times. The fills are ADR 0028 section 6's approved content colours, read
// through the one mapper; the enum value is never passed as a colour.
//
// Selection is a 2 point `brandAccent` ring, never a fill: Law 1 allows one accent-filled
// element per viewport. The ring is drawn in both states so selecting never moves the row,
// and it doubles as the `borderDefined` boundary Law 4 requires of an interactive
// component, which a white swatch on a white surface needs. Colour is not the only signal:
// the caller shows the selected family's name, and the radio state carries it for
// assistive technology.
//
// A swatch is its own touch target, so it is drawn at the 44 minimum rather than padded
// up to it.
const SWATCH_SIZE = layout.minimumTouchTarget;

export function ColorSwatch({
  colorFamily,
  disabled,
  label,
  onPress,
  selected,
}: Readonly<{
  colorFamily: ColorFamily;
  disabled: boolean;
  label: string;
  onPress: () => void;
  selected: boolean;
}>) {
  const theme = useKuyaraTheme();
  const fill = colorFamilyFills[theme.colorScheme][colorFamily];
  // `multicolor` is the one two-stop family, and it keeps its own treatment rather than
  // borrowing an interface colour (ADR 0029 section 5).
  const secondStop = typeof fill === 'string' ? null : fill[1];

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="radio"
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.swatch,
        {
          backgroundColor: typeof fill === 'string' ? fill : fill[0],
          borderColor: selected
            ? theme.colors.brandAccent
            : theme.colors.borderDefined,
        },
        pressed && !disabled && styles.pressed,
        disabled && styles.disabled,
      ]}
      testID={`wardrobe-color-${colorFamily}`}>
      {secondStop ? (
        <View
          style={[styles.swatchTrailingHalf, { backgroundColor: secondStop }]}
        />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  swatch: {
    borderRadius: SWATCH_SIZE / 2,
    borderWidth: borderWidths.strong,
    height: SWATCH_SIZE,
    overflow: 'hidden',
    width: SWATCH_SIZE,
  },
  swatchTrailingHalf: {
    bottom: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    width: '50%',
  },
  pressed: {
    opacity: interaction.pressedOpacity,
  },
  disabled: {
    opacity: interaction.disabledOpacity,
  },
});
