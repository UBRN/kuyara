// One grid of real engine output, shared by the AI-selection tests. Every cell is produced
// by the functions the application itself calls, so a change in the catalog, the
// requirement thresholds or the composition rules moves the fixtures with it instead of
// leaving hand-written option sets behind.
import {
  listGarmentTypesForPreference,
} from '@/features/catalog/domain/garment-catalog';
import {
  evaluateGarmentEligibility,
  projectCatalogEffectiveGarment,
} from '@/features/recommendation/domain/garment-eligibility';
import { composeOutfitOptions } from '@/features/recommendation/domain/outfit-composition';
import { deriveClothingRequirements } from '@/features/recommendation/domain/weather-to-clothing-requirements';
import {
  aiRequestFromContext,
  createRecommendationContext,
} from '@/features/recommendation/data/worker-ai-recommendation-mapper';

const gridNow = '2026-09-13T12:00:00.000Z';
const gridLocalDayKey = '2026-09-13';
const gridDayVariant = 0;
const clothingPreferences = ['womens', 'mens'];
const dressStyles = ['casual', 'smart', 'formal'];

// The five profiles of the 2026-09-13 recon plus the two boundaries the requirement suite
// exercises: the exact wind and precipitation thresholds, and a day whose current heat and
// forecast cold collide so the cold side is demoted.
const weatherProfiles = Object.freeze({
  hot: {
    temperatureCelsius: 32,
    apparentTemperatureCelsius: 34,
    condition: 'clear',
    precipitationProbability: 0,
    windSpeedMetersPerSecond: 2,
  },
  mild: {
    temperatureCelsius: 17,
    apparentTemperatureCelsius: 17,
    condition: 'partly_cloudy',
    precipitationProbability: 0.1,
    windSpeedMetersPerSecond: 3,
  },
  cold_rain: {
    temperatureCelsius: 6,
    apparentTemperatureCelsius: 4,
    condition: 'rain',
    precipitationProbability: 0.75,
    windSpeedMetersPerSecond: 6,
  },
  freezing: {
    temperatureCelsius: -6,
    apparentTemperatureCelsius: -10,
    condition: 'snow',
    precipitationProbability: 0.5,
    windSpeedMetersPerSecond: 4,
  },
  windy: {
    temperatureCelsius: 14,
    apparentTemperatureCelsius: 11,
    condition: 'clear',
    precipitationProbability: 0.05,
    windSpeedMetersPerSecond: 11,
  },
  // wind exactly 8 m/s and precipitation exactly 0.6: both thresholds where the
  // requirement turns mandatory.
  boundary_wind_rain: {
    temperatureCelsius: 14,
    apparentTemperatureCelsius: 14,
    condition: 'cloudy',
    precipitationProbability: 0.6,
    windSpeedMetersPerSecond: 8,
  },
  // Current heat at the 28 °C mandatory threshold with a 4 °C daily minimum: the
  // conflicting day whose cold side is demoted to optional.
  boundary_conflicting_day: {
    temperatureCelsius: 28,
    apparentTemperatureCelsius: 28,
    condition: 'clear',
    precipitationProbability: 0,
    windSpeedMetersPerSecond: 1,
    minimumTemperatureCelsius: 4,
    maximumTemperatureCelsius: 30,
  },
});

function weatherSnapshot(weatherKey) {
  const profile = weatherProfiles[weatherKey];
  const measurements = {
    temperatureCelsius: profile.temperatureCelsius,
    apparentTemperatureCelsius: profile.apparentTemperatureCelsius,
    condition: profile.condition,
    precipitationProbability: profile.precipitationProbability,
    windSpeedMetersPerSecond: profile.windSpeedMetersPerSecond,
    humidity: 0.5,
    uvIndex: 0,
  };
  return Object.freeze({
    id: `weather-${weatherKey}`,
    localProfileId: 'profile-grid',
    locationKey: 'manual:sample.istanbul',
    timeZone: 'UTC',
    fetchedAt: gridNow,
    origin: { kind: 'sample', sourceId: 'recommendation-grid' },
    current: { observedAt: gridNow, ...measurements },
    minimumTemperatureCelsius:
      profile.minimumTemperatureCelsius ?? profile.temperatureCelsius - 2,
    maximumTemperatureCelsius:
      profile.maximumTemperatureCelsius ?? profile.temperatureCelsius + 2,
    hourly: [
      { forecastAt: '2026-09-13T13:00:00.000Z', ...measurements },
      { forecastAt: '2026-09-13T15:00:00.000Z', ...measurements },
    ],
  });
}

export function gridRecommendationInput(weatherKey, clothingPreference, dressStyle) {
  return {
    snapshot: weatherSnapshot(weatherKey),
    now: gridNow,
    clothingPreference,
    dressStyle,
    dayVariant: gridDayVariant,
    localDayKey: gridLocalDayKey,
  };
}

let requestCells;

/**
 * Clothing preference x dress style x weather profile, each cell carrying the context the
 * controller builds and the request it would send. `request` is null exactly where the
 * application would skip the AI tier.
 */
export function gridRequestCells() {
  requestCells ??= clothingPreferences.flatMap((clothingPreference) =>
    dressStyles.flatMap((dressStyle) =>
      Object.keys(weatherProfiles).map((weatherKey) => {
        const context = createRecommendationContext(
          gridRecommendationInput(weatherKey, clothingPreference, dressStyle),
          gridLocalDayKey,
        );
        return Object.freeze({
          name: `${clothingPreference}/${dressStyle}/${weatherKey}`,
          clothingPreference,
          dressStyle,
          weatherKey,
          context,
          request: aiRequestFromContext(context),
        });
      })));
  return requestCells;
}

let outfitCells;

/**
 * The same grid seen from the domain side: the composed `OutfitCandidate`s paired with the
 * `AiOption` projection the request carries for each of them.
 */
export function gridOutfitCells() {
  outfitCells ??= clothingPreferences.flatMap((clothingPreference) =>
    Object.keys(weatherProfiles).map((weatherKey) => {
      const input = gridRecommendationInput(weatherKey, clothingPreference, 'smart');
      const requirements = deriveClothingRequirements(input.snapshot, input.now);
      const composition = composeOutfitOptions(
        requirements,
        listGarmentTypesForPreference(clothingPreference).map((type) =>
          evaluateGarmentEligibility(
            requirements,
            projectCatalogEffectiveGarment(type.typeId, clothingPreference),
          )),
        gridDayVariant,
      );
      const cell = gridRequestCells().find((candidate) =>
        candidate.clothingPreference === clothingPreference &&
        candidate.dressStyle === 'smart' &&
        candidate.weatherKey === weatherKey);
      return Object.freeze({
        name: `${clothingPreference}/${weatherKey}`,
        outfits: composition.status === 'composed' ? composition.outfits : [],
        options: cell.context.options,
      });
    }));
  return outfitCells;
}

/**
 * A deterministic, evenly spread sample of index triples over `size` options: the whole
 * lexicographic list walked at a fixed stride, so a cell is covered without enumerating
 * C(24,3) and without a random seed.
 */
export function sampleIndexTriples(size, sampleSize) {
  const triples = [];
  for (let first = 0; first < size; first += 1) {
    for (let second = first + 1; second < size; second += 1) {
      for (let third = second + 1; third < size; third += 1) {
        triples.push([first, second, third]);
      }
    }
  }
  const stride = Math.max(1, Math.ceil(triples.length / sampleSize));
  return triples.filter((_triple, index) => index % stride === 0);
}
