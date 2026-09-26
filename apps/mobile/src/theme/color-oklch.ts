// OKLCH for derived colours: moving a colour in lightness keeps its hue, which an sRGB
// blend does not. The garment palette and the theme's derived values share this one copy.
const hx = (h: string): number[] => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const toHex = (c: readonly number[]): string =>
  `#${c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
const lin = (value: number): number => {
  const v = value / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const unlin = (v: number): number => 255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);

/** A `#RRGGBB` colour's linear sRGB channels, 0 to 1. */
export const linearRgb = (h: string): number[] => hx(h).map(lin);

export function toOklch(h: string): { L: number; C: number; H: number } {
  const [r, g, b] = linearRgb(h);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return { L, C: Math.hypot(A, B), H: (Math.atan2(B, A) * 180 / Math.PI + 360) % 360 };
}
function rawRgb(L: number, C: number, H: number): number[] {
  const A = C * Math.cos(H * Math.PI / 180), B = C * Math.sin(H * Math.PI / 180);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
}
// Back to sRGB; out-of-gamut colours lose chroma, never hue, until they fit.
export function fromOklch(L: number, C: number, H: number): string {
  const lightness = Math.max(0, Math.min(1, L));
  let c = C;
  for (let i = 0; i < 40; i++) {
    const rgb = rawRgb(lightness, c, H);
    if (rgb.every((v) => v >= -1e-4 && v <= 1 + 1e-4)) return toHex(rgb.map((v) => unlin(Math.max(0, Math.min(1, v)))));
    c *= 0.9;
  }
  return toHex(rawRgb(lightness, 0, H).map((v) => unlin(Math.max(0, Math.min(1, v)))));
}

/** The same colour moved in OKLCH lightness only; hue and chroma are kept. */
export function shiftOklchLightness(h: string, dL: number): string {
  const o = toOklch(h);
  return fromOklch(o.L + dL, o.C, o.H);
}
