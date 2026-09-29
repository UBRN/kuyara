import { StyleSheet, View, type ViewProps } from 'react-native';

import { borderWidths } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

export function Divider({ style, ...rest }: ViewProps) {
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
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  divider: {
    borderTopWidth: borderWidths.subtle,
  },
});
