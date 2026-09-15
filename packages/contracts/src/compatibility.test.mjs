// Wire compatibility for the schemas installed binaries carry.
//
// The mobile app parses every Worker response with the Zod schemas compiled into its own
// bundle, so a schema change ships only with a new binary while the Worker ships whenever it
// is deployed. Two kinds of guard live here:
//
//  - Golden payloads: the exact success and error bodies build 0.1.20260913 (build 8, commit
//    67c20ae) expected. Today's schemas must still parse them, so a deployed Worker keeps
//    serving the binaries already in the field.
//  - Tolerance: response schemas ignore unknown keys and strip them, so a published Worker may
//    add a response field without breaking installed binaries. Request schemas stay strict;
//    the Worker owns them and an unknown request key is a client bug, not a version skew.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  aiProbeV1SuccessSchema,
  aiReadyV1SuccessSchema,
  aiRecommendV1RequestSchema,
  aiRecommendV1SuccessSchema,
  aiV1ErrorSchema,
  healthV1SuccessSchema,
} from './ai-v1.ts';
import {
  placeSearchV1ErrorSchema,
  placeSearchV1RequestSchema,
  placeSearchV1SuccessSchema,
} from './place-search-v1.ts';
import {
  weatherV1ErrorSchema,
  weatherV1RequestSchema,
  weatherV1SuccessSchema,
} from './weather-v1.ts';

// --- Golden payloads (build 0.1.20260913, build 8, commit 67c20ae) -----------------------
//
// Literals on purpose: a fixture read from git would drift with the file it was read from.

const measurements = () => ({
  temperatureCelsius: 16.4,
  apparentTemperatureCelsius: 15.1,
  condition: 'rain',
  precipitationProbability: 0.55,
  windSpeedMetersPerSecond: 4.2,
  humidity: 0.72,
  uvIndex: 3,
});

export const build8WeatherSuccess = () => ({
  data: {
    timeZone: 'Europe/Istanbul',
    fetchedAt: '2026-09-13T09:30:00.000Z',
    origin: { kind: 'live', sourceId: 'weatherkit' },
    current: { ...measurements(), observedAt: '2026-09-13T09:30:00.000Z' },
    minimumTemperatureCelsius: 12,
    maximumTemperatureCelsius: 19,
    hourly: [
      { ...measurements(), forecastAt: '2026-09-13T10:00:00.000Z' },
      { ...measurements(), forecastAt: '2026-09-13T11:00:00.000Z' },
      { ...measurements(), forecastAt: '2026-09-13T12:00:00.000Z' },
    ],
  },
});

export const build8WeatherError = () => ({ error: { code: 'weather_unavailable' } });

export const build8AiRecommendSuccess = () => ({
  data: {
    picks: [
      { optionId: 'opt-01', archetypeId: 'everyday_easy' },
      { optionId: 'opt-07', archetypeId: 'rain_ready' },
      { optionId: 'opt-19', archetypeId: 'smart_casual' },
    ],
  },
});

export const build8AiError = () => ({ error: { code: 'ai_unavailable' } });

