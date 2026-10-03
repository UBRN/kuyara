// OKLCH for derived colours: moving a colour in lightness keeps its hue, which an sRGB
// blend does not. The garment palette and the theme's derived values share the one copy of
// the maths in domain/srgb-color.ts.
import { fromOklch, toOklch } from '@/domain/srgb-color';

export { fromOklch, linearRgb, toOklch } from '@/domain/srgb-color';

/** The same colour moved in OKLCH lightness only; hue and chroma are kept. */
export function shiftOklchLightness(h: string, dL: number): string {
  const o = toOklch(h);
  return fromOklch(o.L + dL, o.C, o.H);
}
