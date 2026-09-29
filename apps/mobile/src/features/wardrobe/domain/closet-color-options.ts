import type { ColorFamily } from '@/features/catalog/domain/garment-taxonomy';

export type ClosetColorChoice =
  | Readonly<{ kind: 'option'; id: string }>
  | Readonly<{ kind: 'custom'; hex: string }>;

export type ClosetSolidSwatch = Readonly<{
  id: string;
  kind: 'solid';
  hex: string;
  family: ColorFamily;
}>;

export type ClosetFixedOption = Readonly<{
  id: string;
  kind: 'two-color' | 'pattern';
  hexes: readonly string[];
  family: ColorFamily;
}>;

export const closetSolidSwatches: readonly ClosetSolidSwatch[] = [
  { id: 'white', kind: 'solid', hex: '#F4F3EE', family: 'white' },
  { id: 'ecru', kind: 'solid', hex: '#E8DEC8', family: 'beige' },
  { id: 'stone', kind: 'solid', hex: '#D0C3A8', family: 'beige' },
  { id: 'sand', kind: 'solid', hex: '#C8AE86', family: 'beige' },
  { id: 'straw', kind: 'solid', hex: '#D9C28E', family: 'beige' },
  { id: 'camel', kind: 'solid', hex: '#B7854D', family: 'brown' },
  { id: 'tan_leather', kind: 'solid', hex: '#96673C', family: 'brown' },
  { id: 'chocolate', kind: 'solid', hex: '#4E3526', family: 'brown' },
  { id: 'light_grey', kind: 'solid', hex: '#CACECE', family: 'gray' },
  { id: 'heather_grey', kind: 'solid', hex: '#A6AAAC', family: 'gray' },
  { id: 'charcoal', kind: 'solid', hex: '#3E434A', family: 'gray' },
  { id: 'black', kind: 'solid', hex: '#25272B', family: 'black' },
  { id: 'navy', kind: 'solid', hex: '#26334F', family: 'blue' },
  { id: 'indigo_denim', kind: 'solid', hex: '#33507A', family: 'blue' },
  { id: 'mid_wash_denim', kind: 'solid', hex: '#5A7DA7', family: 'blue' },
  { id: 'light_wash_denim', kind: 'solid', hex: '#9BB5D1', family: 'blue' },
  { id: 'oxford_blue', kind: 'solid', hex: '#BACFE3', family: 'blue' },
  { id: 'sky_blue', kind: 'solid', hex: '#93BDDF', family: 'blue' },
  { id: 'cobalt', kind: 'solid', hex: '#2F5BA6', family: 'blue' },
  { id: 'black_denim', kind: 'solid', hex: '#303338', family: 'black' },
  { id: 'sage', kind: 'solid', hex: '#93A88C', family: 'green' },
  { id: 'olive', kind: 'solid', hex: '#65663A', family: 'green' },
  { id: 'forest_green', kind: 'solid', hex: '#2F4E3E', family: 'green' },
  { id: 'mustard', kind: 'solid', hex: '#C7982F', family: 'yellow' },
  { id: 'rain_yellow', kind: 'solid', hex: '#E5BD2F', family: 'yellow' },
  { id: 'terracotta', kind: 'solid', hex: '#C26A46', family: 'orange' },
  { id: 'rust', kind: 'solid', hex: '#AE4F2B', family: 'orange' },
  { id: 'tomato_red', kind: 'solid', hex: '#C13C31', family: 'red' },
  { id: 'burgundy', kind: 'solid', hex: '#6B2534', family: 'red' },
  { id: 'blush', kind: 'solid', hex: '#E5C1BD', family: 'pink' },
  { id: 'dusty_rose', kind: 'solid', hex: '#CD9597', family: 'pink' },
  { id: 'lavender', kind: 'solid', hex: '#B7A6CF', family: 'purple' },
  { id: 'plum', kind: 'solid', hex: '#5B3A5E', family: 'purple' },
];

