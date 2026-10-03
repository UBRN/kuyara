// The one home of sRGB colour maths on `#RRGGBB` hex colours: reading and writing the hex form,
// linearising the channels, and the OKLab and OKLCH spaces built on them. Callers keep their
// own error wording and their own use of the numbers.

const srgbHexPattern = /^#[0-9a-f]{6}$/i;

/** Whether `value` is a `#RRGGBB` colour: six hex digits in either case, nothing around them. */
export function isSrgbHex(value: unknown): value is string {
  return typeof value === 'string' && srgbHexPattern.test(value);
}

/** A `#RRGGBB` colour's red, green and blue channels, 0 to 255. The colour is not validated. */
export const hexChannels = (hex: string): number[] =>
  [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16));

/** Channels, 0 to 255 and clamped and rounded to whole numbers, written as an uppercase `#RRGGBB`. */
export const channelsToHex = (channels: readonly number[]): string =>
  `#${channels.map((value) => Math.round(Math.max(0, Math.min(255, value))).toString(16).padStart(2, '0')).join('')}`.toUpperCase();

const linearise = (value: number): number => {
  const v = value / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

/** A linear sRGB channel, 0 to 1, back to a gamma-encoded one, 0 to 255. */
export const delinearise = (v: number): number =>
  255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);

/** A `#RRGGBB` colour's linear sRGB channels, 0 to 1. */
export const linearRgb = (hex: string): number[] => hexChannels(hex).map(linearise);

/** A `#RRGGBB` colour in OKLab: lightness, then the green-red and blue-yellow axes. */
export function toOklab(hex: string): readonly [number, number, number] {
  const [r, g, b] = linearRgb(hex);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** A `#RRGGBB` colour in OKLCH: lightness, chroma, and hue in degrees. */
export function toOklch(hex: string): { L: number; C: number; H: number } {
  const [L, A, B] = toOklab(hex);
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
  const encode = (rgb: readonly number[]) =>
    channelsToHex(rgb.map((v) => delinearise(Math.max(0, Math.min(1, v)))));
  let c = C;
  for (let i = 0; i < 40; i++) {
    const rgb = rawRgb(lightness, c, H);
    if (rgb.every((v) => v >= -1e-4 && v <= 1 + 1e-4)) return encode(rgb);
    c *= 0.9;
  }
  return encode(rawRgb(lightness, 0, H));
}
