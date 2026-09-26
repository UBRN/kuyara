import type { AccessibilityState } from 'react-native';

import {
  type KuyaraTheme,
  type SemanticColorRole,
  type TypographyRole,
  borderWidths,
  spacing,
  typography,
} from '../../theme/theme';

export type SurfaceVariant = 'default' | 'muted' | 'elevated' | 'interactive';
export type ButtonVariant = 'prominent' | 'tonal' | 'plain' | 'destructive';
export type ButtonSize = 'large' | 'medium' | 'small';
export type ButtonState = Readonly<{ pressed: boolean; disabled: boolean; raised?: boolean }>;
export type PillTone = 'accent-filled' | 'bordered' | 'provenance' | 'muted';

// ADR 0028 section 2, the list-row anatomy: a 28-point tile with a 20-point glyph and a
// 7-point radius (a quarter of the tile) at the default text size, scaling together by
// the capped `controlScale` from `useTextScaling` above `fontScale` 1.5.
const LIST_ROW_BASE_TILE_SIZE = 28;
const LIST_ROW_BASE_GLYPH_SIZE = 20;
// 7 is a quarter of 28; the radius keeps that ratio as the tile scales.
const LIST_ROW_TILE_RADIUS_RATIO = 0.25;

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

// O14 dark cards B: in dark the kuyara card is the elevated plane, 1.511:1 to the ground
// against the old 1.276:1, and it drops the hairline, which measured only 1.16:1 and added
// nothing. Light keeps the white card and its hairline. Native list cells are not kuyara
// cards and keep the system's grey (ADR 0019, ADR 0030).
export function surfaceColorRole(theme: KuyaraTheme, variant: SurfaceVariant): SemanticColorRole {
  return variant === 'default' && theme.isDark ? 'backgroundElevated' : surfaceColorRoleByVariant[variant];
}

/** The fill a kuyara card paints, for content that knocks out or fades to the card. */
export function resolveCardFill(theme: KuyaraTheme): string {
  return theme.colors[surfaceColorRole(theme, 'default')];
}

export function resolveSurfaceColors(theme: KuyaraTheme, variant: SurfaceVariant) {
  const colors = {
    backgroundColor: theme.colors[surfaceColorRole(theme, variant)],
    borderColor: variant === 'default' && theme.isDark ? 'transparent' : theme.colors.borderSubtle,
  } as const;

  if (variant === 'elevated') {
    return { ...colors, ...theme.elevation.raised } as const;
  }

  return colors;
}

// The O5 button system: every button is a capsule, and a size names its drawn height,
// its horizontal padding, its label role and its leading icon. Small is drawn at 36 and
// reaches the 44-point target through hit slop.
export const buttonGeometry = Object.freeze({
  large: { height: 50, paddingHorizontal: 20, labelRole: 'bodyStrong', iconSize: 20, gap: 8 },
  medium: { height: 44, paddingHorizontal: 16, labelRole: 'bodyStrong', iconSize: 20, gap: 8 },
  small: { height: 36, paddingHorizontal: 14, labelRole: 'label', iconSize: 16, gap: 6 },
} as const satisfies Readonly<Record<ButtonSize, Readonly<{
  height: number;
  paddingHorizontal: number;
  labelRole: TypographyRole;
  iconSize: number;
  gap: number;
}>>>);

/**
 * Fill and ink for one button state. Pressed steps the fill, never the opacity; disabled
 * is the muted fill with the defined-border ink, readable and clearly inert. `raised` is a
 * tonal control drawn on a sheet, where the dark appearance lifts the tonal fill.
 */
export function resolveButtonColors(
  theme: KuyaraTheme,
  variant: ButtonVariant,
  { disabled, pressed, raised = false }: ButtonState,
) {
  const { colors } = theme;
  const tonalFill = raised ? colors.controlTonalRaised : colors.surfaceInteractive;

  if (disabled) {
    return {
      backgroundColor: variant === 'plain' ? 'transparent' : colors.surfaceMuted,
      textColor: colors.borderDefined,
    } as const;
  }

  if (variant === 'prominent') {
    return {
      backgroundColor: pressed ? colors.primaryFillPressed : colors.primaryFill,
      textColor: colors.textOnPrimaryFill,
    } as const;
  }

  if (variant === 'destructive') {
    return {
      backgroundColor: pressed ? colors.dangerContainerPressed : colors.dangerContainer,
      textColor: colors.dangerInk,
    } as const;
  }

  if (variant === 'tonal') {
    return {
      backgroundColor: pressed ? colors.surfaceInteractivePressed : tonalFill,
      textColor: colors.brandAccent,
    } as const;
  }

  // Plain draws no fill; its press shows the tonal capsule.
  return {
    backgroundColor: pressed ? tonalFill : 'transparent',
    textColor: colors.brandAccent,
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

  // Law 4's controlled role band: the container is the border too, so the badge reads as one
  // quiet block rather than an outlined chip competing with the accent budget.
  if (tone === 'provenance') {
    return {
      backgroundColor: theme.colors.provenanceContainer,
      borderColor: theme.colors.provenanceContainer,
      textColorRole: 'provenanceInk',
    } as const;
  }

  // The neutral record: the Apple Intelligence badge sits on the muted surface in the primary
  // ink, so it never reads as the purple Worker badge (M1).
  if (tone === 'muted') {
    return {
      backgroundColor: theme.colors.surfaceMuted,
      borderColor: theme.colors.surfaceMuted,
      textColorRole: 'textPrimary',
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

export function resolveListRowTileGeometry(controlScale: number) {
  const size = LIST_ROW_BASE_TILE_SIZE * controlScale;

  return {
    size,
    glyphSize: LIST_ROW_BASE_GLYPH_SIZE * controlScale,
    borderRadius: size * LIST_ROW_TILE_RADIUS_RATIO,
  } as const;
}

export function resolveListRowSeparatorInset(controlScale: number): number {
  return spacing.lg + LIST_ROW_BASE_TILE_SIZE * controlScale + spacing.md;
}

export function resolveListRowGroupColors(theme: KuyaraTheme) {
  if (theme.isDark) {
    return {
      backgroundColor: theme.colors.backgroundElevated,
      borderColor: 'transparent',
      borderWidth: 0,
    } as const;
  }

  return {
    backgroundColor: 'transparent',
    borderColor: theme.colors.borderDefined,
    borderWidth: borderWidths.subtle,
  } as const;
}
