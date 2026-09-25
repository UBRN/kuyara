import type { ColorFamily, Formality, GarmentTypeId } from '@/features/catalog/domain/garment-taxonomy';
import type { OutfitSlot } from '@/features/recommendation/domain/outfit-composition';
import type { WeatherConditionCode } from '@/features/weather/domain/weather';
import type { ThemeColorScheme } from '@/theme/theme';

// Port of the owner-approved Phase 6 palette.js. These hex values are garment content
// and material colours only; callers must not use them for controls, text, or chrome.
const hx = (h: string): number[] => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const toHex = (c: readonly number[]): string =>
  `#${c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
const lin = (value: number): number => {
  const v = value / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const unlin = (v: number): number => 255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);
const lum = (h: string): number => { const c = hx(h).map(lin); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
export const garmentPaletteContrast = (a: string, b: string): number => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

export function toGarmentOklch(h: string): { L: number; C: number; H: number } {
  const [r, g, b] = hx(h).map(lin);
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
function fromOklch(L: number, C: number, H: number): string {
  const lightness = Math.max(0, Math.min(1, L));
  let c = C;
  for (let i = 0; i < 40; i++) {
    const rgb = rawRgb(lightness, c, H);
    if (rgb.every((v) => v >= -1e-4 && v <= 1 + 1e-4)) return toHex(rgb.map((v) => unlin(Math.max(0, Math.min(1, v)))));
    c *= 0.9;
  }
  return toHex(rawRgb(lightness, 0, H).map((v) => unlin(Math.max(0, Math.min(1, v)))));
}
const shiftL = (h: string, dL: number, cK = 1): string => { const o = toGarmentOklch(h); return fromOklch(o.L + dL, o.C * cK, o.H); };
const setL = (h: string, L: number, cK = 1): string => { const o = toGarmentOklch(h); return fromOklch(L, o.C * cK, o.H); };

const S = (hex: string, fam: ColorFamily, kind: 'neutral' | 'accent', temp: 'none' | 'warm' | 'cool', en: string, tr: string) => ({ hex, fam, kind, temp, en, tr });
export const garmentSwatches = {
  white: S('#F4F3EE', 'white', 'neutral', 'none', 'White', 'Beyaz'),
  ecru: S('#E8DEC8', 'beige', 'neutral', 'warm', 'Ecru', 'Ekru'),
  stone: S('#D0C3A8', 'beige', 'neutral', 'warm', 'Stone', 'Taş rengi'),
  sand: S('#C8AE86', 'beige', 'neutral', 'warm', 'Sand', 'Kum'),
  straw: S('#D9C28E', 'beige', 'neutral', 'warm', 'Straw', 'Hasır'),
  camel: S('#B7854D', 'brown', 'neutral', 'warm', 'Camel', 'Deve tüyü'),
  tan: S('#96673C', 'brown', 'neutral', 'warm', 'Tan leather', 'Taba deri'),
  chocolate: S('#4E3526', 'brown', 'neutral', 'warm', 'Chocolate', 'Çikolata'),
  black: S('#25272B', 'black', 'neutral', 'none', 'Black', 'Siyah'),
  charcoal: S('#3E434A', 'gray', 'neutral', 'cool', 'Charcoal', 'Antrasit'),
  heather: S('#A6AAAC', 'gray', 'neutral', 'cool', 'Heather grey', 'Gri melanj'),
  lightgrey: S('#CACECE', 'gray', 'neutral', 'cool', 'Light grey', 'Açık gri'),
  navy: S('#26334F', 'blue', 'neutral', 'cool', 'Navy', 'Lacivert'),
  oxford: S('#BACFE3', 'blue', 'neutral', 'cool', 'Oxford blue', 'Oxford mavisi'),
  indigo: S('#33507A', 'blue', 'neutral', 'none', 'Indigo denim', 'İndigo kot'),
  midwash: S('#5A7DA7', 'blue', 'neutral', 'none', 'Mid-wash denim', 'Orta yıkama kot'),
  lightwash: S('#9BB5D1', 'blue', 'neutral', 'none', 'Light-wash denim', 'Açık yıkama kot'),
  blackdenim: S('#303338', 'black', 'neutral', 'none', 'Black denim', 'Siyah kot'),
  olive: S('#65663A', 'green', 'neutral', 'warm', 'Olive', 'Haki'),
  rust: S('#AE4F2B', 'orange', 'accent', 'warm', 'Rust', 'Kiremit'),
  terracotta: S('#C26A46', 'orange', 'accent', 'warm', 'Terracotta', 'Terrakota'),
  mustard: S('#C7982F', 'yellow', 'accent', 'warm', 'Mustard', 'Hardal'),
  rainyellow: S('#E5BD2F', 'yellow', 'accent', 'warm', 'Rain yellow', 'Yağmurluk sarısı'),
  forest: S('#2F4E3E', 'green', 'accent', 'cool', 'Forest green', 'Orman yeşili'),
  sage: S('#93A88C', 'green', 'accent', 'cool', 'Sage', 'Adaçayı'),
  burgundy: S('#6B2534', 'red', 'accent', 'warm', 'Burgundy', 'Bordo'),
  tomato: S('#C13C31', 'red', 'accent', 'warm', 'Tomato red', 'Domates kırmızısı'),
  dustyrose: S('#CD9597', 'pink', 'accent', 'warm', 'Dusty rose', 'Gül kurusu'),
  blush: S('#E5C1BD', 'pink', 'accent', 'warm', 'Blush', 'Pudra'),
  skyblue: S('#93BDDF', 'blue', 'accent', 'cool', 'Sky blue', 'Gök mavisi'),
  cobalt: S('#2F5BA6', 'blue', 'accent', 'cool', 'Cobalt', 'Kobalt'),
};
export type GarmentSwatchId = keyof typeof garmentSwatches;
export const garmentSwatchColorFamilies = Object.fromEntries(
  Object.entries(garmentSwatches).map(([id, swatch]) => [id, swatch.fam]),
) as Readonly<Record<GarmentSwatchId, ColorFamily>>;

// Materials: soles, handles, bands, hardware. Fixed per drawing, never a palette choice.
const MATERIAL = {
  soleWhite: '#ECE8DE', soleBlack: '#2B2826', leatherSole: '#5B4131', cork: '#C7A574',
  wood: '#7A5233', brass: '#B08C55', silver: '#A7ABAE', band: '#3A2A20',
};

/* ---------- colourways: the natural colours each drawing may take, most natural first.
   `a` is the secondary material (sole, band, handle), `h` the hardware. ---------- */
const CW = (list: readonly GarmentSwatchId[], a: string | null = null, h: string | null = null) => ({ list, a, h });
const COLORWAY = {
  'g-tee': CW(['white', 'heather', 'navy', 'black', 'ecru', 'sage', 'terracotta', 'skyblue']),
  'g-tank': CW(['white', 'black', 'ecru', 'blush', 'sage', 'skyblue']),
  'g-long': CW(['ecru', 'white', 'charcoal', 'navy', 'olive', 'heather', 'rust']),
  'g-shirt': CW(['white', 'oxford', 'ecru', 'olive', 'chocolate', 'terracotta', 'skyblue', 'sage']),
  'g-sweater': CW(['heather', 'camel', 'navy', 'ecru', 'charcoal', 'forest', 'burgundy', 'mustard']),
  'g-hoodie': CW(['heather', 'black', 'navy', 'ecru', 'sage', 'rust', 'forest']),
  'g-cardigan': CW(['camel', 'ecru', 'charcoal', 'navy', 'forest', 'dustyrose', 'mustard']),
  'g-jacket': CW(['olive', 'navy', 'stone', 'tan', 'black', 'rust'], null, MATERIAL.silver),
  'g-blazer': CW(['navy', 'charcoal', 'camel', 'black', 'stone']),
  'g-puffer': CW(['black', 'navy', 'olive', 'ecru', 'forest', 'rust', 'mustard'], null, MATERIAL.silver),
  'g-parka': CW(['olive', 'navy', 'black', 'sand'], 'heather', MATERIAL.silver),
  'g-vest': CW(['navy', 'olive', 'black', 'forest', 'rust'], null, MATERIAL.silver),
  'g-trench': CW(['stone', 'camel', 'navy', 'black'], null, MATERIAL.band),
  'g-rain': CW(['navy', 'olive', 'rainyellow', 'cobalt', 'tomato', 'forest', 'mustard'], null, MATERIAL.silver),
  'g-trousers': CW(['charcoal', 'navy', 'stone', 'camel', 'black', 'olive', 'heather']),
  'g-jeans': CW(['indigo', 'midwash', 'lightwash', 'blackdenim'], null, MATERIAL.brass),
  'g-leggings': CW(['black', 'charcoal', 'navy']),
  'g-shorts': CW(['stone', 'navy', 'olive', 'sand', 'midwash', 'white']),
  'g-skirt': CW(['black', 'camel', 'navy', 'olive', 'burgundy', 'dustyrose', 'forest']),
  'g-dress': CW(['navy', 'black', 'terracotta', 'sage', 'dustyrose', 'cobalt', 'burgundy', 'forest', 'skyblue']),
  'g-jumpsuit': CW(['black', 'olive', 'navy', 'rust', 'burgundy', 'forest']),
  'g-sneaker': CW(['white', 'lightgrey', 'navy', 'black'], MATERIAL.soleWhite),
  'g-boot': CW(['tan', 'chocolate', 'black'], MATERIAL.soleBlack),
  'g-dressshoe': CW(['black', 'chocolate', 'tan'], MATERIAL.leatherSole),
  'g-flat': CW(['black', 'tan', 'blush', 'burgundy'], MATERIAL.leatherSole),
  'g-sandal': CW(['tan', 'black', 'chocolate'], MATERIAL.cork, MATERIAL.brass),
  'g-beanie': CW(['charcoal', 'rust', 'mustard', 'navy', 'forest', 'ecru', 'burgundy']),
  'g-hat': CW(['straw', 'camel', 'black', 'chocolate'], MATERIAL.band),
  'g-cap': CW(['navy', 'black', 'stone', 'olive']),
  'g-balaclava': CW(['black', 'charcoal', 'navy']),
  'g-scarf': CW(['camel', 'burgundy', 'forest', 'heather', 'mustard', 'rust']),
  'g-gloves': CW(['black', 'chocolate', 'charcoal', 'camel']),
  'g-umbrella': CW(['navy', 'black', 'rainyellow', 'tomato', 'forest'], MATERIAL.wood, MATERIAL.silver),
  // Owner-approved Phase 6 additions.
  'x-polo': CW(['navy', 'white', 'forest', 'ecru', 'skyblue', 'terracotta']),
  'x-turtleneck': CW(['black', 'ecru', 'camel', 'charcoal', 'burgundy']),
  'x-blouse': CW(['white', 'ecru', 'blush', 'skyblue', 'sage']),
  'x-bomber': CW(['olive', 'navy', 'black'], '#3B3A30', MATERIAL.silver),
  'x-leather': CW(['black', 'chocolate'], null, MATERIAL.silver),
  'x-coat': CW(['camel', 'charcoal', 'navy', 'black']),
  'x-loafer': CW(['chocolate', 'black', 'tan', 'burgundy'], MATERIAL.leatherSole),
  'x-rainboot': CW(['olive', 'black', 'navy', 'rainyellow'], MATERIAL.soleBlack),
};

const MOOD = {
  light: { neutrals: ['white', 'ecru', 'stone', 'sand', 'straw', 'oxford', 'lightgrey', 'lightwash', 'midwash', 'tan', 'camel'],
    accents: ['terracotta', 'skyblue', 'sage', 'blush', 'dustyrose', 'mustard'], temp: 'warm' },
  mild: { neutrals: ['white', 'ecru', 'stone', 'camel', 'tan', 'chocolate', 'olive', 'indigo', 'midwash', 'navy', 'heather', 'lightgrey'],
    accents: ['rust', 'terracotta', 'mustard', 'sage', 'forest', 'dustyrose'], temp: 'warm' },
  wet: { neutrals: ['navy', 'charcoal', 'black', 'stone', 'heather', 'oxford', 'white', 'indigo', 'chocolate'],
    accents: ['rainyellow', 'cobalt', 'tomato', 'mustard', 'forest'], temp: 'cool' },
  cold: { neutrals: ['camel', 'charcoal', 'navy', 'heather', 'ecru', 'indigo', 'chocolate', 'tan', 'black', 'stone', 'white'],
    accents: ['burgundy', 'forest', 'rust', 'mustard'], temp: 'warm' },
  night: { neutrals: ['black', 'charcoal', 'navy', 'chocolate', 'blackdenim', 'white', 'heather'],
    accents: ['burgundy', 'forest', 'cobalt', 'rust'], temp: 'cool' },
};
const FORMALITY = {
  casual: { accents: null, accentSlots: null },
  smart: { accents: ['mustard', 'forest', 'burgundy', 'cobalt', 'rust', 'sage', 'dustyrose', 'rainyellow'], accentSlots: null },
  formal: { accents: ['burgundy', 'forest', 'cobalt'], accentSlots: ['mid_layer', 'accessory'] },
};
const ACCENT_ORDER = {
  wet: ['outer_layer', 'mid_layer', 'one_piece', 'primary_top', 'accessory'],
  night: ['one_piece', 'primary_top', 'mid_layer', 'accessory'],
  default: ['mid_layer', 'one_piece', 'primary_top', 'outer_layer', 'accessory'],
};
function fnv(s: string): number { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0; return h; }
const Lof = (id: GarmentSwatchId) => toGarmentOklch(garmentSwatches[id].hex).L;

export function garmentPaletteRoutes(fill: string, plane: string, ink: string) {
  const cs = garmentPaletteContrast(fill, plane), co = garmentPaletteContrast(ink, fill);
  return { cs, co, A: cs >= 3, B: cs >= 1.2 && co >= 3 };
}
export function legalizeGarmentFill(hex: string, plane: string, ink: string) {
  const r0 = garmentPaletteRoutes(hex, plane, ink);
  if (r0.A || r0.B) return { hex, moved: 0, route: r0.A ? 'A' : 'B', ...r0 };
  const o = toGarmentOklch(hex);
  let best: ReturnType<typeof garmentPaletteRoutes> & { hex: string; moved: number; route: string } | null = null;
  for (let d = 0.005; d <= 1; d += 0.005) {
    for (const sgn of [1, -1]) {
      const L = o.L + sgn * d;
      if (L < 0 || L > 1) continue;
      const h = fromOklch(L, o.C, o.H), r = garmentPaletteRoutes(h, plane, ink);
      if (r.A || r.B) { best = { hex: h, moved: sgn * d, route: r.A ? 'A' : 'B', ...r }; break; }
    }
    if (best) break;
  }
  return best || { hex, moved: 0, route: '-', ...r0 };
}
// Dark appearance caps lightness at 0.80 and chroma at x0.92, then the clamp
// preserves the 1.20 fill step.
export function garmentFillForAppearance(hex: string, dark: boolean): string {
  if (!dark) return hex;
  const o = toGarmentOklch(hex);
  return fromOklch(Math.min(o.L, 0.8), o.C * 0.92, o.H);
}
// The tones one piece draws with, all derived from its main colour.
function tones(main: string, second: string | null, hardware: string | null, dark: boolean) {
  const o = toGarmentOklch(main);
  const deepDir = o.L >= 0.52 ? -1 : 1;
  const t = {
    m: main,
    s: shiftL(main, o.L > 0.3 ? -0.075 : -0.045, 1.02),
    d: shiftL(main, deepDir * (o.L >= 0.52 ? 0.24 : 0.2), 0.9),
    l: shiftL(main, o.L > 0.85 ? -0.035 : 0.075, 0.95),
    k: setL(main, dark ? 0.34 : 0.3, 0.5),
    a: second || main,
  };
  const oa = toGarmentOklch(t.a);
  return {
    ...t,
    as: shiftL(t.a, oa.L > 0.3 ? -0.08 : -0.05),
    ad: shiftL(t.a, oa.L >= 0.52 ? -0.24 : 0.2, 0.9),
    h: hardware || t.d,
  };
}


// Explicit catalog mapping keeps palette coverage independent of the current silhouette map.
// Fleece, track pants, knit dress, long skirt and neck gaiter use a related approved
// colourway while their dedicated drawing has not been defined by the mockup.
const garmentColorwayIds = {
  sleeveless_top: 'g-tank', t_shirt: 'g-tee', long_sleeve_t_shirt: 'g-long',
  shirt: 'g-shirt', blouse: 'x-blouse', sweatshirt: 'g-sweater',
  hoodie: 'g-hoodie', sweater: 'g-sweater', cardigan: 'g-cardigan',
  overshirt: 'g-shirt', fleece: 'g-sweater', turtleneck: 'x-turtleneck',
  polo_shirt: 'x-polo', trousers: 'g-trousers', jeans: 'g-jeans',
  leggings: 'g-leggings', shorts: 'g-shorts', skirt: 'g-skirt',
  long_skirt: 'g-skirt', track_pants: 'g-trousers', dress: 'g-dress',
  jumpsuit: 'g-jumpsuit', knit_dress: 'g-dress', light_jacket: 'g-jacket',
  trench_coat: 'g-trench', rain_jacket: 'g-rain', insulated_jacket: 'g-puffer',
  coat: 'g-trench', parka: 'g-parka', blazer: 'g-blazer',
  puffer_vest: 'g-vest', bomber_jacket: 'x-bomber', leather_jacket: 'x-leather',
  sneakers: 'g-sneaker', closed_shoes: 'g-dressshoe', ankle_boots: 'g-boot',
  weather_boots: 'g-boot', sandals: 'g-sandal', loafers: 'x-loafer',
  ballet_flats: 'g-flat', rain_boots: 'x-rainboot', beanie: 'g-beanie',
  brimmed_hat: 'g-hat', cap: 'g-cap', balaclava: 'g-balaclava',
  scarf: 'g-scarf', neck_gaiter: 'g-scarf', gloves: 'g-gloves',
  umbrella: 'g-umbrella',
} as const satisfies Record<GarmentTypeId, keyof typeof COLORWAY>;

export type GarmentPalettePiece = Readonly<{
  slot: OutfitSlot;
  garmentTypeId: GarmentTypeId;
  recordedSwatchId?: GarmentSwatchId;
}>;

export type GarmentPaletteInput = Readonly<{
  optionId: string;
  pieces: readonly GarmentPalettePiece[];
  temperatureC: number;
  condition: WeatherConditionCode;
  isNight: boolean;
  formality: Formality;
  appearance: ThemeColorScheme;
  stageColor: string;
  inkColor: string;
  accessoryStageColor?: string;
}>;

export type GarmentRoles = Readonly<{
  main: string; shade: string; toneLine: string; light: string; darkTrim: string;
  material: string; materialShade: string; materialTone: string; hardware: string;
}>;

export type GarmentPieceColors = Readonly<{
  piece: GarmentPalettePiece;
  swatchId: GarmentSwatchId;
  colorFamily: ColorFamily;
  reason: 'recorded' | 'accent' | 'neutral' | 'footwear';
  colorwayId: keyof typeof COLORWAY;
  roles: GarmentRoles;
  legibility: ReturnType<typeof legalizeGarmentFill>;
}>;

export function garmentPaletteMood({ temperatureC, condition, isNight }: Pick<GarmentPaletteInput, 'temperatureC' | 'condition' | 'isNight'>): keyof typeof MOOD {
  if (isNight) return 'night';
  if (condition === 'snow' || condition === 'sleet' || temperatureC < 10) return 'cold';
  if (condition === 'rain' || condition === 'heavy_rain' || condition === 'drizzle' || condition === 'thunderstorm') return 'wet';
  return temperatureC >= 24 ? 'light' : 'mild';
}

const accessorySlots: readonly OutfitSlot[] = ['head', 'neck', 'hands', 'handheld'];
const neutralOrder: readonly OutfitSlot[] = ['bottom', 'one_piece', 'primary_top', 'outer_layer', 'mid_layer', 'footwear', ...accessorySlots];
const slotGroup = (slot: OutfitSlot): OutfitSlot | 'accessory' => accessorySlots.includes(slot) ? 'accessory' : slot;

export function resolveGarmentPalette(input: GarmentPaletteInput): readonly GarmentPieceColors[] {
  const moodId = garmentPaletteMood(input);
  const mood = MOOD[moodId];
  const form = FORMALITY[input.formality];
  const accents = mood.accents.filter((id) => form.accents === null || (form.accents as readonly string[]).includes(id));
  const accentOrder = form.accentSlots || ACCENT_ORDER[moodId as 'wet' | 'night'] || ACCENT_ORDER.default;
  const chosen = new Map<GarmentPalettePiece, { swatchId: GarmentSwatchId; reason: GarmentPieceColors['reason'] }>();
  const used = new Set<GarmentSwatchId>();
  const colorway = (piece: GarmentPalettePiece) => COLORWAY[garmentColorwayIds[piece.garmentTypeId]];
  const pick = (piece: GarmentPalettePiece, candidates: readonly GarmentSwatchId[], reason: GarmentPieceColors['reason']) => {
    const free = candidates.filter((id) => !used.has(id));
    const list = free.length ? free : candidates;
    if (!list.length) return false;
    const swatchId = list[fnv(`${input.optionId}:${slotGroup(piece.slot)}`) % list.length];
    chosen.set(piece, { swatchId, reason });
    used.add(swatchId);
    return true;
  };

  for (const piece of input.pieces) {
    if (piece.recordedSwatchId === undefined) continue;
    chosen.set(piece, { swatchId: piece.recordedSwatchId, reason: 'recorded' });
    used.add(piece.recordedSwatchId);
  }

  const hasRecordedAccent = [...chosen.values()].some(({ swatchId }) => garmentSwatches[swatchId].kind === 'accent');
  if (!hasRecordedAccent) {
    for (const group of accentOrder) {
      const piece = input.pieces.find((candidate) => slotGroup(candidate.slot) === group && !chosen.has(candidate));
      if (piece === undefined) continue;
      const candidates = colorway(piece).list.filter((id) => (accents as readonly string[]).includes(id));
      if (candidates.length && pick(piece, candidates, 'accent')) break;
    }
  }

  const neutral = (id: GarmentSwatchId) => {
    const swatch = garmentSwatches[id];
    return (mood.neutrals as readonly string[]).includes(id) && swatch.kind === 'neutral' &&
      (swatch.temp === 'none' || swatch.temp === mood.temp || moodId === 'wet' || moodId === 'night' || moodId === 'cold');
  };
  const sorted = [...input.pieces].sort((a, b) => neutralOrder.indexOf(a.slot) - neutralOrder.indexOf(b.slot));
  for (const piece of sorted) {
    if (chosen.has(piece)) continue;
    let candidates = colorway(piece).list.filter(neutral);
    if (!candidates.length) candidates = colorway(piece).list.filter((id) => garmentSwatches[id].kind === 'neutral');
    const by = (slot: OutfitSlot) => input.pieces.find((candidate) => candidate.slot === slot);
    const bottom = by('bottom') || by('one_piece');
    const top = by('primary_top');
    const outer = by('outer_layer');
    const differs = (reference: GarmentPalettePiece | undefined, distance: number) => (id: GarmentSwatchId) =>
      reference === undefined || !chosen.has(reference) || Math.abs(Lof(id) - Lof(chosen.get(reference)!.swatchId)) >= distance;
    const limit = (predicate: (id: GarmentSwatchId) => boolean) => {
      const filtered = candidates.filter(predicate);
      if (filtered.length) candidates = filtered;
    };
    if (piece.slot === 'primary_top') limit(differs(bottom, 0.2));
    if (piece.slot === 'outer_layer') limit(differs(top, 0.12));
    if (piece.slot === 'mid_layer') limit((id) => differs(outer, 0.12)(id) && differs(top, 0.12)(id));
    if (piece.slot === 'footwear') {
      const selected = [...chosen.values()];
      const warm = selected.filter(({ swatchId }) => garmentSwatches[swatchId].temp === 'warm').length;
      const cool = selected.filter(({ swatchId }) => garmentSwatches[swatchId].temp === 'cool').length;
      if (piece.garmentTypeId === 'sneakers' && (moodId === 'light' || moodId === 'mild') && input.formality === 'casual') candidates = ['white'];
      else if (warm > cool) limit((id) => garmentSwatches[id].fam === 'brown');
      else limit((id) => garmentSwatches[id].fam === 'black');
    }
    pick(piece, candidates, piece.slot === 'footwear' ? 'footwear' : 'neutral');
  }

  return input.pieces.map((piece) => {
    const choice = chosen.get(piece);
    if (choice === undefined) throw new Error('A catalog garment has no palette colour.');
    const colorwayId = garmentColorwayIds[piece.garmentTypeId];
    const swatch = garmentSwatches[choice.swatchId];
    const dark = input.appearance === 'dark';
    const base = garmentFillForAppearance(swatch.hex, dark);
    const plane = accessorySlots.includes(piece.slot) ? input.accessoryStageColor ?? input.stageColor : input.stageColor;
    const legibility = legalizeGarmentFill(base, plane, input.inkColor);
    return {
      piece, swatchId: choice.swatchId, colorFamily: swatch.fam, reason: choice.reason,
      colorwayId, legibility, roles: garmentFillRoles(colorwayId, legibility.hex, input.appearance),
    };
  });
}

/**
 * Every colour role one drawing paints with, derived from its main fill and its colourway's
 * fixed materials. `colorwayId` is the drawing's silhouette id; a drawing without a colourway
 * (a category glyph) has no second material and takes its hardware from the tone line.
 */
export function garmentFillRoles(colorwayId: string, main: string, appearance: ThemeColorScheme): GarmentRoles {
  const dark = appearance === 'dark';
  const colorway = colorwayId in COLORWAY ? COLORWAY[colorwayId as keyof typeof COLORWAY] : null;
  const second = colorway?.a ?? null;
  const materialHex = second === null ? null : second in garmentSwatches
    ? garmentSwatches[second as GarmentSwatchId].hex : second;
  const material = materialHex === null ? null : garmentFillForAppearance(materialHex, dark);
  const tone = tones(main, material, colorway?.h ?? null, dark);
  return { main: tone.m, shade: tone.s, toneLine: tone.d, light: tone.l,
    darkTrim: tone.k, material: tone.a, materialShade: tone.as,
    materialTone: tone.ad, hardware: tone.h };
}

/** One outfit's palette inputs apart from the plane it stands on and the appearance. */
export type GarmentOutfitPalette = Omit<GarmentPaletteInput, 'appearance' | 'stageColor' | 'inkColor' | 'accessoryStageColor'>;

// Today draws the same outfit on its board, its badges and, after a tap, the detail, so
// each resolved palette is kept by value: the board and the badges read one result, and a
// re-render never repeats the OKLCH work. Bounded: a day holds a handful of outfits.
const PALETTE_CACHE_LIMIT = 48;
const paletteCache = new Map<string, ReadonlyMap<OutfitSlot, GarmentRoles>>();

/** The colour roles of every piece of one outfit, by slot, memoised by value. */
export function garmentRolesBySlot(input: GarmentPaletteInput): ReadonlyMap<OutfitSlot, GarmentRoles> {
  const key = JSON.stringify(input);
  const cached = paletteCache.get(key);
  if (cached) return cached;
  if (paletteCache.size >= PALETTE_CACHE_LIMIT) paletteCache.clear();
  const roles = new Map(resolveGarmentPalette(input).map(({ piece, roles }) => [piece.slot, roles]));
  paletteCache.set(key, roles);
  return roles;
}
