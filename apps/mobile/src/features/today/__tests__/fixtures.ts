import { recommendOutfits } from '@/features/recommendation/application/recommend-outfits';
import type { TodayScreenState } from '@/features/today/model';
import type { WardrobeItem } from '@/features/wardrobe/domain/wardrobe-item';
import type {
  ActiveLocation,
  WeatherSnapshot,
} from '@/features/weather/domain/weather';

export const todayWeatherSnapshot = Object.freeze({
  id: '018f0f4d-1d45-4ae7-a8f1-796e8297d3b4',
  localProfileId: 'profile-one',
  locationKey: 'manual:sample.istanbul',
  timeZone: 'Europe/Istanbul',
  fetchedAt: '2026-08-13T06:05:00.000Z',
  origin: Object.freeze({ kind: 'sample', sourceId: 'today-test' }),
  current: Object.freeze({
    observedAt: '2026-08-13T06:00:00.000Z',
    temperatureCelsius: 20,
    apparentTemperatureCelsius: 18,
    condition: 'rain',
    precipitationProbability: 0.65,
    windSpeedMetersPerSecond: 8,
    humidity: 0.78,
    uvIndex: 2,
  }),
  minimumTemperatureCelsius: 18,
  maximumTemperatureCelsius: 22,
  hourly: Object.freeze([
    Object.freeze({
      forecastAt: '2026-08-13T05:00:00.000Z',
      temperatureCelsius: 19,
      apparentTemperatureCelsius: 17,
      condition: 'rain',
      precipitationProbability: 0.4,
      windSpeedMetersPerSecond: 7,
      humidity: 0.8,
      uvIndex: 1,
    }),
    Object.freeze({
      forecastAt: '2026-08-13T06:00:00.000Z',
      temperatureCelsius: 20,
      apparentTemperatureCelsius: 18,
      condition: 'rain',
      precipitationProbability: 0.65,
      windSpeedMetersPerSecond: 8,
      humidity: 0.78,
      uvIndex: 2,
    }),
    Object.freeze({
      forecastAt: '2026-08-13T07:00:00.000Z',
      temperatureCelsius: 21,
      apparentTemperatureCelsius: 19,
      condition: 'drizzle',
      precipitationProbability: 0.45,
      windSpeedMetersPerSecond: 7,
      humidity: 0.74,
      uvIndex: 3,
    }),
    Object.freeze({
      forecastAt: '2026-08-13T08:00:00.000Z',
      temperatureCelsius: 22,
      apparentTemperatureCelsius: 20,
      condition: 'cloudy',
      precipitationProbability: 0.2,
      windSpeedMetersPerSecond: 6,
      humidity: 0.7,
      uvIndex: 4,
    }),
  ]),
} as const satisfies WeatherSnapshot);

export const todayActiveLocation = Object.freeze({
  source: 'manual',
  catalogId: 'sample.istanbul',
  locationKey: 'manual:sample.istanbul',
  coordinates: Object.freeze({ latitudeE2: 4101, longitudeE2: 2898 }),
  timeZone: 'Europe/Istanbul',
} as const satisfies ActiveLocation);

export const todayWardrobeItems = Object.freeze([
  Object.freeze({
    id: 'owned-jumpsuit',
    localProfileId: 'profile-one',
    name: 'Private rainy-day pair',
    category: 'one_piece',
    entryState: 'owned',
    garmentTypeId: 'jumpsuit',
    color: null,
    colorFamily: 'blue',
    thermalLevelOverride: null,
    waterProtectionOverride: 'waterproof',
    windProtectionOverride: null,
    breathabilityOverride: null,
    armCoverageOverride: null,
    legCoverageOverride: null,
    tractionSuitabilityOverride: null,
    photoRelativePath: null,
    createdAt: '2026-08-01T10:00:00.000Z',
    updatedAt: '2026-08-01T10:00:00.000Z',
    deletedAt: null,
  } as const satisfies WardrobeItem),
  Object.freeze({
    id: 'wanted-rain-jacket',
    localProfileId: 'profile-one',
    name: null,
    category: 'outerwear',
    entryState: 'wanted',
    garmentTypeId: 'rain_jacket',
    color: null,
    colorFamily: null,
    thermalLevelOverride: null,
    waterProtectionOverride: null,
    windProtectionOverride: null,
    breathabilityOverride: null,
    armCoverageOverride: null,
    legCoverageOverride: null,
    tractionSuitabilityOverride: null,
    photoRelativePath: null,
    createdAt: '2026-08-02T10:00:00.000Z',
    updatedAt: '2026-08-02T10:00:00.000Z',
    deletedAt: null,
  } as const satisfies WardrobeItem),
] as const);

export const todayScreenState = Object.freeze({
  kind: 'loaded',
  isRefreshing: false,
  refreshFailed: false,
  snapshot: Object.freeze({
    weather: todayWeatherSnapshot,
    activeLocation: todayActiveLocation,
    freshness: 'fresh',
    recommendation: recommendOutfits({
      snapshot: todayWeatherSnapshot,
      clothingPreference: 'womens',
      dayVariant: 0,
    }),
  }),
} as const satisfies TodayScreenState);

const todayRecommendation = todayScreenState.snapshot.recommendation;

if (todayRecommendation.status !== 'recommended') {
  throw new Error('Expected the Today fixture to contain a recommendation.');
}

export const aiAssistedTodayScreenState = Object.freeze({
  ...todayScreenState,
  isRefreshing: false,
  refreshFailed: false,
  snapshot: Object.freeze({
    ...todayScreenState.snapshot,
    recommendation: Object.freeze({
      ...todayRecommendation,
      generationMode: 'ai-assisted',
    }),
  }),
} as const satisfies TodayScreenState);
