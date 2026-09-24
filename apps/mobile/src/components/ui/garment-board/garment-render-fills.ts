import type { ColorFamily } from '@/features/catalog/domain/garment-taxonomy';
import type { OutfitSlot } from '@/features/recommendation/domain/outfit-composition';
import { blend } from '@/theme/color-blend';
import type { SemanticColors, ThemeColorScheme } from '@/theme/theme';

import { colorFamilyFills } from './color-family-fill';

// Design language Law 3's second measurable token: a garment fill steps at least 1.20:1
// off the plane it sits on and the outline clears 3.0:1 over the fill, on all seven light
// atmosphere states and the dark stage. Both values are derived from the plane, so a board
// carries no hex of its own. Today's boards take the deeper step (M20), which clears the
// same two floors on every plane with more room; every other surface keeps the standard one.
export const garmentFillRatios = {
  standard: { base: 0.13, deep: 0.22 },
  today: { base: 0.17, deep: 0.26 },
} as const;
export type GarmentFillStep = keyof typeof garmentFillRatios;

// The seven chromatic families from the approved content table (ADR 0028 section 6, ADR
// 0029 section 5), read here as hue anchors rather than as fills. `purple` stays out: at
// 264 degrees it lands in the same violet family as the provenance badge and implies a
// relationship that does not exist. The four achromatic families and `multicolor` never
// anchor a board.
const hueAnchors = ['brown', 'red', 'orange', 'yellow', 'green', 'blue', 'pink'] as const;

// The accent lands on the outermost body piece the outfit actually has, so one board shows
// at most one colour and the same outfit shows the same one on Today and on the detail.
const accentSlots = ['outer_layer', 'one_piece', 'primary_top'] as const;

function parseHex(hex: string): readonly number[] {
  return [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16));
}

function formatHex(channels: readonly number[]): string {
  return `#${channels.map((channel) => Math.round(channel).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

function toLinear(channel: number): number {
  const scaled = channel / 255;
  return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
}

function toChannel(linear: number): number {
  const clamped = Math.min(1, Math.max(0, linear));
  return 255 * (clamped <= 0.0031308 ? clamped * 12.92 : 1.055 * clamped ** (1 / 2.4) - 0.055);
}

function luminance(linear: readonly number[]): number {
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

/**
 * The anchor's own hue carried to the deep neutral's luminance, so the one coloured piece
 * reads as colour without reading as emphasis. Scaling in linear light keeps the HSL hue
 * exactly; where the scale would push a channel out of the sRGB gamut it stops at the
 * gamut edge and lifts toward white, which keeps the hue too. Clamping the overflowing
 * channel instead would tilt it.
 */
function matchLuminance(anchor: string, target: string): string {
  const linear = parseHex(anchor).map(toLinear);
  const wanted = luminance(parseHex(target).map(toLinear));
  const scale = wanted / luminance(linear);
  const brightest = Math.max(...linear);

  if (scale * brightest <= 1) {
    return formatHex(linear.map((channel) => toChannel(channel * scale)));
  }

  const edge = linear.map((channel) => toChannel(channel / brightest));
  const lift = (ratio: number) => edge.map((channel) => channel + ratio * (255 - channel));
  let low = 0;
  let high = 1;
  for (let step = 0; step < 24; step += 1) {
    const middle = (low + high) / 2;
    if (luminance(lift(middle).map(toLinear)) < wanted) low = middle;
    else high = middle;
  }

  return formatHex(lift((low + high) / 2));
}

// FNV-1a over the option id. It lives here because `hashCompositionKey` is not exported and
// `components/ui` may not take a value from a feature's application layer.
function fnv1a32(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 0x01000193) >>> 0;
  }
  return hash;
}

/**
 * Every garment fill on every surface, derived from the plane the drawing stands on: a
 * neutral base, a deeper neutral for `footwear`, and at most one luminance-matched accent
 * on the board that is the subject of the screen.
 *
 * The accent is a deterministic function of `optionId` and is stored nowhere, so the same
 * outfit is the same colour on Today and on its detail. An empty `optionId` asks for no
 * accent at all, which is how the alternates, the Closet and the Profile rail stay neutral.
 * A piece the owner gave a colour keeps that colour: a recorded colour always wins over a
 * derived one. `multicolor` is not resolved here, because two stops are not a fill.
 */
export function resolveGarmentRenderFills({
  optionId,
  pieces,
  plane,
  colors,
  colorScheme,
  step = 'standard',
}: Readonly<{
  optionId: string;
  pieces: readonly Readonly<{
    slot: OutfitSlot;
    colorFamily: Exclude<ColorFamily, 'multicolor'> | null;
  }>[];
  plane: string;
  colors: Pick<SemanticColors, 'textPrimary'>;
  colorScheme: ThemeColorScheme;
  step?: GarmentFillStep;
}>): ReadonlyMap<OutfitSlot, string> {
  const ratios = garmentFillRatios[step];
  const base = blend(plane, colors.textPrimary, ratios.base);
  const deep = blend(plane, colors.textPrimary, ratios.deep);
  const accentSlot = optionId === ''
    ? undefined
    : accentSlots.find((slot) => pieces.some((piece) => piece.slot === slot));
  const accent = accentSlot === undefined
    ? base
    : matchLuminance(
      colorFamilyFills[colorScheme][hueAnchors[fnv1a32(optionId) % hueAnchors.length]],
      deep,
    );

  return new Map(pieces.map(({ slot, colorFamily }): [OutfitSlot, string] => {
    if (colorFamily !== null) return [slot, colorFamilyFills[colorScheme][colorFamily]];
    if (slot === accentSlot) return [slot, accent];
    return [slot, slot === 'footwear' ? deep : base];
  }));
}
