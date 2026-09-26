import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { resolveListRowTileGeometry } from '@/components/ui/primitive-contracts';
import { useTextScaling } from '@/components/ui/use-text-scaling';
import { withAlpha } from '@/theme/color-alpha';
import type { KuyaraTheme } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

// ADR 0028 section 2. Never a coloured tile: the fill is always the row's own ink at a
// low alpha, which is what keeps Law 1's one accent fill per viewport. The tile is its
// own primitive, standalone from `ListRow`, so ADR 0030 can host the same tile inside an
// `@expo/ui` `ListItem`'s `leading` slot through an `RNHostView`.
export type ListRowTileGlyph = (props: Readonly<{ color: string; size: number }>) => ReactNode;

export type ListRowTileProps = Readonly<{
  glyph: ListRowTileGlyph;
  testID?: string;
}>;

/** The tile's fill and glyph ink, shared with the SwiftUI tile a Picker row draws itself. */
export function listRowTileColors(theme: KuyaraTheme) {
  return {
    fill: withAlpha(theme.colors.textPrimary, theme.isDark ? 0.12 : 0.08),
    ink: theme.colors.textPrimary,
  } as const;
}

export function ListRowTile({ glyph, testID }: ListRowTileProps) {
  const theme = useKuyaraTheme();
  const { controlScale } = useTextScaling();
  const geometry = resolveListRowTileGeometry(controlScale);
  const colors = listRowTileColors(theme);

  return (
    <View
      style={[
        styles.tile,
        {
          width: geometry.size,
          height: geometry.size,
          borderRadius: geometry.borderRadius,
          backgroundColor: colors.fill,
        },
      ]}
      testID={testID}>
      {glyph({ color: colors.ink, size: geometry.glyphSize })}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
