import assert from 'node:assert/strict';
import test from 'node:test';

import { recommendOutfits } from './recommend-outfits.ts';
import { outfitSummary } from './outfit-summary.ts';
import { assignedOutfitGarments } from '../domain/outfit-model.ts';
import { archetypeLabel } from '../localization/recommendation-messages.ts';
import { messages } from '../../../localization/messages.ts';

// ADR 0042 section 3: the summary the Siri card reads, projected from a saved snapshot.

const istanbul = 'Europe/Istanbul';

function weather(temperature, condition, precipitation) {
  const now = {
    temperatureCelsius: temperature, apparentTemperatureCelsius: temperature, condition,
    precipitationProbability: precipitation, windSpeedMetersPerSecond: 3, humidity: 0.6, uvIndex: 1,
  };
  return {
    id: '018f0f4d-1d45-4ae7-a8f1-796e8297d3b4', localProfileId: 'profile-one', locationKey: 'manual:sample.istanbul',
    timeZone: istanbul, fetchedAt: '2026-10-11T06:05:00.000Z', origin: { kind: 'sample', sourceId: 'sample' },
    current: { observedAt: '2026-10-11T06:00:00.000Z', ...now },
    minimumTemperatureCelsius: temperature - 1, maximumTemperatureCelsius: temperature + 1,
    hourly: [{ forecastAt: '2026-10-11T07:00:00.000Z', ...now }],
  };
}

function snapshot(overrides = {}) {
  const forecast = weather(18, 'partly_cloudy', 0.1);
  const recommendation = recommendOutfits({
    snapshot: forecast, now: forecast.current.observedAt, clothingPreference: 'womens', dayVariant: 2,
  });
  assert.equal(recommendation.status, 'recommended');
  return {
    id: 'snapshot-one',
    localProfileId: 'profile-one',
    weatherSnapshotId: forecast.id,
    locationKey: 'coords:41.0082,28.9784',
    clothingPreference: 'womens',
    dressStyle: 'casual',
    catalogVersion: 1,
    dayVariant: 2,
    localDayKey: '2026-10-11',
    paletteWeather: { temperatureC: 18.4, condition: 'partly_cloudy' },
    generationMode: 'ai-assisted',
    recommendation: { ...recommendation, insightSentence: 'A private AI sentence.', insightLocale: 'en' },
    createdAt: '2026-10-11T06:06:00.000Z',
    updatedAt: '2026-10-11T06:06:00.000Z',
    ...overrides,
  };
}

function pieceNames(outfit, language) {
  return assignedOutfitGarments(outfit).map(({ garment }) =>
    messages[language].catalog[`catalog.garment_type.${garment.garmentTypeId}.name`]);
}

function summary(overrides = {}, input = {}) {
  return outfitSummary({
    snapshot: snapshot(overrides),
    language: 'tr',
    temperatureUnit: 'celsius',
    timeZone: istanbul,
    ...input,
  });
}

test('a day snapshot projects to a version 1 summary bounded by its dressing day', () => {
  const source = snapshot();
  const result = summary();
  const outfits = source.recommendation.outfits.slice(0, 3);
  assert.ok(outfits.length >= 1);
  assert.deepEqual(result, {
    version: 1,
    language: 'tr',
    timeZone: istanbul,
    validFrom: '2026-10-11T01:00:00.000Z',
    validUntil: '2026-10-11T15:00:00.000Z',
    spokenLine: `Bugünün kombini ${archetypeLabel(messages.tr.recommendation, outfits[0].archetypeId, 'weekend')}: ${
      pieceNames(outfits[0], 'tr').join(', ')}.`,
    labels: {
      chosenFor: 'Seçildiği hava: 18°C, Parçalı bulutlu',
      anotherOption: 'Başka seçenek',
    },
    outfits: outfits.map((outfit) => ({
      optionId: outfit.optionId,
      name: archetypeLabel(messages.tr.recommendation, outfit.archetypeId, 'weekend'),
      pieces: pieceNames(outfit, 'tr'),
    })),
  });
});

test('an evening snapshot speaks of the evening and runs to 04:00, in English and Fahrenheit', () => {
  const result = summary({ localDayKey: '2026-10-12:evening' }, { language: 'en', temperatureUnit: 'fahrenheit' });
  assert.equal(result.language, 'en');
  assert.equal(result.validFrom, '2026-10-12T15:00:00.000Z');
  assert.equal(result.validUntil, '2026-10-13T01:00:00.000Z');
  assert.match(result.spokenLine, /^This evening’s outfit is .+: .+\.$/);
  assert.equal(result.labels.chosenFor, 'Chosen for: 65°F, Partly cloudy');
  assert.equal(result.labels.anotherOption, 'Another option');
  // 12 October 2026 is a Monday: the outfit names follow the weekday.
  assert.deepEqual(result.outfits.map(({ name }) => name), snapshot().recommendation.outfits.slice(0, 3)
    .map((outfit) => archetypeLabel(messages.en.recommendation, outfit.archetypeId, 'weekday')));
});

test('a snapshot without its generation weather has no chosen-for label', () => {
  const result = summary({ paletteWeather: undefined });
  assert.deepEqual(Object.keys(result.labels), ['anotherOption']);
});

test('a day without an outfit says so instead of leaving an earlier outfit in place', () => {
  const unavailable = summary({
    recommendation: { status: 'unavailable', requirements: snapshot().recommendation.requirements, failure: { code: 'no_outfit' } },
  });
  assert.deepEqual(unavailable.outfits, []);
  assert.equal(unavailable.spokenLine, 'Şu an gösterilecek kombin yok.');
  assert.equal(unavailable.validUntil, '2026-10-11T15:00:00.000Z');
  assert.deepEqual(summary({ recommendation: { ...snapshot().recommendation, outfits: [] } }, { language: 'en' }).spokenLine,
    'There is no outfit to show right now.');
});

test('nothing is projected without a dressing day or a known zone', () => {
  assert.equal(summary({ localDayKey: null }), null);
  assert.equal(summary({}, { timeZone: 'Mars/Olympus' }), null);
});

test('the summary carries no location, identity, provider or AI prose', () => {
  const text = JSON.stringify(summary());
  for (const forbidden of ['profile-one', 'snapshot-one', 'coords', '41.0082', '28.9784', 'manual:',
    '018f0f4d', 'ai-assisted', 'private AI sentence', 'sample', 'womens', 'casual']) {
    assert.equal(text.includes(forbidden), false, forbidden);
  }
  assert.deepEqual(Object.keys(summary()).sort(),
    ['labels', 'language', 'outfits', 'spokenLine', 'timeZone', 'validFrom', 'validUntil', 'version']);
});
