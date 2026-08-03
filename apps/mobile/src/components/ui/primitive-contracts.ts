import type { AccessibilityState } from 'react-native';

import {
  type KuyaraTheme,
  type SemanticColorRole,
  type TypographyRole,
  typography,
} from '../../theme/theme';

export type SurfaceVariant = 'default' | 'muted' | 'elevated' | 'interactive';
export type ButtonVariant = 'primary' | 'secondary' | 'quiet';
export type PillTone = 'accent-filled' | 'bordered';

export const surfaceColorRoleByVariant = Object.freeze({
  default: 'surface',
  muted: 'surfaceMuted',
  elevated: 'backgroundElevated',
  interactive: 'surfaceInteractive',
} as const satisfies Readonly<Record<SurfaceVariant, SemanticColorRole>>);

export function resolveAppTextStyle(
  theme: KuyaraTheme,
  variant: TypographyRole,
  colorRole: SemanticColorRole,
  usesNaturalLineHeight = false,
) {
  if (usesNaturalLineHeight) {
    const { lineHeight: _lineHeight, ...scalableTypography } = typography[variant];

    return [scalableTypography, { color: theme.colors[colorRole] }] as const;
  }

  return [typography[variant], { color: theme.colors[colorRole] }] as const;
}

export function resolveSurfaceColors(theme: KuyaraTheme, variant: SurfaceVariant) {
  return {
    backgroundColor: theme.colors[surfaceColorRoleByVariant[variant]],
    borderColor: theme.colors.borderSubtle,
  } as const;
}

export function resolveButtonColors(
  theme: KuyaraTheme,
  variant: ButtonVariant,
  pressed: boolean,
) {
  if (variant === 'primary') {
    return {
      backgroundColor: theme.colors.brandPrimary,
      borderColor: theme.colors.brandPrimary,
      textColor: theme.colors.textOnBrand,
    } as const;
  }

  if (variant === 'secondary') {
    return {
      backgroundColor: theme.colors.surfaceInteractive,
      borderColor: theme.colors.borderStrong,
      textColor: theme.colors.textPrimary,
    } as const;
  }

  return {
    backgroundColor: pressed ? theme.colors.surfaceInteractive : 'transparent',
    borderColor: 'transparent',
    textColor: theme.colors.brandAccent,
  } as const;
}

export function resolvePillColors(theme: KuyaraTheme, tone: PillTone) {
  if (tone === 'accent-filled') {
    return {
      backgroundColor: theme.colors.brandAccent,
      borderColor: theme.colors.brandAccent,
      textColorRole: 'textOnBrand',
    } as const;
  }

  return {
    backgroundColor: 'transparent',
    borderColor: theme.colors.borderSubtle,
    textColorRole: 'textPrimary',
  } as const;
}

export function resolveInteractiveAccessibilityState(
  disabled: boolean,
  loading: boolean,
  accessibilityState?: AccessibilityState,
): AccessibilityState {
  return {
    ...accessibilityState,
    disabled: disabled || loading,
    busy: loading,
  };
}

export function createPressHandler<Event>(
  onPress: ((event: Event) => void) | null | undefined,
  isUnavailable: boolean,
) {
  if (!onPress || isUnavailable) {
    return undefined;
  }

  return (event: Event) => onPress(event);
}
