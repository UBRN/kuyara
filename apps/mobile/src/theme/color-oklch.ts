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

/**
 * The colour a fraction `t` of the way from `from` to `to` in OKLCH, the hue taking the
 * short way round the circle, so a ramp between two approved hues passes through no hue
 * that neither of them names.
 */
export function mixOklch(from: string, to: string, t: number): string {
  if (t <= 0) return from;
  if (t >= 1) return to;
  const a = toOklch(from);
  const b = toOklch(to);
  let hueStep = b.H - a.H;
  if (hueStep > 180) hueStep -= 360;
  if (hueStep < -180) hueStep += 360;
  return fromOklch(a.L + (b.L - a.L) * t, a.C + (b.C - a.C) * t, (a.H + hueStep * t + 360) % 360);
}