export const build8AiProbeSuccess = () => ({
  data: {
    status: 'ok',
    checkedAt: '2026-09-13T09:30:00.000Z',
    assistant: { providerId: 'workers-ai', model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast' },
  },
});

export const build8HealthSuccess = () => ({ data: { status: 'ok' } });

export const build8AiReadySuccess = () => ({ data: { status: 'ready' } });

export const build8PlaceSearchSuccess = () => ({
  data: {
    places: [
      {
        id: 'place.745044',
        displayName: 'Istanbul',
        region: 'Istanbul, Turkiye',
        latitudeE2: 4101,
        longitudeE2: 2897,
        timeZone: 'Europe/Istanbul',
      },
      {
        id: 'place.323786',
        displayName: 'Izmir',
        region: 'Izmir, Turkiye',
        latitudeE2: 3842,
        longitudeE2: 2714,
        timeZone: null,
      },
    ],
    attribution: ['open-meteo', 'geonames'],
  },
});

export const build8PlaceSearchError = () => ({ error: { code: 'places_unavailable' } });

/** Every golden, named for the proof script in the scratchpad and for the tests below. */
export const build8Goldens = [
  { name: 'weather success', schemaName: 'weatherV1SuccessSchema', payload: build8WeatherSuccess },
  { name: 'weather error', schemaName: 'weatherV1ErrorSchema', payload: build8WeatherError },
  {
    name: 'ai recommend success',
    schemaName: 'aiRecommendV1SuccessSchema',
    payload: build8AiRecommendSuccess,
  },
  { name: 'ai error', schemaName: 'aiV1ErrorSchema', payload: build8AiError },
  { name: 'ai probe success', schemaName: 'aiProbeV1SuccessSchema', payload: build8AiProbeSuccess },
  { name: 'health success', schemaName: 'healthV1SuccessSchema', payload: build8HealthSuccess },
  { name: 'ai ready success', schemaName: 'aiReadyV1SuccessSchema', payload: build8AiReadySuccess },
  {
    name: 'place search success',
    schemaName: 'placeSearchV1SuccessSchema',
    payload: build8PlaceSearchSuccess,
  },
  {
    name: 'place search error',
    schemaName: 'placeSearchV1ErrorSchema',
    payload: build8PlaceSearchError,
  },
];

const schemasByName = {
  weatherV1SuccessSchema,
  weatherV1ErrorSchema,
  aiRecommendV1SuccessSchema,
  aiV1ErrorSchema,
  aiProbeV1SuccessSchema,
  healthV1SuccessSchema,
  aiReadyV1SuccessSchema,
  placeSearchV1SuccessSchema,
  placeSearchV1ErrorSchema,
};

test('today’s schemas still parse the payloads build 8 expected', () => {
  for (const { name, schemaName, payload } of build8Goldens) {
    const result = schemasByName[schemaName].safeParse(payload());
    assert.equal(result.success, true, `${name} must parse: ${JSON.stringify(result.error?.issues)}`);
  }
});

// --- Unknown response fields are accepted and stripped -----------------------------------

const unknownKey = 'futureField';

/** Returns a copy of `payload` with `futureField` added at `path`. */
function withUnknownFieldAt(payload, path) {
  const clone = structuredClone(payload);
  let target = clone;
  for (const step of path) target = target[step];
  target[unknownKey] = 1;
  return clone;
}

function valueAt(value, path) {
  let target = value;
  for (const step of path) target = target[step];
  return target;
}

/**
 * One entry per object level of every response schema: the top level and each nested object.
 * A Worker may add a field at any of these levels, so every level must tolerate one.
 */
const responseLevels = [
  ['weatherV1SuccessSchema root', 'weatherV1SuccessSchema', build8WeatherSuccess, []],
  ['weatherV1SuccessSchema data', 'weatherV1SuccessSchema', build8WeatherSuccess, ['data']],
  [
    'weatherV1SuccessSchema data.origin',
    'weatherV1SuccessSchema',
    build8WeatherSuccess,
    ['data', 'origin'],
  ],
  [
    'weatherV1SuccessSchema data.current',
    'weatherV1SuccessSchema',
    build8WeatherSuccess,
    ['data', 'current'],
  ],
  [
    'weatherV1SuccessSchema data.hourly[0]',
    'weatherV1SuccessSchema',
    build8WeatherSuccess,
    ['data', 'hourly', 0],
  ],
  ['weatherV1ErrorSchema root', 'weatherV1ErrorSchema', build8WeatherError, []],
  ['weatherV1ErrorSchema error', 'weatherV1ErrorSchema', build8WeatherError, ['error']],
  [
    'aiRecommendV1SuccessSchema root',
    'aiRecommendV1SuccessSchema',
    build8AiRecommendSuccess,
    [],
  ],
  [
    'aiRecommendV1SuccessSchema data',
    'aiRecommendV1SuccessSchema',
    build8AiRecommendSuccess,
    ['data'],
  ],
  [
    'aiRecommendV1SuccessSchema data.picks[0]',
    'aiRecommendV1SuccessSchema',
    build8AiRecommendSuccess,
    ['data', 'picks', 0],
  ],
  ['aiV1ErrorSchema root', 'aiV1ErrorSchema', build8AiError, []],
  ['aiV1ErrorSchema error', 'aiV1ErrorSchema', build8AiError, ['error']],
  ['aiProbeV1SuccessSchema root', 'aiProbeV1SuccessSchema', build8AiProbeSuccess, []],
  ['aiProbeV1SuccessSchema data', 'aiProbeV1SuccessSchema', build8AiProbeSuccess, ['data']],
  [
    'aiProbeV1SuccessSchema data.assistant',
    'aiProbeV1SuccessSchema',
    build8AiProbeSuccess,
    ['data', 'assistant'],
  ],
  ['healthV1SuccessSchema root', 'healthV1SuccessSchema', build8HealthSuccess, []],
  ['healthV1SuccessSchema data', 'healthV1SuccessSchema', build8HealthSuccess, ['data']],
  ['aiReadyV1SuccessSchema root', 'aiReadyV1SuccessSchema', build8AiReadySuccess, []],
  ['aiReadyV1SuccessSchema data', 'aiReadyV1SuccessSchema', build8AiReadySuccess, ['data']],
  ['placeSearchV1SuccessSchema root', 'placeSearchV1SuccessSchema', build8PlaceSearchSuccess, []],
  [
    'placeSearchV1SuccessSchema data',
    'placeSearchV1SuccessSchema',
    build8PlaceSearchSuccess,
    ['data'],
  ],
  [
    'placeSearchV1SuccessSchema data.places[0]',
    'placeSearchV1SuccessSchema',
    build8PlaceSearchSuccess,
    ['data', 'places', 0],
  ],
  ['placeSearchV1ErrorSchema root', 'placeSearchV1ErrorSchema', build8PlaceSearchError, []],
  ['placeSearchV1ErrorSchema error', 'placeSearchV1ErrorSchema', build8PlaceSearchError, ['error']],
];

for (const [name, schemaName, payload, path] of responseLevels) {
  test(`a published Worker may add a field at ${name}`, () => {
    const result = schemasByName[schemaName].safeParse(withUnknownFieldAt(payload(), path));
    assert.equal(
      result.success,
      true,
      `an unknown key at ${name} must not reject the response: ${JSON.stringify(result.error?.issues)}`,
    );
    assert.equal(
      Object.hasOwn(valueAt(result.data, path), unknownKey),
      false,
      `an unknown key at ${name} must be stripped, not carried into the domain`,
    );
  });
}

// --- Unknown enum members: recorded current behaviour, not a defect ----------------------
//
// A response schema tolerates an unknown FIELD but not an unknown enum MEMBER. A fourth
// provider sourceId, a new weather condition code or a new error code still rejects the whole
// payload on every installed binary, so adding one is a breaking change that has to wait for
// the next release. The named-unknown branch that would soften this (an `unknown` member each
// side maps deliberately) is an open product decision, not a todo for this file.

test('an unknown origin.sourceId still rejects the whole weather payload', () => {
  const payload = build8WeatherSuccess();
  payload.data.origin.sourceId = 'met-norway';
  assert.equal(weatherV1SuccessSchema.safeParse(payload).success, false);
});

test('an unknown current.condition still rejects the whole weather payload', () => {
  const payload = build8WeatherSuccess();
  payload.data.current.condition = 'hail';
  assert.equal(weatherV1SuccessSchema.safeParse(payload).success, false);
});

test('an unknown error.code still rejects the whole weather error payload', () => {
  const payload = build8WeatherError();
  payload.error.code = 'upstream_degraded';
  assert.equal(weatherV1ErrorSchema.safeParse(payload).success, false);
});

// --- Request schemas stay strict ----------------------------------------------------------

const validWeatherRequest = () => ({
  latitudeE2: 4101,
  longitudeE2: 2897,
  timeZone: 'Europe/Istanbul',
});

const validAiRecommendRequest = () => ({
  clothingPreference: 'womens',
  dressStyle: 'smart',
  catalogVersion: 1,
  dayVariant: 0,
  requirements: [
    { kind: 'thermal', minimum: 'light', priority: 'mandatory', reasonCodes: ['temperature_low'] },
  ],
  options: [
    {
      optionId: 'opt-01',
      formality: 'smart',
      garments: [
        { slot: 'primary_top', layerRole: 'base', garmentTypeId: 'shirt' },
        { slot: 'bottom', layerRole: null, garmentTypeId: 'trousers' },
        { slot: 'footwear', layerRole: null, garmentTypeId: 'closed_shoes' },
      ],
      traits: {
        hasMidLayer: false,
        hasOuterLayer: false,
        outerThermalHigh: false,
        outerWaterProtective: false,
        windResistant: false,
        tractionEnhanced: false,
        breathabilityHigh: true,
      },
    },
  ],
});

const validPlaceSearchRequest = () => ({ query: 'istanbul', limit: 5, language: 'tr' });

const requestSchemas = [
  ['weatherV1RequestSchema', weatherV1RequestSchema, validWeatherRequest],
  ['aiRecommendV1RequestSchema', aiRecommendV1RequestSchema, validAiRecommendRequest],
  ['placeSearchV1RequestSchema', placeSearchV1RequestSchema, validPlaceSearchRequest],
];

for (const [name, schema, payload] of requestSchemas) {
  test(`${name} stays strict`, () => {
    assert.equal(schema.safeParse(payload()).success, true);
    assert.equal(schema.safeParse({ ...payload(), [unknownKey]: 1 }).success, false);
  });
}

test('aiRecommendV1RequestSchema stays strict inside its nested request objects', () => {
  const nested = validAiRecommendRequest();
  nested.options[0][unknownKey] = 1;
  assert.equal(aiRecommendV1RequestSchema.safeParse(nested).success, false);

  const nestedTraits = validAiRecommendRequest();
  nestedTraits.options[0].traits[unknownKey] = 1;
  assert.equal(aiRecommendV1RequestSchema.safeParse(nestedTraits).success, false);

  const nestedGarment = validAiRecommendRequest();
  nestedGarment.options[0].garments[0][unknownKey] = 1;
  assert.equal(aiRecommendV1RequestSchema.safeParse(nestedGarment).success, false);

  const nestedRequirement = validAiRecommendRequest();
  nestedRequirement.requirements[0][unknownKey] = 1;
  assert.equal(aiRecommendV1RequestSchema.safeParse(nestedRequirement).success, false);
});
