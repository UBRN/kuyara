import { Platform, StyleSheet, Text, type TextProps } from 'react-native';

import { resolveAppTextStyle } from '@/components/ui/primitive-contracts';
import {
  type SemanticColorRole,
  type TypographyRole,
} from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

export type AppTextProps = TextProps & {
  variant?: TypographyRole;
  colorRole?: SemanticColorRole;
};

export function AppText({
  allowFontScaling = true,
  colorRole = 'textPrimary',
  style,
  variant = 'body',
  ...rest
}: AppTextProps) {
  const theme = useKuyaraTheme();
  const fontFamily =
    variant === 'code' ? Platform.select({ ios: 'ui-monospace', default: 'monospace' }) : undefined;

  return (
    <Text
      allowFontScaling={allowFontScaling}
      style={[styles.text, resolveAppTextStyle(theme, variant, colorRole), { fontFamily }, style]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  text: {
    maxWidth: '100%',
  },
});
