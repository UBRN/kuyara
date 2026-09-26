import type { TextStyle, ViewStyle } from 'react-native';

import type { ThemePreference } from '@/domain/preferences';

import { blend } from './color-blend';
import { shiftOklchLightness } from './color-oklch';

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
  textSecondary: '#2F4650',
  textOnBrand: brandColors.cloudWhite,
  textOnPrimaryFill: brandColors.cloudWhite,
  brandPrimary: brandColors.deepAtmosphere,
  brandAccent: brandColors.calmCurrent,
  primaryFill: brandColors.deepAtmosphere,
  // The button system's derived fill steps (O5): a pressed button steps its fill, never
  // its opacity, and a tonal control on a raised sheet keeps the ground's tonal fill here.
  primaryFillPressed: '#334B55',
  surfaceInteractivePressed: '#CDD9D9',
  controlTonalRaised: '#DDE8E7',
  borderSubtle: '#CCD2D4',
  stage: '#D7DCDD',
  borderDefined: '#5C7A83',
  borderStrong: brandColors.calmCurrent,
  focusRing: brandColors.calmCurrent,
  iconPrimary: brandColors.deepAtmosphere,
  iconSecondary: '#2F4650',
  // Derived semantic values keep status inks within ±0.8 of brandAccent's
  // contrast against this appearance's surface.
  successInk: '#216048',
  successContainer: '#DCEBE3',
  warningInk: '#7A4F12',
  warningContainer: '#F2E6CE',
  dangerInk: '#9B2C2C',
  dangerContainer: '#F8E3E1',
  dangerContainerPressed: '#EFD1CF',
  // The provenance pair joins the same band: it records where a recommendation came from,
  // so it is a controlled role rather than an accent or a status verdict.
  provenanceInk: '#57518F',
  provenanceContainer: '#E9E6F6',
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

/**
 * One ink per condition, and a second one after sunset for the three conditions that show
 * the sky itself. They are a closed content encoding, derived like `warningInk` is: no new
 * brand colour, and never an accent.
 */
export type ConditionInkRole =
  | 'clearDay'
  | 'mostlyClearDay'
  | 'clearNight'
  | 'mostlyClearNight'
  | 'partlyCloudyDay'
  | 'partlyCloudyNight'
  | 'cloudy'
  | 'fog'
  | 'drizzle'
  | 'rain'
  | 'heavyRain'
  | 'sleet'
  | 'snow'
  | 'thunderstorm'
  | 'neutral';

type ConditionColors = Readonly<Record<ConditionInkRole, string>>;

/**
 * The first-generation runway's field, one flat colour per weather group (owner decision
 * O1). They belong to the runway alone: no other surface may read them, which
 * `runway-palette.test.mjs` holds with a consumer grep.
 */
export type RunwayField = 'clear' | 'cloudy' | 'rain' | 'snow';

type RunwayColors = Readonly<Record<RunwayField, string>>;

export const darkSemanticColors = Object.freeze({
  background: brandColors.nightLayer,
  backgroundElevated: blend(brandColors.deepAtmosphere, brandColors.quietSky, 0.08),
  surface: brandColors.deepAtmosphere,
  surfaceMuted: '#183039',
  surfaceInteractive: '#21434A',
  textPrimary: brandColors.cloudWhite,
  textSecondary: '#B0C0C5',
  textOnBrand: brandColors.nightLayer,
  textOnPrimaryFill: brandColors.cloudWhite,
  brandPrimary: brandColors.quietSky,
  brandAccent: brandColors.quietSky,
  primaryFill: blend(brandColors.calmCurrent, brandColors.quietSky, 0.15),
  primaryFillPressed: '#33646D',
  surfaceInteractivePressed: '#315158',
  // 16 % Quiet Sky over the dark sheet, so a tonal fill still reads on the raised plane.
  controlTonalRaised: '#33525E',
  borderSubtle: '#26393F',
  stage: '#122A35',
  // Lifted from #527E90 so the boundary still clears 3:1 on the lighter elevated plane.
  borderDefined: '#5E899A',
  borderStrong: brandColors.quietSky,
  focusRing: brandColors.quietSky,
  iconPrimary: brandColors.cloudWhite,
  iconSecondary: '#B0C0C5',
  // Derived semantic values keep status inks within ±0.8 of brandAccent's
  // contrast against this appearance's surface.
  successInk: '#7FD3AE',
  successContainer: '#0B2620',
  warningInk: '#EABB6E',
  warningContainer: '#292010',
  dangerInk: '#F2A6A2',
  dangerContainer: '#301D1B',
  dangerContainerPressed: '#432B28',
  provenanceInk: '#C3BDEE',
  provenanceContainer: '#2C1A38',
  scrim: 'rgba(13, 25, 30, 0.72)',
} as const satisfies SemanticColors);

