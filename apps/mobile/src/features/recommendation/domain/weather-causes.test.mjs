import assert from 'node:assert/strict';
import test from 'node:test';

import { recommendOutfits } from '../application/recommend-outfits.ts';
import { maximumPiecesPerCause, weatherCauseLinks } from './weather-causes.ts';

const evaluation = (kind, status, suppliedByCandidateKeys, reasonCodes, extra = {}) => ({
  requirement: { kind, minimum: 'moderate', priority: 'mandatory', reasonCodes, ...extra },
  status,
  contribution: status === 'met' ? 100 : 40,
  observedContribution: status === 'met' ? 100 : 40,
  suppliedByCandidateKeys,
  tradeoffCandidateKeys: status === 'tradeoff' ? suppliedByCandidateKeys : [],
  reasonCodes,
});

const outermostFirst = ['coat', 'sweater', 'boots', 'shirt', 'trousers'];

test('each weather links the outermost pieces its met requirements name, in the fixed weather order', () => {
  const links = weatherCauseLinks([
    evaluation('thermal', 'met', ['shirt', 'sweater', 'coat', 'trousers'], ['temperature_low']),
    evaluation('wind_protection', 'met', ['coat'], ['wind_elevated']),
    evaluation('water_protection', 'met', ['coat'], ['condition_rain', 'precipitation_likely'], { target: 'body' }),
    evaluation('water_protection', 'met', ['boots'], ['condition_rain'], { target: 'feet' }),
  ], outermostFirst);

  assert.deepEqual(links, [
    { cause: 'rain', candidateKeys: ['coat', 'boots'] },
    { cause: 'cold', candidateKeys: ['coat', 'sweater'] },
    { cause: 'wind', candidateKeys: ['coat'] },
  ]);
  assert.equal(maximumPiecesPerCause, 2);
  assert.ok(Object.isFrozen(links) && Object.isFrozen(links[0]) && Object.isFrozen(links[0].candidateKeys));
});

test('sleet and snow are snow, heat and a wide day range have their own links', () => {
  assert.deepEqual(weatherCauseLinks([
    evaluation('traction', 'met', ['boots'], ['condition_sleet']),
    evaluation('breathability', 'met', ['shirt', 'trousers'], ['apparent_temperature_high']),
    evaluation('arm_coverage', 'met', ['sweater'], ['daily_range_wide']),
  ], outermostFirst), [
    { cause: 'snow', candidateKeys: ['boots'] },
    { cause: 'heat', candidateKeys: ['shirt', 'trousers'] },
    { cause: 'swing', candidateKeys: ['sweater'] },
  ]);
});

test('a trade-off, a shortfall, a requirement with no weather reason or no piece links nothing', () => {
  assert.deepEqual(weatherCauseLinks([
    evaluation('breathability', 'tradeoff', ['coat'], ['temperature_high']),
    evaluation('thermal', 'shortfall', ['coat'], ['temperature_low']),
    evaluation('thermal', 'met', ['coat'], ['daily_extrema_fallback']),
    evaluation('thermal', 'met', [], ['temperature_low']),
    evaluation('thermal', 'met', ['not-in-outfit'], ['temperature_low']),
  ], outermostFirst), []);
});

test('the composed outfits link a rainy day to their rain pieces and a mild day to nothing', () => {
  const day = (temperatureCelsius, condition, precipitationProbability) => {
    const measurements = {
      temperatureCelsius, apparentTemperatureCelsius: temperatureCelsius, condition,
      precipitationProbability, windSpeedMetersPerSecond: 2, humidity: 0.6, uvIndex: 1,
    };
    return {
      id: '018f0f4d-1d45-4ae7-a8f1-796e8297d3b4', localProfileId: 'profile-one',
      locationKey: 'manual:sample.istanbul', timeZone: 'Europe/Istanbul',
      fetchedAt: '2026-08-13T06:05:00.000Z', origin: { kind: 'sample', sourceId: 'test' },
      current: { observedAt: '2026-08-13T06:00:00.000Z', ...measurements },
      minimumTemperatureCelsius: temperatureCelsius - 1, maximumTemperatureCelsius: temperatureCelsius + 1,
      hourly: [{ forecastAt: '2026-08-13T07:00:00.000Z', ...measurements }],
    };
  };
  const outfits = (snapshot) => {
    const result = recommendOutfits({ snapshot, now: snapshot.current.observedAt, clothingPreference: 'womens', dayVariant: 0 });
    assert.equal(result.status, 'recommended');
    return result.outfits;
  };
  const keysOf = (outfit) => [...new Set(outfit.requirementEvaluations.flatMap(({ suppliedByCandidateKeys }) => suppliedByCandidateKeys))];
  for (const outfit of outfits(day(14, 'rain', 0.8))) {
    const rain = weatherCauseLinks(outfit.requirementEvaluations, keysOf(outfit)).find(({ cause }) => cause === 'rain');
    assert.ok(rain && rain.candidateKeys.length > 0);
  }
  for (const outfit of outfits(day(22, 'clear', 0))) {
    assert.deepEqual(weatherCauseLinks(outfit.requirementEvaluations, keysOf(outfit)), []);
  }
});
