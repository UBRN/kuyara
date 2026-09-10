import type { TextStyle, ViewStyle } from 'react-native';

import type { ThemePreference } from '@/domain/preferences';

import { blend } from './color-blend';

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
  // Direction E carries hierarchy through garments, type and space (ADR 0021).
  background: brandColors.softMist,
  backgroundElevated: brandColors.softMist,
  surface: '#FFFFFF',
  surfaceMuted: '#E7EEED',
  surfaceInteractive: '#DDE8E7',
  textPrimary: brandColors.deepAtmosphere,
  textSecondary: '#576B73',
  textOnBrand: brandColors.cloudWhite,
  textOnPrimaryFill: brandColors.cloudWhite,
  brandPrimary: brandColors.deepAtmosphere,
  brandAccent: brandColors.calmCurrent,
  primaryFill: brandColors.deepAtmosphere,
  borderSubtle: '#CCD2D4',
  stage: '#D7DCDD',
  borderDefined: '#5C7A83',
  borderStrong: brandColors.calmCurrent,
  focusRing: brandColors.calmCurrent,
  iconPrimary: brandColors.deepAtmosphere,
  iconSecondary: '#576B73',
  // Derived semantic values keep status inks within ±0.8 of brandAccent's
  // contrast against this appearance's surface.
  successInk: '#216048',
  successContainer: '#DCEBE3',
  warningInk: '#7A4F12',
  warningContainer: '#F2E6CE',
  dangerInk: '#9B2C2C',
  dangerContainer: '#F8E3E1',
  scrim: 'rgba(13, 25, 30, 0.48)',
} as const);

export type SemanticColorRole = keyof typeof lightSemanticColors;
export type SemanticColors = Readonly<Record<SemanticColorRole, string>>;

export type AtmosphereState =
  | 'neutral'
  | 'clearDay'
  | 'veiledDay'
  | 'fallingDay'
  | 'clearNight'
  | 'veiledNight'
  | 'fallingNight';

type AtmosphereColors = Readonly<Record<AtmosphereState, string>>;

export const darkSemanticColors = Object.freeze({
  background: brandColors.nightLayer,
  backgroundElevated: blend(brandColors.deepAtmosphere, brandColors.quietSky, 0.08),
  surface: brandColors.deepAtmosphere,
  surfaceMuted: '#183039',
  surfaceInteractive: '#21434A',
  textPrimary: brandColors.cloudWhite,
  textSecondary: '#8FA5AC',
  textOnBrand: brandColors.nightLayer,
  textOnPrimaryFill: brandColors.cloudWhite,
  brandPrimary: brandColors.quietSky,
  brandAccent: brandColors.quietSky,
  primaryFill: blend(brandColors.calmCurrent, brandColors.quietSky, 0.15),
  borderSubtle: '#26393F',
  stage: '#122A35',
  // Lifted from #527E90 so the boundary still clears 3:1 on the lighter elevated plane.
  borderDefined: '#5E899A',
  borderStrong: brandColors.quietSky,
  focusRing: brandColors.quietSky,
  iconPrimary: brandColors.cloudWhite,
  iconSecondary: '#8FA5AC',
  // Derived semantic values keep status inks within ±0.8 of brandAccent's
  // contrast against this appearance's surface.
  successInk: '#7FD3AE',
  successContainer: '#0B2620',
  warningInk: '#EABB6E',
  warningContainer: '#292010',
  dangerInk: '#F2A6A2',
  dangerContainer: '#301D1B',
  scrim: 'rgba(13, 25, 30, 0.72)',
} as const satisfies SemanticColors);

const lightAtmosphere = Object.freeze({
  neutral: lightSemanticColors.stage,
  clearDay: blend(brandColors.quietSky, brandColors.cloudWhite, 0.549),
  veiledDay: blend(brandColors.calmCurrent, brandColors.softMist, 0.756),
  fallingDay: blend(brandColors.calmCurrent, brandColors.quietSky, 0.943),
  clearNight: blend(brandColors.deepAtmosphere, brandColors.quietSky, 0.888),
  veiledNight: blend(brandColors.deepAtmosphere, brandColors.softMist, 0.645),
  fallingNight: blend(brandColors.deepAtmosphere, brandColors.quietSky, 0.758),
} as const satisfies AtmosphereColors);

const darkAtmosphere = Object.freeze({
  neutral: darkSemanticColors.stage,
  clearDay: darkSemanticColors.stage,
  veiledDay: darkSemanticColors.stage,
  fallingDay: darkSemanticColors.stage,
  clearNight: darkSemanticColors.stage,
  veiledNight: darkSemanticColors.stage,
  fallingNight: darkSemanticColors.stage,
} as const satisfies AtmosphereColors);

export const spacing = Object.freeze({
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  '2xl': 32,
} as const);

export const typography = Object.freeze({
  // ADR 0017: three separated steps above body, with negative tracking at the top so the
  // system face reads as a hero rather than a large label.
  display: {
    fontSize: 56,
    lineHeight: 56,
    fontWeight: '700',
    letterSpacing: -1.5,
  },
  titleLarge: {
    fontSize: 34,
    lineHeight: 41,
    fontWeight: '700',
    letterSpacing: -0.6,
  },
  title: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '600',
    letterSpacing: -0.2,
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
  disabledOpacity: 0.48,
} as const);

export type ElevationTokens = Readonly<
  Record<
    'raised' | 'chrome',
    Readonly<
      Required<
        Pick<
          ViewStyle,
          'shadowColor' | 'shadowOffset' | 'shadowOpacity' | 'shadowRadius' | 'elevation'
        >
      >
    >
  >
>;

const lightElevation = Object.freeze({
  raised: {
    shadowColor: brandColors.nightLayer,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 3,
  },
  chrome: {
    shadowColor: brandColors.nightLayer,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.16,
    shadowRadius: 10,
    elevation: 5,
  },
} as const satisfies ElevationTokens);

const darkElevation = Object.freeze({
  raised: {
    shadowColor: brandColors.nightLayer,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  chrome: {
    shadowColor: brandColors.nightLayer,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 10,
    elevation: 4,
  },
} as const satisfies ElevationTokens);

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
  atmosphere: AtmosphereColors;
  spacing: typeof spacing;
  typography: typeof typography;
  radii: typeof radii;
  borderWidths: typeof borderWidths;
  layout: typeof layout;
  interaction: typeof interaction;
  elevation: ElevationTokens;
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
  atmosphere: lightAtmosphere,
  elevation: lightElevation,
  motion: standardMotion,
} as const satisfies KuyaraTheme);

export const darkTheme = Object.freeze({
  ...sharedFoundation,
  colorScheme: 'dark',
  isDark: true,
  isReduceMotionEnabled: false,
  colors: darkSemanticColors,
  atmosphere: darkAtmosphere,
  elevation: darkElevation,
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
