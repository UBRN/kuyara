import type { ColorFamily } from '@/features/catalog/domain/garment-taxonomy';
import { blend } from '@/theme/color-blend';
import type { SemanticColors, ThemeColorScheme } from '@/theme/theme';

import { colorFamilyFills } from './color-family-fill';

// Design language Law 3's garment fill step for a drawing that is not an outfit piece: a
// Closet record without a recorded colour, a day-type tile, the cool-spell layer. It is
// derived from the plane, so it steps at least 1.20:1 off it with the outline clearing
// 3.0:1 over the fill, and carries no hex of its own. Outfit pieces take their palette
// (garment-palette.ts) instead.
export const NEUTRAL_GARMENT_FILL = 0.13;

/**
 * A personal record's main fill: its recorded colour family (the Closet's content colour,
 * two stops for `multicolor`), or the neutral step off the plane when it has none. A record
 * is never coloured by a guess.
 */
export function resolveGarmentTileFill({
  colorFamily,
  plane,
  colors,
  colorScheme,
}: Readonly<{
  colorFamily: ColorFamily | null;
  plane: string;
  colors: Pick<SemanticColors, 'textPrimary'>;
  colorScheme: ThemeColorScheme;
}>): string | readonly [string, string] {
  return colorFamily === null
    ? blend(plane, colors.textPrimary, NEUTRAL_GARMENT_FILL)
    : colorFamilyFills[colorScheme][colorFamily];
}
