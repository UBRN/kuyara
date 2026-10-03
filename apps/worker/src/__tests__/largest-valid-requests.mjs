// The largest request each mobile client sends: the client parses the request with the strict
// contract first, so values arrive trimmed, then writes compact JSON.stringify. Every array is
// at its maximum count and every value at its longest serialized form. Each route's body limit
// is checked against these; caps come from the contracts or are proved by a one-more check.
import {
  accessoryOutfitSlots,
  aiV1OptionLimit,
  clothingPreferences,
  clothingRequirementReasonCodes,
  clothingRequirementSchema,
  dayKinds,
  dressStyles,
  formalityLevels,
  garmentTypeIds,
  ianaTimeZoneMaxLength,
  layerRoles,
  placeSearchMaxResults,
  placeSearchQueryMaxLength,
  styleAesthetics,
  styleAestheticsLimit,
} from '@kuyara/contracts';

export const bodyBytes = (value) => Buffer.byteLength(JSON.stringify(value));

const longest = (values) => values.reduce((a, b) => (`${b}`.length > `${a}`.length ? b : a));

// A body that is exactly `bytes` long: valid JSON followed by insignificant whitespace.
export function paddedBody(value, bytes) {
  const text = JSON.stringify(value);
  return text + ' '.repeat(bytes - Buffer.byteLength(text));
}

// Only ASCII time zone names resolve, so the contract's length cap is the ceiling; no real
// zone name reaches it.
export const largestWeatherRequestCeiling = {
  latitudeE2: -9000,
  longitudeE2: -18000,
  timeZone: 'x'.repeat(ianaTimeZoneMaxLength),
};

// JSON.stringify writes a control character as a six-byte \u escape, the most any one
// UTF-16 unit can cost, and trimming keeps control characters.
export const largestPlaceSearchRequest = {
  query: '\u0001'.repeat(placeSearchQueryMaxLength),
  limit: placeSearchMaxResults,
  language: 'tr',
};

// Every requirement variant with its longest members and the full run of reason codes; the
// longest of them fills the array.
function largestRequirement() {
  const variants = clothingRequirementSchema.options.map(({ shape }) => ({
    priority: longest(shape.priority.options),
    reasonCodes: Array(16).fill(longest(clothingRequirementReasonCodes)),
    kind: shape.kind.value,
    minimum: longest(shape.minimum.options),
    ...(shape.target ? { target: longest(shape.target.options) } : {}),
  }));
  return variants.reduce((a, b) => (bodyBytes(b) > bodyBytes(a) ? b : a));
}

// Nine is the most an option can hold: slots are unique, and the tenth slot would put a one
// piece beside a top and a bottom.
const largestOptionSlots = [
  'primary_top', 'bottom', 'mid_layer', 'outer_layer', 'footwear', ...accessoryOutfitSlots,
];

export function largestOption(index) {
  return {
    optionId: String(index).padStart(32, 'A'),
    formality: longest(formalityLevels),
    garments: largestOptionSlots.map((slot) => ({
      slot,
      layerRole: accessoryOutfitSlots.includes(slot) ? null : longest(layerRoles),
      garmentTypeId: longest(garmentTypeIds),
    })),
    traits: {
      hasMidLayer: false,
      hasOuterLayer: false,
      outerThermalHigh: false,
      outerWaterProtective: false,
      windResistant: false,
      tractionEnhanced: false,
      breathabilityHigh: false,
    },
  };
}

export function largestAiRecommendV1Request() {
  return {
    clothingPreference: longest(clothingPreferences),
    dressStyle: longest(dressStyles),
    catalogVersion: Number.MAX_SAFE_INTEGER,
    dayVariant: 6,
    dayKind: longest(dayKinds),
    requirements: Array(11).fill(largestRequirement()),
    options: Array.from({ length: aiV1OptionLimit }, (_, index) => largestOption(index)),
  };
}

export function largestAiRecommendV2Request() {
  const aesthetics = [...styleAesthetics]
    .sort((a, b) => b.length - a.length)
    .slice(0, styleAestheticsLimit)
    .sort();
  return { ...largestAiRecommendV1Request(), locale: 'tr', styleAesthetics: aesthetics };
}
