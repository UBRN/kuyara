import type { OutfitSlot } from '@/features/recommendation/domain/outfit-composition';
import type { SemanticColors, ThemeColorScheme } from '@/theme/theme';

import { resolveGarmentRenderFills } from './garment-render-fills';

// The first-generation runway's legibility clamp (owner decision O1).
// A dressed fill passes when it separates from the field on either route: the fill alone
// clears 3:1 against the field (WCAG 1.4.11), or Law 3's garment fill step holds (1.20:1
// off the field) with the ink outline clearing 3:1 over the fill. A fill that passes
// neither moves in OKLCH lightness only, by the smallest passing step, hue unchanged.

const FILL_ALONE = 3;
const FILL_STEP = 1.2;
const OUTLINE = 3;
const L_STEP = 0.005;

function channels(hex: string): readonly number[] {
  return [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16));
}

const toLinear = (value: number) => {
  const scaled = value / 255;
  return scaled <= 0.04045 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
};
const fromLinear = (value: number) =>
  255 * (value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055);

function toHex(rgb: readonly number[]): string {
  return `#${rgb.map((value) => Math.round(Math.max(0, Math.min(255, value))).toString(16).padStart(2, '0')).join('')}`
    .toUpperCase();
}

function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map(toLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

function toOklch(hex: string): Readonly<{ L: number; C: number; H: number }> {
  const [r, g, b] = channels(hex).map(toLinear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    C: Math.hypot(A, B),
    H: (Math.atan2(B, A) * 180 / Math.PI + 360) % 360,
  };
}

function linearFromOklch(L: number, C: number, H: number): readonly number[] {
  const A = C * Math.cos(H * Math.PI / 180);
  const B = C * Math.sin(H * Math.PI / 180);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

// Out of gamut, the colour gives up chroma, never hue, until it fits.
function fromOklch(L: number, C: number, H: number): string {
  const lightness = Math.max(0, Math.min(1, L));
  let chroma = C;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const linear = linearFromOklch(lightness, chroma, H);
    if (linear.every((value) => value >= -1e-4 && value <= 1 + 1e-4)) {
      return toHex(linear.map((value) => fromLinear(Math.max(0, Math.min(1, value)))));
    }
    chroma *= 0.9;
  }
  return toHex(linearFromOklch(lightness, 0, H).map((value) => fromLinear(Math.max(0, Math.min(1, value)))));
}

function passes(fill: string, field: string, ink: string): boolean {
  const step = contrastRatio(fill, field);
  return step >= FILL_ALONE || (step >= FILL_STEP && contrastRatio(ink, fill) >= OUTLINE);
}

export function clampRunwayFill(fill: string, field: string, ink: string): string {
  if (passes(fill, field, ink)) return fill;
  const { L, C, H } = toOklch(fill);
  for (let distance = L_STEP; distance <= 1; distance += L_STEP) {
    for (const direction of [1, -1]) {
      const lightness = L + direction * distance;
      if (lightness < 0 || lightness > 1) continue;
      const moved = fromOklch(lightness, C, H);
      if (passes(moved, field, ink)) return moved;
    }
  }
  return fill;
}

/**
 * Every dressed piece's fill on the runway field: the boards' own derivation at the Today
 * step, then the clamp against the field. This is the one place the runway's colour rule
 * lives; the board only draws what it returns.
 */
export function resolveRunwayFills({
  optionId,
  slots,
  field,
  colors,
  colorScheme,
}: Readonly<{
  optionId: string;
  slots: readonly OutfitSlot[];
  field: string;
  colors: Pick<SemanticColors, 'textPrimary'>;
  colorScheme: ThemeColorScheme;
}>): ReadonlyMap<OutfitSlot, string> {
  const fills = resolveGarmentRenderFills({
    optionId,
    pieces: slots.map((slot) => ({ slot, colorFamily: null })),
    plane: field,
    colors,
    colorScheme,
    step: 'today',
  });
  return new Map([...fills].map(([slot, fill]) => [slot, clampRunwayFill(fill, field, colors.textPrimary)]));
}
