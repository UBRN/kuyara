import type { TextStyle } from 'react-native';

import type { ThemePreference } from '@/domain/preferences';

export type { ThemePreference } from '@/domain/preferences';

export const brandColors = Object.freeze({
  deepAtmosphere: '#142F3B',
  calmCurrent: '#27606A',
  quietSky: '#9FC9D5',
  softMist: '#F4F6F5',
  nightLayer: '#0D191E',
  cloudWhite: '#EFF4F3',
} as const);

export const lightSemanticColors = Object.freeze({
  background: brandColors.softMist,
  backgroundElevated: brandColors.cloudWhite,
  surface: brandColors.cloudWhite,
  surfaceMuted: '#E7EEED',
  surfaceInteractive: '#DDE8E7',
  textPrimary: brandColors.deepAtmosphere,
  textSecondary: brandColors.calmCurrent,
  textOnBrand: brandColors.cloudWhite,
  brandPrimary: brandColors.deepAtmosphere,
  brandAccent: brandColors.calmCurrent,
  borderSubtle: '#C5D5D6',
  borderStrong: brandColors.calmCurrent,
  focusRing: brandColors.calmCurrent,
  iconPrimary: brandColors.deepAtmosphere,
  iconSecondary: brandColors.calmCurrent,
  scrim: 'rgba(13, 25, 30, 0.48)',
} as const);

export type SemanticColorRole = keyof typeof lightSemanticColors;
export type SemanticColors = Readonly<Record<SemanticColorRole, string>>;

export const darkSemanticColors = Object.freeze({
  background: brandColors.nightLayer,
  backgroundElevated: brandColors.deepAtmosphere,
  surface: brandColors.deepAtmosphere,
  surfaceMuted: '#183039',
  surfaceInteractive: '#21434A',
  textPrimary: brandColors.cloudWhite,
  textSecondary: brandColors.quietSky,
  textOnBrand: brandColors.nightLayer,
  brandPrimary: brandColors.quietSky,
  brandAccent: brandColors.quietSky,
  borderSubtle: '#345866',
  borderStrong: brandColors.quietSky,
  focusRing: brandColors.quietSky,
  iconPrimary: brandColors.cloudWhite,
  iconSecondary: brandColors.quietSky,
  scrim: 'rgba(13, 25, 30, 0.72)',
} as const satisfies SemanticColors);

export const spacing = Object.freeze({
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  '2xl': 32,
} as const);

export const typography = Object.freeze({
  display: {
    fontSize: 40,
    lineHeight: 48,
    fontWeight: '600',
  },
  titleLarge: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '700',
  },
  title: {
    fontSize: 24,
    lineHeight: 32,
    fontWeight: '600',
  },
  eyebrow: {
    fontSize: 10.5,
    lineHeight: 14,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  body: {
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '400',
  },
  bodyStrong: {
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '600',
  },
  caption: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '400',
  },
  label: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
  },
  code: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
} as const satisfies Readonly<Record<string, TextStyle>>);

export type TypographyRole = keyof typeof typography;

export const radii = Object.freeze({
  compact: 8,
  control: 12,
  card: 20,
  sheet: 28,
  pill: 999,
} as const);

export const borderWidths = Object.freeze({
  subtle: 1,
  strong: 2,
} as const);

export const layout = Object.freeze({
  minimumTouchTarget: 44,
  maxContentWidth: 800,
} as const);

export const interaction = Object.freeze({
  pressedOpacity: 0.72,
} as const);

export const standardMotion = Object.freeze({
  immediate: 0,
  fast: 120,
  normal: 200,
  deliberate: 320,
} as const);

export type MotionTokens = Readonly<Record<keyof typeof standardMotion, number>>;

export const reducedMotion = Object.freeze({
  immediate: 0,
  fast: 0,
  normal: 0,
  deliberate: 0,
} as const satisfies MotionTokens);

export type ThemeColorScheme = 'light' | 'dark';
export type SystemColorScheme = ThemeColorScheme | 'unspecified' | null | undefined;

export type KuyaraTheme = Readonly<{
  colorScheme: ThemeColorScheme;
  isDark: boolean;
  isReduceMotionEnabled: boolean;
  colors: SemanticColors;
  spacing: typeof spacing;
  typography: typeof typography;
  radii: typeof radii;
  borderWidths: typeof borderWidths;
  layout: typeof layout;
  interaction: typeof interaction;
  motion: MotionTokens;
}>;

const sharedFoundation = {
  spacing,
  typography,
  radii,
  borderWidths,
  layout,
  interaction,
} as const;

export const lightTheme = Object.freeze({
  ...sharedFoundation,
  colorScheme: 'light',
  isDark: false,
  isReduceMotionEnabled: false,
  colors: lightSemanticColors,
  motion: standardMotion,
} as const satisfies KuyaraTheme);

export const darkTheme = Object.freeze({
  ...sharedFoundation,
  colorScheme: 'dark',
  isDark: true,
  isReduceMotionEnabled: false,
  colors: darkSemanticColors,
  motion: standardMotion,
} as const satisfies KuyaraTheme);

export function resolveColorScheme(
  preference: ThemePreference,
  systemColorScheme: SystemColorScheme,
): ThemeColorScheme {
  if (preference !== 'system') {
    return preference;
  }

  return systemColorScheme === 'dark' ? 'dark' : 'light';
}

export function resolveMotionTokens(isReduceMotionEnabled: boolean): MotionTokens {
  return isReduceMotionEnabled ? reducedMotion : standardMotion;
}

export function createKuyaraTheme(
  colorScheme: ThemeColorScheme,
  isReduceMotionEnabled = false,
): KuyaraTheme {
  const baseTheme = colorScheme === 'dark' ? darkTheme : lightTheme;

  if (!isReduceMotionEnabled) {
    return baseTheme;
  }

  return Object.freeze({
    ...baseTheme,
    isReduceMotionEnabled: true,
    motion: reducedMotion,
  });
}
