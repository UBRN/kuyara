import { Platform, Text, type TextProps } from 'react-native';

import {
  type SemanticColorRole,
  type TypographyRole,
  typography,
} from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

export type ThemedTextProps = TextProps & {
  variant?: TypographyRole;
  themeColor?: SemanticColorRole;
};

export function ThemedText({ style, variant = 'body', themeColor, ...rest }: ThemedTextProps) {
  const theme = useKuyaraTheme();
  const fontFamily =
    variant === 'code' ? Platform.select({ ios: 'ui-monospace', default: 'monospace' }) : undefined;

  return (
    <Text
      style={[
        typography[variant],
        { color: theme.colors[themeColor ?? 'textPrimary'], fontFamily },
        style,
      ]}
      {...rest}
    />
  );
}
