import { StyleSheet, View } from 'react-native';

import { AppText, NativeColorWell } from '@/components/ui';
import type { ColorFamily } from '@/features/catalog/domain/garment-taxonomy';
import {
  closetColorOptions,
  closetSolidSwatches,
  colorChoiceFamily,
  normalizeCustomColorHex,
  type ClosetColorChoice,
} from '@/features/wardrobe/domain/closet-color-options';
import { ColorSwatch } from '@/features/wardrobe/presentation/color-swatch';
import type { AppMessages } from '@/localization/messages';
import { useMessages } from '@/localization/use-messages';
import { spacing } from '@/theme/theme';

// The adopted Phase 5 revision 2 grid: seven swatches a row.
const COLUMNS = 7;

/**
 * The words for a piece's colour: its palette option's name, else its colour family (a custom
 * colour names the family it is nearest to), else the form's "Any".
 */
export function closetColorName(
  messages: AppMessages,
  choice: ClosetColorChoice | null | undefined,
  colorFamily: ColorFamily | null,
): string {
  const optionName = choice?.kind === 'option' ? messages.wardrobe.colorOptionNames[choice.id] : undefined;
  if (optionName) return optionName;
  return colorFamily
    ? messages.catalog[`catalog.color_family.${colorFamily}`]
    : messages.wardrobe.colorUnspecified;
}

/**
 * O8: the Closet palette. "Solid colors" holds the 33 swatches in the approved order and ends
 * with the system colour well; "Two colors and patterns" holds the 14 fixed options. One
 * choice across both grids and the custom colour. A record that only has a colour family
 * (every record saved before build 16) selects no swatch; its family stays in the preview
 * and the name line until a swatch is picked.
 */
export function ClosetColorPalette({
  choice,
  disabled,
  onChange,
}: Readonly<{
  choice: ClosetColorChoice | null;
  disabled: boolean;
  onChange: (choice: ClosetColorChoice) => void;
}>) {
  const messages = useMessages();
  const copy = messages.wardrobe;
  const customHex = choice?.kind === 'custom' ? choice.hex : null;

  const optionSwatch = (id: string) => {
    const option: ClosetColorChoice = { kind: 'option', id };
    return (
      <View key={id} style={styles.cell}>
        <ColorSwatch
          choice={option}
          disabled={disabled}
          label={copy.colorOptionNames[id] ?? id}
          onPress={() => onChange(option)}
          selected={choice?.kind === 'option' && choice.id === id}
          testID={`wardrobe-color-${id}`}
        />
      </View>
    );
  };

  return (
    <View style={styles.palette} testID="wardrobe-color-palette">
      <AppText colorRole="textSecondary" variant="label">{copy.solidColorsLabel}</AppText>
      <View accessibilityLabel={copy.solidColorsLabel} accessibilityRole="radiogroup" style={styles.grid}>
        {closetSolidSwatches.map(({ id }) => optionSwatch(id))}
        <View style={styles.cell}>
          <NativeColorWell
            accessibilityLabel={copy.moreColorsLabel}
            accessibilityValue={customHex
              ? messages.catalog[`catalog.color_family.${colorChoiceFamily({ kind: 'custom', hex: customHex })}`]
              : undefined}
            disabled={disabled}
            onChange={(hex) => {
              try {
                onChange({ kind: 'custom', hex: normalizeCustomColorHex(hex) });
              } catch {
                // The wrapper only reports #RRGGBB; anything else is not a colour to keep.
              }
            }}
            selected={customHex !== null}
            testID="wardrobe-color-custom"
            value={customHex}
          />
        </View>
      </View>
      <AppText colorRole="textSecondary" variant="label">{copy.patternColorsLabel}</AppText>
      <View accessibilityLabel={copy.patternColorsLabel} accessibilityRole="radiogroup" style={styles.grid}>
        {closetColorOptions.map(({ id }) => optionSwatch(id))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  palette: {
    gap: spacing.sm,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: spacing.sm,
  },
  cell: {
    alignItems: 'center',
    flexBasis: `${100 / COLUMNS}%`,
  },
});