const lightAtmosphere = Object.freeze({
  neutral: lightSemanticColors.stage,
  clearDay: blend(brandColors.quietSky, brandColors.cloudWhite, 0.549),
  veiledDay: blend(brandColors.calmCurrent, brandColors.softMist, 0.83),
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

// Today's contact shade (owner decision P2): one flat opaque ellipse under each garment on
// the primary stage, in the stage's own colour moved down in OKLCH lightness only, so it
// adds no hue, no alpha and no new brand colour. The dark stage has less room below it
// before the shade meets the page ground, so its step is smaller and the shade is
// decorative there (Law 3). The ink outline, not the shade, carries every garment's edge.
const contactShadeStep = { light: -0.06, dark: -0.045 } as const;
const shadeEach = (atmosphere: AtmosphereColors, step: number): AtmosphereColors => Object.freeze(
  Object.fromEntries(Object.entries(atmosphere).map(([state, stage]) => [state, shiftOklchLightness(stage, step)])),
) as AtmosphereColors;
const lightContactShade = shadeEach(lightAtmosphere, contactShadeStep.light);
const darkContactShade = shadeEach(darkAtmosphere, contactShadeStep.dark);

// Fog reads green rather than grey so it can never be mistaken for cloud, and snow is the
// least saturated of the falling family so it can never be mistaken for rain. Every value
// clears 3:1 on the atmosphere planes its own condition can put behind it, and on surface.
const lightCondition = Object.freeze({
  clearDay: '#90650E',
  mostlyClearDay: '#AE5713',
  clearNight: '#434F89',
  mostlyClearNight: '#59419F',
  partlyCloudyDay: '#206F6C',
  partlyCloudyNight: '#743974',
  cloudy: '#315272',
  fog: '#2A5546',
  drizzle: '#134853',
  rain: '#12466E',
  heavyRain: '#1A3F89',
  sleet: '#3F3597',
  snow: '#2D4653',
  thunderstorm: '#5B2D7B',
  neutral: lightSemanticColors.textPrimary,
} as const satisfies ConditionColors);

const darkCondition = Object.freeze({
  clearDay: '#D3A445',
  mostlyClearDay: '#DC9C6A',
  clearNight: '#A3ABD2',
  mostlyClearNight: '#B2A4DA',
  partlyCloudyDay: '#4DCBC7',
  partlyCloudyNight: '#CE9CCE',
  cloudy: '#8DADCE',
  fog: '#6FB89E',
  drizzle: '#45BCD3',
  rain: '#77B2DF',
  heavyRain: '#8FACE5',
  sleet: '#AAA4DF',
  snow: '#8BAFC1',
  thunderstorm: '#C29EDB',
  neutral: darkSemanticColors.textPrimary,
} as const satisfies ConditionColors);

const lightRunway = Object.freeze({
  clear: '#F1DDA8',
  cloudy: '#C7D0DD',
  rain: '#7FB1CC',
  snow: '#D5E5EE',
} as const satisfies RunwayColors);

const darkRunway = Object.freeze({
  clear: '#1B3350',
  cloudy: '#1C2B37',
  rain: '#0E3A52',
  snow: '#193344',
} as const satisfies RunwayColors);

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

// Law 7's ambient role: a loop that never resolves, so its duration is not a transition
// but a tempo. The step follows what the loop depicts, so the same drawing reads as
// drizzle or as a downpour without changing a colour or a shape.
export type AmbientIntensity = 'calm' | 'moderate' | 'intense';
type AmbientMotionTokens = Readonly<Record<AmbientIntensity, number>>;

export const standardMotion = Object.freeze({
  immediate: 0,
  fast: 120,
  normal: 200,
  deliberate: 320,
  // Law 7's stagger role: the step between two pieces of content arriving in reading
  // order. It is a delay between transitions rather than a transition, so it stays
  // well under `fast`; content reads as one arrival instead of a queue.
  stagger: 45,
  ambient: Object.freeze({
    calm: 1500,
    moderate: 1000,
    intense: 650,
  } as const satisfies AmbientMotionTokens),
} as const);

export type MotionTokens =
  & Readonly<Record<Exclude<keyof typeof standardMotion, 'ambient'>, number>>
  & Readonly<{ ambient: AmbientMotionTokens }>;

export type SpringRole = Readonly<{ duration: number; dampingRatio: number }>;

export const spatialSpring = Object.freeze({
  duration: 550,
  dampingRatio: 0.825,
} as const satisfies SpringRole);

// Law 7's second spring role: garment pieces landing on a board overshoot once, because
// the outfit is the product's hero and a hero that arrives flat reads as a list item.
// 550 ms and 0.65 were kept after watching the Today hero pieces rise on the Simulator:
// one visible reversal, no second bounce; only `components/ui` consumes it.
export const arrivalSpring = Object.freeze({
  duration: 550,
  dampingRatio: 0.65,
} as const satisfies SpringRole);

export type ThemeColorScheme = 'light' | 'dark';
export type SystemColorScheme = ThemeColorScheme | 'unspecified' | null | undefined;

export type KuyaraTheme = Readonly<{
  colorScheme: ThemeColorScheme;
  isDark: boolean;
  colors: SemanticColors;
  atmosphere: AtmosphereColors;
  contactShade: AtmosphereColors;
  condition: ConditionColors;
  runway: RunwayColors;
  spacing: typeof spacing;
  typography: typeof typography;
  radii: typeof radii;
  borderWidths: typeof borderWidths;
  layout: typeof layout;
  interaction: typeof interaction;
  elevation: ElevationTokens;
  motion: MotionTokens;
  springs: Readonly<{ spatial: SpringRole; arrival: SpringRole }>;
}>;

const sharedFoundation = {
  spacing,
  typography,
  radii,
  borderWidths,
  layout,
  interaction,
  springs: Object.freeze({ spatial: spatialSpring, arrival: arrivalSpring }),
} as const;

export const lightTheme = Object.freeze({
  ...sharedFoundation,
  colorScheme: 'light',
  isDark: false,
  colors: lightSemanticColors,
  atmosphere: lightAtmosphere,
  contactShade: lightContactShade,
  condition: lightCondition,
  runway: lightRunway,
  elevation: lightElevation,
  motion: standardMotion,
} as const satisfies KuyaraTheme);

export const darkTheme = Object.freeze({
  ...sharedFoundation,
  colorScheme: 'dark',
  isDark: true,
  colors: darkSemanticColors,
  atmosphere: darkAtmosphere,
  contactShade: darkContactShade,
  condition: darkCondition,
  runway: darkRunway,
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

export function createKuyaraTheme(colorScheme: ThemeColorScheme): KuyaraTheme {
  return colorScheme === 'dark' ? darkTheme : lightTheme;
}
