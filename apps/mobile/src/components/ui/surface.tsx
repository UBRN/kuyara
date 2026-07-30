import { StyleSheet, View, type ViewProps } from 'react-native';

import {
  resolveSurfaceColors,
  type SurfaceVariant,
} from '@/components/ui/primitive-contracts';
import { borderWidths, radii } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

export type SurfaceProps = ViewProps & {
  variant?: SurfaceVariant;
};

export function Surface({ style, variant = 'default', ...rest }: SurfaceProps) {
  const theme = useKuyaraTheme();

  return (
    <View
      style={[styles.surface, resolveSurfaceColors(theme, variant), style]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  surface: {
    borderRadius: radii.card,
    borderWidth: borderWidths.subtle,
  },
});
