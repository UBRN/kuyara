import { Pressable, StyleSheet } from 'react-native';

import { ClosetColorDisc } from '@/components/ui';
import type { ClosetColorChoice } from '@/features/wardrobe/domain/closet-color-options';
import { borderWidths, interaction, layout } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

// One palette option of the Closet colour grids (O8). The colour is shown rather than named
// forty-seven times; the name is the radio's accessible label.
//
// Selection is a 2 point `brandAccent` ring around the disc, never a fill: Law 1 allows one
// accent-filled element per viewport. The ring's slot is drawn in both states, so selecting
// never moves the grid, and the disc keeps its own `borderDefined` edge (Law 4), which a
// white swatch on a light ground needs. The selected disc also carries a check, so colour
// is not the only signal, and the radio state carries it for assistive technology.
//
// A swatch is its own touch target, so it is drawn at the 44 minimum.
const SWATCH_SIZE = layout.minimumTouchTarget;
const DISC_SIZE = 36;

export function ColorSwatch({
  choice,
  disabled,
  label,
  onPress,
  selected,
  testID,
}: Readonly<{
  choice: ClosetColorChoice;
  disabled: boolean;
  label: string;
  onPress: () => void;
  selected: boolean;
  testID: string;
}>) {
  const theme = useKuyaraTheme();

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="radio"
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.swatch,
        { borderColor: selected ? theme.colors.brandAccent : 'transparent' },
        pressed && !disabled && styles.pressed,
        disabled && styles.disabled,
      ]}
      testID={testID}>
      <ClosetColorDisc choice={choice} selected={selected} size={DISC_SIZE} testID={`${testID}-disc`} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  swatch: {
    alignItems: 'center',
    borderRadius: SWATCH_SIZE / 2,
    borderWidth: borderWidths.strong,
    height: SWATCH_SIZE,
    justifyContent: 'center',
    width: SWATCH_SIZE,
  },
  pressed: {
    opacity: interaction.pressedOpacity,
  },
  disabled: {
    opacity: interaction.disabledOpacity,
  },
});
