import { Children, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { GarmentDrawing } from '@/components/ui/garment-board/garment-tile-artwork';
import { Icon } from '@/components/ui/icon';
import { useTextScaling } from '@/components/ui/use-text-scaling';
import type { GarmentTypeId, StructuralCategory } from '@/features/catalog/domain/garment-taxonomy';
import { borderWidths, radii, spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

// One drawing is the tile's picture; several are a small hint of what the choice brings.
const SINGLE_GLYPH_SIZE = 40;
const HINT_GLYPH_SIZE = 30;
// The drawing grows with the text only a little, so three tiles still fit one row.
const GLYPH_SCALE_CAP = 1.15;
const CHECK_SIZE = 20;
const TILE_MIN_HEIGHT = 128;

export type ChoiceTileDrawing = Readonly<{ garmentTypeId: GarmentTypeId; category: StructuralCategory }>;

export type ChoiceTileProps = Readonly<{
  label: string;
  /** Shipped ADR 0025 drawings only: pictures, never the only signal; the word is under them. */
  drawings: readonly ChoiceTileDrawing[];
  selected: boolean;
  /** `radio` for one answer of a group, `checkbox` for a multi-choice. */
  role: 'radio' | 'checkbox';
  onPress: () => void;
  disabled?: boolean;
  testID: string;
}>;

/**
 * A garment-picture choice: the morning sheet's day-type tile, and the onboarding steps that
 * ask the same questions (O14), so an answer looks the same wherever it is given. The chosen
 * tile is told by three cues together (accent border, interactive fill and a check glyph),
 * never by colour alone.
 */
export function ChoiceTile({ disabled = false, drawings, label, onPress, role, selected, testID }: ChoiceTileProps) {
  const theme = useKuyaraTheme();
  const { controlScale } = useTextScaling();
  const scale = Math.min(controlScale, GLYPH_SCALE_CAP);
  const glyphSize = (drawings.length > 1 ? HINT_GLYPH_SIZE : SINGLE_GLYPH_SIZE) * scale;

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole={role}
      accessibilityState={role === 'radio' ? { selected, disabled } : { checked: selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.tile, {
        backgroundColor: selected ? theme.colors.surfaceInteractive : theme.colors.surface,
        borderColor: selected ? theme.colors.brandAccent : theme.colors.borderDefined,
        borderWidth: selected ? borderWidths.strong : borderWidths.subtle,
        opacity: disabled ? theme.interaction.disabledOpacity : pressed ? theme.interaction.pressedOpacity : 1,
      }]}
      testID={testID}>
      <View style={styles.drawings}>
        {drawings.map(({ category, garmentTypeId }, index) => (
          <GarmentDrawing
            category={category}
            garmentTypeId={garmentTypeId}
            key={garmentTypeId}
            size={glyphSize}
            testID={drawings.length > 1 ? `${testID}-drawing-${index}` : `${testID}-drawing`}
          />
        ))}
      </View>
      <AppText style={styles.label} variant="bodyStrong">{label}</AppText>
      {selected ? (
        <View style={styles.check} testID={`${testID}-check`}>
          <Icon color={theme.colors.brandAccent} name="checkCircle" size={CHECK_SIZE * scale} />
        </View>
      ) : null}
    </Pressable>
  );
}

/** Lays choice tiles out in equal columns; a short last row keeps the tiles' width. */
export function ChoiceTileGrid({
  accessibilityRole,
  children,
  columns,
  testID,
}: Readonly<{
  accessibilityRole?: 'radiogroup';
  children: ReactNode;
  columns: 2 | 3;
  testID?: string;
}>) {
  const tiles = Children.toArray(children);
  const rows = Array.from({ length: Math.ceil(tiles.length / columns) }, (_, row) =>
    tiles.slice(row * columns, row * columns + columns));

  return (
    <View accessibilityRole={accessibilityRole} style={styles.grid} testID={testID}>
      {rows.map((row, rowIndex) => (
        <View key={rowIndex} style={styles.row}>
          {row}
          {Array.from({ length: columns - row.length }, (_, index) => (
            <View key={`spacer-${index}`} style={styles.spacer} />
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { gap: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.sm },
  spacer: { flex: 1 },
  tile: { alignItems: 'center', borderRadius: radii.control, flex: 1, gap: spacing.sm,
    justifyContent: 'center', minHeight: TILE_MIN_HEIGHT, paddingHorizontal: spacing.sm, paddingVertical: spacing.md },
  drawings: { alignItems: 'flex-end', flexDirection: 'row', gap: spacing.xs, justifyContent: 'center' },
  label: { textAlign: 'center' },
  check: { position: 'absolute', right: spacing.xs, top: spacing.xs },
});