export const closetColorOptions: readonly ClosetFixedOption[] = [
  { id: 'white_and_black', kind: 'two-color', hexes: ['#F4F3EE', '#25272B'], family: 'white' },
  { id: 'white_and_blue', kind: 'two-color', hexes: ['#F4F3EE', '#2F5BA6'], family: 'white' },
  { id: 'navy_and_camel', kind: 'two-color', hexes: ['#26334F', '#B7854D'], family: 'blue' },
  { id: 'blue_stripes', kind: 'pattern', hexes: ['#F4F3EE', '#2F5BA6'], family: 'white' },
  { id: 'navy_stripes', kind: 'pattern', hexes: ['#F4F3EE', '#26334F'], family: 'white' },
  { id: 'black_stripes', kind: 'pattern', hexes: ['#F4F3EE', '#25272B'], family: 'white' },
  { id: 'red_stripes', kind: 'pattern', hexes: ['#F4F3EE', '#C13C31'], family: 'white' },
  { id: 'blue_gingham', kind: 'pattern', hexes: ['#F4F3EE', '#2F5BA6'], family: 'white' },
  { id: 'red_gingham', kind: 'pattern', hexes: ['#F4F3EE', '#C13C31'], family: 'white' },
  { id: 'tartan', kind: 'pattern', hexes: ['#C13C31', '#2F4E3E', '#26334F'], family: 'red' },
  { id: 'houndstooth', kind: 'pattern', hexes: ['#F4F3EE', '#25272B'], family: 'white' },
  { id: 'polka_dots', kind: 'pattern', hexes: ['#26334F', '#F4F3EE'], family: 'blue' },
  { id: 'floral', kind: 'pattern', hexes: ['#E5C1BD', '#C13C31', '#C7982F', '#93A88C'], family: 'pink' },
  { id: 'leopard', kind: 'pattern', hexes: ['#C8AE86', '#4E3526', '#B7854D'], family: 'beige' },
];

const allOptions: readonly (ClosetSolidSwatch | ClosetFixedOption)[] = [
  ...closetSolidSwatches, ...closetColorOptions,
];

export function findClosetColorOption(id: string): ClosetSolidSwatch | ClosetFixedOption | null {
  return allOptions.find((option) => option.id === id) ?? null;
}

export function normalizeCustomColorHex(value: string): string {
  if (typeof value !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(value)) {
    throw new Error('Invalid sRGB colour hex.');
  }
  return value.toUpperCase();
}

function oklab(hex: string): readonly [number, number, number] {
  const channels = [1, 3, 5].map((offset) => {
    const srgb = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  });
  const [r, g, b] = channels;
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

export function nearestFamilyForHex(
  value: string,
  swatches: readonly ClosetSolidSwatch[] = closetSolidSwatches,
): ColorFamily {
  const target = oklab(normalizeCustomColorHex(value));
  let nearest: ClosetSolidSwatch | undefined;
  let shortest = Number.POSITIVE_INFINITY;
  for (const swatch of swatches) {
    const candidate = oklab(swatch.hex);
    const distance = target.reduce((sum, channel, index) =>
      sum + (channel - candidate[index]) ** 2, 0);
    if (distance < shortest) {
      shortest = distance;
      nearest = swatch;
    }
  }
  if (!nearest) throw new Error('The Closet swatch palette is empty.');
  return nearest.family;
}

export function normalizeClosetColorChoice(value: unknown): ClosetColorChoice {
  if (typeof value !== 'object' || value === null || !('kind' in value)) {
    throw new Error('Invalid Closet colour choice.');
  }
  if (value.kind === 'option' && !('hex' in value) && 'id' in value && typeof value.id === 'string' &&
      findClosetColorOption(value.id)) {
    return { kind: 'option', id: value.id };
  }
  if (value.kind === 'custom' && !('id' in value) && 'hex' in value && typeof value.hex === 'string') {
    return { kind: 'custom', hex: normalizeCustomColorHex(value.hex) };
  }
  throw new Error('Invalid Closet colour choice.');
}

export function colorChoiceFamily(choice: ClosetColorChoice): ColorFamily {
  if (choice.kind === 'custom') return nearestFamilyForHex(choice.hex);
  const option = findClosetColorOption(choice.id);
  if (!option) throw new Error('Unknown Closet colour option.');
  return option.family;
}

/**
 * The stored colour columns as one choice. A fixed option this build does not know reads as no
 * choice, so an older build still shows the piece; columns that contradict each other, or a
 * hex or family that does not match its choice, throw.
 */
export function closetColorChoiceFromColumns(
  optionId: unknown,
  customHex: unknown,
  colorFamily: ColorFamily | null,
): ClosetColorChoice | null {
  if ((optionId !== null && typeof optionId !== 'string') ||
      (customHex !== null && typeof customHex !== 'string') ||
      (optionId !== null && customHex !== null)) {
    throw new Error('Invalid Closet colour columns.');
  }
  const choice: ClosetColorChoice | null = typeof optionId === 'string'
    ? findClosetColorOption(optionId) ? { kind: 'option', id: optionId } : null
    : typeof customHex === 'string'
      ? { kind: 'custom', hex: normalizeCustomColorHex(customHex) }
      : null;
  if ((customHex !== null && choice?.kind === 'custom' && customHex !== choice.hex) ||
      (choice !== null && colorFamily !== colorChoiceFamily(choice))) {
    throw new Error('Invalid Closet colour columns.');
  }
  return choice;
}
