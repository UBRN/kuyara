import { createContext, use } from 'react';

import { borderWidths } from '@/theme/theme';
import { useKuyaraTheme } from '@/theme/theme-context';

// O13, ADR 0030 section 2: the "Easier to see" switch. It is a display preference like the
// theme, so it reaches every surface through the theme provider rather than each screen
// reading the profile. Off unless a provider says otherwise.
export const EasierToSeeContext = createContext(false);

export function useEasierToSee(): boolean {
  return use(EasierToSeeContext);
}

/** The approved mode values: every garment board size cap x 1.3 and a 2.8 pt board outline. */
export const easierToSee = Object.freeze({
  boardScale: 1.3,
  boardSideMinimum: 0.05,
  boardOutline: 2.8,
  /** Kuyara-drawn primary actions, rows and chips, in points. */
  primaryActionHeight: 56,
  rowHeight: 60,
  chipHeight: 48,
  /** Today's finishing-touch drawings beside their caption, in points (16 with the mode off). */
  accessoryDrawingSize: 24,
} as const);

/** The iOS Bold Text and Increase Contrast settings, read by the theme provider. */
export type SystemVisibility = Readonly<{ boldText: boolean; increaseContrast: boolean }>;

export const SystemVisibilityContext = createContext<SystemVisibility>({ boldText: false, increaseContrast: false });

/** The two iOS settings as the theme provider last read them; Android reports both off. */
export function useSystemVisibility(): SystemVisibility {
  return use(SystemVisibilityContext);
}

/**
 * kuyara follows iOS Bold Text and Increase Contrast even with the switch
 * off. Heavier text follows Bold Text or the switch; higher contrast follows Increase
 * Contrast or the switch. The larger board and targets follow the switch alone.
 */
export function useVisibility(): Readonly<{ heavierText: boolean; higherContrast: boolean }> {
  const switchOn = use(EasierToSeeContext);
  const system = use(SystemVisibilityContext);
  return { heavierText: switchOn || system.boldText, higherContrast: switchOn || system.increaseContrast };
}

/**
 * The stronger boundary: a kuyara-drawn control's 2-point edge in
 * `borderStrong`, drawn while higher contrast applies and absent otherwise, so a screen with
 * the mode off renders exactly as before. System-drawn controls keep their native look.
 */
export function useStrongEdge(): Readonly<{ borderColor: string; borderWidth: number }> | null {
  const { higherContrast } = useVisibility();
  const { colors } = useKuyaraTheme();
  return higherContrast ? { borderColor: colors.borderStrong, borderWidth: borderWidths.strong } : null;
}

const HEAVIER_WEIGHT: Readonly<Record<string, '600' | '700' | '800'>> = {
  '400': '600', '500': '600', '600': '700', '700': '800',
};

/** One weight step up (regular to semibold, semibold to bold, bold to heavy). */
export function heavierWeight(weight: string | undefined): '600' | '700' | '800' | undefined {
  return weight === undefined ? undefined : HEAVIER_WEIGHT[weight];
}
