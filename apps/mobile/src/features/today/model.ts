export type TodayFreshness = 'fresh' | 'stale';

export type TodayLocationCode = 'location.istanbul';
export type WeatherConditionCode = 'weather.lightRain';
export type ClothingStrategyCode = 'strategy.lightLayersRainReady';

export type OutfitIntentCode =
  | 'outfit.comfortable'
  | 'outfit.polished'
  | 'outfit.rainReady';

export type ClothingSlotCode =
  | 'slot.top'
  | 'slot.bottom'
  | 'slot.outerLayer'
  | 'slot.footwear'
  | 'slot.accessory';

export type ClothingItemCode =
  | 'clothing.cottonShirt'
  | 'clothing.relaxedTrousers'
  | 'clothing.lightOvershirt'
  | 'clothing.waterResistantSneakers'
  | 'accessory.compactUmbrella'
  | 'clothing.fineKnitTop'
  | 'clothing.tailoredTrousers'
  | 'clothing.lightTrenchCoat'
  | 'clothing.waterResistantLoafers'
  | 'clothing.longSleeveTee'
  | 'clothing.straightJeans'
  | 'clothing.hoodedRainJacket'
  | 'clothing.waterproofAnkleBoots';

export type RecommendationReasonCode =
  | 'reason.coolMorning'
  | 'reason.possibleRain'
  | 'reason.temperatureDrop'
  | 'reason.moderateWind';

export type OutfitEmphasis = 'recommended' | 'weatherReady';

export type HourlyRainProbability = Readonly<{
  label: string;
  probabilityPercent: number;
}>;

export type SixHourlyRainProbabilities = readonly [
  HourlyRainProbability,
  HourlyRainProbability,
  HourlyRainProbability,
  HourlyRainProbability,
  HourlyRainProbability,
  HourlyRainProbability,
];

export type OutfitPiece = Readonly<{
  slot: ClothingSlotCode;
  item: ClothingItemCode;
}>;

export type OutfitSuggestion = Readonly<{
  id: string;
  intent: OutfitIntentCode;
  pieces: readonly OutfitPiece[];
  reasons: readonly RecommendationReasonCode[];
  emphasis?: OutfitEmphasis;
}>;

export type ThreeOutfitSuggestions = readonly [
  OutfitSuggestion,
  OutfitSuggestion,
  OutfitSuggestion,
];

export type TodaySnapshot = Readonly<{
  id: string;
  location: TodayLocationCode;
  timeZone: string;
  retrievedAt: string;
  freshness: TodayFreshness;
  weather: Readonly<{
    condition: WeatherConditionCode;
    temperatureCelsius: number;
    apparentTemperatureCelsius: number;
    minimumTemperatureCelsius: number;
    maximumTemperatureCelsius: number;
    precipitationProbabilityPercent: number;
    windSpeedKmh: number;
    windDirection: string;
    humidityPercent: number;
    uvIndex: number;
    sunriseTime: string;
    sunsetTime: string;
    hourlyRainProbability: SixHourlyRainProbabilities;
  }>;
  strategy: ClothingStrategyCode;
  suggestions: ThreeOutfitSuggestions;
}>;

export type TodayScreenState =
  | Readonly<{ kind: 'loading' }>
  | Readonly<{ kind: 'unavailable' }>
  | Readonly<{ kind: 'loaded'; snapshot: TodaySnapshot }>;

export const requiredCompleteOutfitSlots = Object.freeze([
  'slot.top',
  'slot.bottom',
  'slot.footwear',
] as const satisfies readonly ClothingSlotCode[]);

export function isCompleteOutfit(suggestion: OutfitSuggestion): boolean {
  const slots = new Set(suggestion.pieces.map(({ slot }) => slot));

  return requiredCompleteOutfitSlots.every((slot) => slots.has(slot));
}
