import { forwardRef, use } from 'react';
import { Platform, StyleSheet, Text, type TextProps } from 'react-native';

import { resolveAppTextStyle } from '@/components/ui/primitive-contracts';
import { useTextScaling } from '@/components/ui/use-text-scaling';
import { LocalizationContext } from '@/localization/localization-context';
import { localeTag } from '@/localization/locale-tag';
import {
  typography,
  type SemanticColorRole,
  type TypographyRole,
} from '@/theme/theme';
import { heavierWeight, useVisibility } from '@/theme/easier-to-see';
import { useKuyaraTheme } from '@/theme/theme-context';

export type AppTextProps = TextProps & {
  variant?: TypographyRole;
  colorRole?: SemanticColorRole;
  tabularNumbers?: boolean;
  fitSingleLine?: boolean;
};

export const AppText = forwardRef<Text, AppTextProps>(function AppText(
  {
    allowFontScaling = true,
    children,
    colorRole = 'textPrimary',
    fitSingleLine = false,
    style,
    tabularNumbers = false,
    variant = 'body',
    ...rest
  },
  ref,
) {
  const theme = useKuyaraTheme();
  const { heavierText, higherContrast } = useVisibility();
  const { usesStackedLayout } = useTextScaling();
  // O13: higher contrast reads secondary text in the primary ink; heavier text takes one
  // weight step and lifts the 13-point roles to the 15-point label size.
  const resolvedColorRole = higherContrast && colorRole === 'textSecondary' ? 'textPrimary' : colorRole;
  const role = typography[variant];
  const heavier = heavierText
    ? {
      fontWeight: heavierWeight(role.fontWeight),
      ...(role.fontSize === typography.caption.fontSize
        ? usesStackedLayout
          ? { fontSize: typography.label.fontSize }
          : { fontSize: typography.label.fontSize, lineHeight: typography.label.lineHeight }
        : null),
    }
    : null;
  // A weight the caller sets itself (a title's 700, a pill's label) takes the same step.
  const callerWeight = heavierText ? heavierWeight(String(StyleSheet.flatten(style)?.fontWeight)) : undefined;
  const heavierCaller = callerWeight ? { fontWeight: callerWeight } : null;
  const language = use(LocalizationContext)?.language ?? 'en';
  const fontFamily =
    variant === 'code' ? Platform.select({ ios: 'ui-monospace', default: 'monospace' }) : undefined;

  return (
    <Text
      allowFontScaling={allowFontScaling}
      ref={ref}
      style={[
        styles.text,
        resolveAppTextStyle(theme, variant, resolvedColorRole, usesStackedLayout),
        heavier,
        { fontFamily },
        tabularNumbers && { fontVariant: ['tabular-nums'] },
        style,
        heavierCaller,
      ]}
      {...rest}
      adjustsFontSizeToFit={fitSingleLine ? true : rest.adjustsFontSizeToFit}
      minimumFontScale={fitSingleLine ? 0.4 : rest.minimumFontScale}
      numberOfLines={fitSingleLine ? 1 : rest.numberOfLines}>
      {uppercasesContent(variant) && typeof children === 'string'
        ? children.toLocaleUpperCase(localeTag(language))
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
