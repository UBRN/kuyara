import { StyleSheet, View, type ViewProps } from 'react-native';

import { borderWidths, spacing } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

export type DividerProps = ViewProps & {
  variant?: 'full' | 'inset';
};

export function Divider({ style, variant = 'full', ...rest }: DividerProps) {
  const theme = useKuyaraTheme();

  return (
    <View
      {...rest}
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.divider,
        { borderTopColor: theme.colors.borderSubtle },
        variant === 'inset' && styles.inset,
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  divider: {
    borderTopWidth: borderWidths.subtle,
  },
  inset: {
    marginStart: spacing.lg,
  },
});
