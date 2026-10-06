import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ColorSwatch } from './color-swatch';
import { closetSolidSwatches, type ClosetColorOptionId } from '@/features/wardrobe/domain/closet-color-options';
import { layout, spacing } from '@/theme/theme';

export type ClosetSolidStripProps = Readonly<{
  /** The chosen solid's Closet id, or null for the outfit's own colour. */
  selectedId: ClosetColorOptionId | null;
  /** A tap on another solid chooses it; a tap on the chosen one gives it back (null). */
  onSelect: (id: ClosetColorOptionId | null) => void;
  /** Each solid's spoken name, from the Closet palette's names. */
  colorName: (id: ClosetColorOptionId) => string;
  /** The group's spoken name, a whole phrase for its piece's slot. */
  label: string;
  testID: string;
}>;

const STEP = layout.minimumTouchTarget + spacing.xs;

/**
 * The 33 Closet solids in one row that scrolls sideways, for the compose sheet's ticked
 * pieces: the same swatch as the Closet palette, in the same order. It opens with the chosen
 * solid in view. A radio group, so the screen reader names the piece once and each swatch by
 * its colour.
 */
export function ClosetSolidStrip({ colorName, label, onSelect, selectedId, testID }: ClosetSolidStripProps) {
  // Only the first draw scrolls to the chosen solid; afterwards the reader's own scroll stays.
  const [initialOffset] = useState(() => {
    const index = closetSolidSwatches.findIndex(({ id }) => id === selectedId);
    return { x: Math.max(0, index - 1) * STEP, y: 0 };
  });
  return (
    <View accessibilityLabel={label} accessibilityRole="radiogroup" testID={testID}>
      <ScrollView
        contentContainerStyle={styles.row}
        contentOffset={initialOffset}
        horizontal
        showsHorizontalScrollIndicator={false}
        testID={`${testID}-scroll`}>
        {closetSolidSwatches.map(({ id }) => (
          <ColorSwatch
            choice={{ kind: 'option', id }}
            disabled={false}
            key={id}
            label={colorName(id)}
            onPress={() => onSelect(id === selectedId ? null : id)}
            selected={id === selectedId}
            testID={`${testID}-${id}`}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { gap: spacing.xs },
});
