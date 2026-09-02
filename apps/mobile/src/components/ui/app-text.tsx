import { forwardRef, use } from 'react';
import { Platform, StyleSheet, Text, type TextProps, useWindowDimensions } from 'react-native';

import { resolveAppTextStyle } from '@/components/ui/primitive-contracts';
import { LocalizationContext } from '@/localization/localization-context';
import {
  typography,
  type SemanticColorRole,
  type TypographyRole,
} from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

export type AppTextProps = TextProps & {
  variant?: TypographyRole;
  colorRole?: SemanticColorRole;
  tabularNumbers?: boolean;
};

export const AppText = forwardRef<Text, AppTextProps>(function AppText(
  {
    allowFontScaling = true,
    children,
    colorRole = 'textPrimary',
    style,
    tabularNumbers = false,
    variant = 'body',
    ...rest
  },
  ref,
) {
  const theme = useKuyaraTheme();
  const { fontScale } = useWindowDimensions();
  const language = use(LocalizationContext)?.language ?? 'en';
  const fontFamily =
    variant === 'code' ? Platform.select({ ios: 'ui-monospace', default: 'monospace' }) : undefined;

  return (
    <Text
      allowFontScaling={allowFontScaling}
      ref={ref}
      style={[
        styles.text,
        resolveAppTextStyle(theme, variant, colorRole, fontScale > 1.5),
        { fontFamily },
        tabularNumbers && { fontVariant: ['tabular-nums'] },
        style,
      ]}
      {...rest}>
      {uppercasesContent(variant) && typeof children === 'string'
        ? children.toLocaleUpperCase(language === 'tr' ? 'tr-TR' : 'en-GB')
        : children}
    </Text>
  );
});

function uppercasesContent(variant: TypographyRole): boolean {
  const role = typography[variant];

  return 'textTransform' in role && role.textTransform === 'uppercase';
}

const styles = StyleSheet.create({
  text: {
    maxWidth: '100%',
  },
});
