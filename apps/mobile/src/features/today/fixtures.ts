import type { TodayScreenState, TodaySnapshot } from '@/features/today/model';

export const canonicalTodayFixture = Object.freeze({
  id: 'today-istanbul-rain-001',
  location: 'location.istanbul',
  timeZone: 'Europe/Istanbul',
  retrievedAt: '2026-03-18T05:30:00.000Z',
  freshness: 'fresh',
  weather: Object.freeze({
    condition: 'weather.lightRain',
    temperatureCelsius: 14,
    apparentTemperatureCelsius: 12,
    minimumTemperatureCelsius: 10,
    maximumTemperatureCelsius: 17,
    precipitationProbabilityPercent: 45,
  }),
  strategy: 'strategy.lightLayersRainReady',
  suggestions: Object.freeze([
    Object.freeze({
      id: 'comfortable-layers',
      intent: 'outfit.comfortable',
      emphasis: 'recommended',
      pieces: Object.freeze([
        Object.freeze({ slot: 'slot.top', item: 'clothing.cottonShirt' }),
        Object.freeze({ slot: 'slot.bottom', item: 'clothing.relaxedTrousers' }),
        Object.freeze({ slot: 'slot.outerLayer', item: 'clothing.lightOvershirt' }),
        Object.freeze({ slot: 'slot.footwear', item: 'clothing.waterResistantSneakers' }),
        Object.freeze({ slot: 'slot.accessory', item: 'accessory.compactUmbrella' }),
      ]),
      reasons: Object.freeze(['reason.coolMorning', 'reason.possibleRain'] as const),
    }),
    Object.freeze({
      id: 'polished-layers',
      intent: 'outfit.polished',
      pieces: Object.freeze([
        Object.freeze({ slot: 'slot.top', item: 'clothing.fineKnitTop' }),
        Object.freeze({ slot: 'slot.bottom', item: 'clothing.tailoredTrousers' }),
        Object.freeze({ slot: 'slot.outerLayer', item: 'clothing.lightTrenchCoat' }),
        Object.freeze({ slot: 'slot.footwear', item: 'clothing.waterResistantLoafers' }),
        Object.freeze({ slot: 'slot.accessory', item: 'accessory.compactUmbrella' }),
      ]),
      reasons: Object.freeze(['reason.temperatureDrop', 'reason.possibleRain'] as const),
    }),
    Object.freeze({
      id: 'rain-ready-layers',
      intent: 'outfit.rainReady',
      emphasis: 'weatherReady',
      pieces: Object.freeze([
        Object.freeze({ slot: 'slot.top', item: 'clothing.longSleeveTee' }),
        Object.freeze({ slot: 'slot.bottom', item: 'clothing.straightJeans' }),
        Object.freeze({ slot: 'slot.outerLayer', item: 'clothing.hoodedRainJacket' }),
        Object.freeze({ slot: 'slot.footwear', item: 'clothing.waterproofAnkleBoots' }),
        Object.freeze({ slot: 'slot.accessory', item: 'accessory.compactUmbrella' }),
      ]),
      reasons: Object.freeze(['reason.possibleRain', 'reason.moderateWind'] as const),
    }),
  ]),
} as const satisfies TodaySnapshot);

export const canonicalTodayScreenState = Object.freeze({
  kind: 'loaded',
  snapshot: canonicalTodayFixture,
} as const satisfies TodayScreenState);
