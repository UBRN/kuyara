import { Pressable, StyleSheet, type LayoutChangeEvent } from 'react-native';

import { AppText, GarmentSlotGlyph } from '@/components/ui';
import type { StructuralCategory } from '@/features/catalog/domain/garment-taxonomy';
import { borderWidths, interaction, radii, spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

// ADR 0029 section 2. `Pill` (`components/ui/pill.tsx`) is a display-only badge with a
// hardcoded non-token type size baked into its style and no press handling, selected
// state, or `borderDefined` boundary; giving it all of that would be a larger change
// than this small, dedicated primitive. The type sheet uses it as a radio; the Closet's
// category strip (O9) uses it as a tab carrying the category glyph and its count, where
// the selected tab is the viewport's one accent fill. No haptic here.
const CHIP_MINIMUM_HEIGHT = 40;
const CHIP_HIT_SLOP = 2;
// Law 6: the glyph tracks the adjacent `label` 15, between the caption and body sizes.
const CHIP_GLYPH_SIZE = 22;

export type WardrobeCategoryChipProps = Readonly<{
  label: string;
  selected: boolean;
  onPress: () => void;
  /** A category tab draws its glyph before the label (O9). */
  category?: StructuralCategory;
  /** A category tab's piece count, in tabular figures after the label (O9). */
  count?: number;
  /** `tab` inside a tab list, `radio` inside a radio group. */
  role?: 'radio' | 'tab';
  accessibilityLabel?: string;
  onLayout?: (event: LayoutChangeEvent) => void;
  testID?: string;
}>;

export function WardrobeCategoryChip({
  accessibilityLabel,
  category,
  count,
  label,
  onLayout,
  onPress,
  role = 'radio',
  selected,
  testID,
}: WardrobeCategoryChipProps) {
  const theme = useKuyaraTheme();
  const ink = selected ? theme.colors.textOnBrand : theme.colors.textPrimary;

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole={role}
      accessibilityState={{ selected }}
      hitSlop={{ bottom: CHIP_HIT_SLOP, top: CHIP_HIT_SLOP }}
      onLayout={onLayout}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        category ? styles.withGlyph : null,
        {
          backgroundColor: selected ? theme.colors.brandAccent : 'transparent',
          borderColor: selected ? theme.colors.brandAccent : theme.colors.borderDefined,
        },
        pressed && styles.pressed,
      ]}
      testID={testID}>
      {category ? <GarmentSlotGlyph category={category} color={ink} size={CHIP_GLYPH_SIZE} /> : null}
      <AppText colorRole={selected ? 'textOnBrand' : 'textPrimary'} variant="label">
        {label}
      </AppText>
      {count === undefined ? null : (
        <AppText
          colorRole={selected ? 'textOnBrand' : 'textSecondary'}
          tabularNumbers
          testID={testID ? `${testID}-count` : undefined}
          variant="label">
          {count}
        </AppText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignItems: 'center',
    borderRadius: radii.pill,
    borderWidth: borderWidths.subtle,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    minHeight: CHIP_MINIMUM_HEIGHT,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  withGlyph: {
    paddingLeft: spacing.sm,
  },
  pressed: {
    opacity: interaction.pressedOpacity,
  },
});
