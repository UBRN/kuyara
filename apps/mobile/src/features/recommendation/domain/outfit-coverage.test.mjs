import assert from 'node:assert/strict';
import test from 'node:test';

import { archetypeDayFromRequirements } from '@kuyara/contracts';

import { coverageDrift, forecastBoundedCoverage, laterCoolSpell, outfitCoverage } from './outfit-coverage.ts';
import { deriveClothingRequirements } from './weather-to-clothing-requirements.ts';
import { wardrobeDayWindow } from '../../weather/domain/wardrobe-day.ts';

test('coverage end follows departure hour across the full dressing day', () => {
  for (let hour = 0; hour < 24; hour += 1) {
    const start = `2026-09-25T${String(hour).padStart(2, '0')}:00:00.000Z`;
    const expected = hour < 1 ? '2026-09-25T01:00:00.000Z'
      : hour < 4 ? '2026-09-25T04:00:00.000Z'
        : hour < 11 ? '2026-09-25T19:00:00.000Z'
          : hour < 16 ? '2026-09-25T20:00:00.000Z'
            : hour < 18 ? '2026-09-25T22:00:00.000Z'
              : '2026-09-26T01:00:00.000Z';
    assert.deepEqual(outfitCoverage(start, 'UTC'), { start, end: expected }, start);
  }
  for (const [clock, expected] of [
    ['00:59', '2026-09-25T01:00:00.000Z'],
    ['01:00', '2026-09-25T04:00:00.000Z'],
    ['10:59', '2026-09-25T19:00:00.000Z'],
    ['11:00', '2026-09-25T20:00:00.000Z'],
    ['15:59', '2026-09-25T20:00:00.000Z'],
    ['16:00', '2026-09-25T22:00:00.000Z'],
    ['17:59', '2026-09-25T22:00:00.000Z'],
    ['18:00', '2026-09-26T01:00:00.000Z'],
  ]) {
    assert.equal(outfitCoverage(`2026-09-25T${clock}:00.000Z`, 'UTC')?.end, expected);
  }
});

test('coverage resolves its end in the snapshot zone across daylight saving time', () => {
  // New York falls back on 1 November 2026: 01:00 occurs twice. The first closes
  // an evening selection; an open during the second 01:00 runs to 04:00 EST.
  assert.equal(outfitCoverage('2026-11-01T00:00:00.000Z', 'America/New_York')?.end,
    '2026-11-01T05:00:00.000Z');
  assert.equal(outfitCoverage('2026-11-01T06:30:00.000Z', 'America/New_York')?.end,
    '2026-11-01T09:00:00.000Z');
  // London skips 01:00 on 29 March. The evening window still ends at the first
  // real local time after its nominal end, 02:00 BST.
  assert.equal(outfitCoverage('2026-03-28T19:00:00.000Z', 'Europe/London')?.end,
    '2026-03-29T01:00:00.000Z');
});

const hour = (clock, values = {}) => ({
  forecastAt: `2026-09-25T${clock}:00.000Z`, temperatureCelsius: 16, apparentTemperatureCelsius: 16,
  condition: 'cloudy', precipitationProbability: 0.1, windSpeedMetersPerSecond: 2, humidity: 0.5,
  uvIndex: 1, ...values,
});
const noRequirements = { requirements: [], reasonCodes: [] };
// A reading that asks for nothing, for drift cases whose question lies in the hours ahead.
const calm = hour('00:00');
/** Weather fetched at `fetchedAt`: fresh for thirty minutes, then stale. */
const weather = (hourly, current = calm, fetchedAt = '2026-09-25T13:00:00.000Z') =>
  ({ fetchedAt, current: { ...current, observedAt: fetchedAt }, hourly });
const window = (start, end) => ({ start, end });

test('a short forecast ends the promised window at its last hour, never past it', () => {
  const coverage = { start: '2026-09-25T13:00:00.000Z', end: '2026-09-25T20:00:00.000Z' };
  const full = ['13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00'].map((clock) => hour(clock));
  assert.deepEqual(forecastBoundedCoverage(coverage, full), coverage);
  assert.deepEqual(forecastBoundedCoverage(coverage, full.slice(0, 6)),
    { start: coverage.start, end: '2026-09-25T18:00:00.000Z' });
  assert.equal(forecastBoundedCoverage(coverage, []), null);
});

test('the forecast hour that contains the start still counts, so the caption survives just after midnight', () => {
  // A 00:20 departure runs to 01:00. Hourly data from 00:00 holds no hour after the start,
  // but the 00:00 hour covers the whole window.
  const midnight = outfitCoverage('2026-09-25T00:20:00.000Z', 'UTC');
  assert.deepEqual(midnight, { start: '2026-09-25T00:20:00.000Z', end: '2026-09-25T01:00:00.000Z' });
  const fromMidnight = ['00:00', '01:00', '02:00'].map((clock) => hour(clock));
  assert.deepEqual(forecastBoundedCoverage(midnight, fromMidnight), midnight);
  assert.deepEqual(forecastBoundedCoverage(midnight, fromMidnight.slice(0, 1)), midnight);
  // A forecast that stops inside a longer window ends it at the end of the covering hour.
  const afternoon = { start: '2026-09-25T13:00:00.000Z', end: '2026-09-25T20:00:00.000Z' };
  assert.deepEqual(forecastBoundedCoverage(afternoon, [hour('13:00')]),
    { start: afternoon.start, end: '2026-09-25T14:00:00.000Z' });
  // A forecast that ended before the start describes nothing of the window.
  assert.equal(forecastBoundedCoverage(midnight, [{ ...hour('22:00'), forecastAt: '2026-09-24T22:00:00.000Z' }]), null);
  assert.equal(forecastBoundedCoverage(afternoon, [hour('11:00'), hour('12:00')]), null);
});

test('drift names rain the outfit was not chosen for, and stays quiet when it was', () => {
  const hours = [hour('13:00'), hour('17:00', { condition: 'rain' }), hour('18:00', { condition: 'rain' })];
  assert.deepEqual(coverageDrift(noRequirements, weather(hours), '2026-09-25T13:10:00.000Z',
    window('2026-09-25T13:00:00.000Z', '2026-09-25T19:00:00.000Z')),
    { kind: 'rain', at: '2026-09-25T17:00:00.000Z' });
  const rainReady = { reasonCodes: [], requirements: [{ kind: 'water_protection', target: 'body',
    minimum: 'waterproof', priority: 'mandatory', reasonCodes: ['condition_rain'] }] };
  assert.equal(coverageDrift(rainReady, weather(hours), '2026-09-25T13:10:00.000Z',
    window('2026-09-25T13:00:00.000Z', '2026-09-25T19:00:00.000Z')), null);
  // Rain after the window ends is not this outfit's business.
  assert.equal(coverageDrift(noRequirements, weather(hours), '2026-09-25T13:10:00.000Z',
    window('2026-09-25T13:00:00.000Z', '2026-09-25T17:00:00.000Z')), null);
  assert.equal(coverageDrift(noRequirements, weather([hour('15:00', { condition: 'snow' })]),
    '2026-09-25T13:10:00.000Z', window('2026-09-25T13:00:00.000Z', '2026-09-25T19:00:00.000Z'))?.kind, 'snow');
});

test('a fresh choice never drifts against the weather it was chosen from', () => {
  // Ankara, 17 Oct 23:31: the reading says partly cloudy at 33 %, while the forecast entry for
  // the hour in progress says rain. The choice reads the reading for that hour, so the day is
  // only possibly wet: a storm coat earns Rain Ready, yet nothing waterproof is mandatory.
  const measured = (forecastAt, temperatureCelsius, apparentTemperatureCelsius, condition,
    precipitationProbability, windSpeedMetersPerSecond, humidity) => ({ forecastAt,
    temperatureCelsius, apparentTemperatureCelsius, condition, precipitationProbability,
    windSpeedMetersPerSecond, humidity, uvIndex: 0 });
  const snapshot = {
    id: '00664f02-c938-48dd-9115-83901f8c3669', localProfileId: 'profile-one',
    locationKey: 'manual:ankara', timeZone: 'Europe/Istanbul', fetchedAt: '2026-10-17T20:28:10.647Z',
    origin: { kind: 'live', sourceId: 'open-meteo' },
    current: { observedAt: '2026-10-17T20:15:00.000Z', temperatureCelsius: 9.9,
      apparentTemperatureCelsius: 6.3, condition: 'partly_cloudy', precipitationProbability: 0.33,
      windSpeedMetersPerSecond: 4.55, humidity: 0.73, uvIndex: 0 },
    minimumTemperatureCelsius: 7.9, maximumTemperatureCelsius: 13.5,
    hourly: [
      measured('2026-10-17T20:00:00.000Z', 10.2, 6.7, 'rain', 0.33, 4.61, 0.73),
      measured('2026-10-17T21:00:00.000Z', 8.5, 4.8, 'partly_cloudy', 0.05, 4.63, 0.76),
      measured('2026-10-17T22:00:00.000Z', 7.2, 3.2, 'partly_cloudy', 0.03, 4.62, 0.75),
    ],
  };
  const chosenAt = '2026-10-17T20:31:00.000Z';
  const chosen = deriveClothingRequirements(snapshot, chosenAt);
  assert.equal(archetypeDayFromRequirements(chosen.requirements).wet, true);
  assert.equal(chosen.requirements.some((requirement) => requirement.kind === 'water_protection'
    && requirement.priority === 'mandatory'), false);
  const coverage = outfitCoverage(chosenAt, snapshot.timeZone);
  assert.equal(coverageDrift(chosen, snapshot, '2026-10-17T20:34:00.000Z', coverage), null);
  // The reading speaks for the hour in progress, not that hour's forecast entry: a reading that
  // turns wet under a dry entry is drift, and it is happening now.
  const dryEntry = [{ ...snapshot.hourly[0], condition: 'partly_cloudy' }, ...snapshot.hourly.slice(1)];
  const wetReading = { ...snapshot, fetchedAt: '2026-10-17T20:45:00.000Z', hourly: dryEntry,
    current: { ...snapshot.current, condition: 'rain', precipitationProbability: 0.8 } };
  assert.deepEqual(coverageDrift(chosen, wetReading, '2026-10-17T20:50:00.000Z', coverage),
    { kind: 'rain', at: '2026-10-17T20:00:00.000Z' });
});

const at = (clock) => `2026-09-25T${clock}:00.000Z`;

test('before a later departure the present is not part of the window', () => {
  // Chosen at 16:05 for 18:00: raining now, dry from 18:00. The choice never read the rain.
  const hours = ['16:00', '17:00'].map((clock) => hour(clock, { condition: 'rain', precipitationProbability: 0.9 }))
    .concat(['18:00', '19:00', '20:00', '21:00'].map((clock) => hour(clock)));
  const snapshot = { ...weather(hours, hours[0], at('16:00')), timeZone: 'UTC',
    minimumTemperatureCelsius: 16, maximumTemperatureCelsius: 17 };
  const chosen = deriveClothingRequirements(snapshot, at('16:05'), at('18:00'));
  const coverage = outfitCoverage(at('18:00'), 'UTC');
  assert.equal(coverageDrift(chosen, snapshot, at('16:10'), coverage), null);
  // Rain forecast inside the window still counts, from the departure on.
  const laterRain = { ...snapshot, hourly: hours.map((value) => value.forecastAt === at('19:00')
    ? { ...value, condition: 'rain' } : value) };
  assert.deepEqual(coverageDrift(chosen, laterRain, at('16:10'), coverage), { kind: 'rain', at: at('19:00') });
  // Once the departure is reached, the reading speaks for the hour in progress.
  const wetAtDeparture = { ...snapshot, fetchedAt: at('17:55'),
    current: { ...hours[0], observedAt: at('17:55') } };
  assert.equal(coverageDrift(chosen, wetAtDeparture, at('17:59'), coverage), null);
  assert.deepEqual(coverageDrift(chosen, wetAtDeparture, at('18:00'), coverage), { kind: 'rain', at: at('18:00') });
});

test('a stale reading gives way to the forecast hour that contains now', () => {
  // Fetched at 13:00 under a dry sky; by 14:20 the snapshot is stale and its 14:00 hour rains.
  const hours = [hour('13:00'), hour('14:00', { condition: 'rain' }), hour('15:00')];
  const coverage = window(at('13:00'), at('19:00'));
  assert.deepEqual(coverageDrift(noRequirements, weather(hours), at('14:20'), coverage),
    { kind: 'rain', at: at('14:00') });
  // The caption ends with that hour.
  assert.equal(coverageDrift(noRequirements, weather(hours), at('15:00'), coverage), null);
  // While the snapshot is fresh the observation speaks for its hour instead.
  assert.equal(coverageDrift(noRequirements, weather(hours, calm, at('14:00')), at('14:20'), coverage), null);
});

test('the reading stands at the start of the hour in progress, so the cold rule pairs it', () => {
  const cold = { temperatureCelsius: 10, apparentTemperatureCelsius: 10 };
  const coverage = window(at('14:00'), at('20:00'));
  // The 14:00 entry is mild, the reading and the next hour are cold: two hours under 12.
  const withEntry = weather([hour('14:00'), hour('15:00', cold)], hour('14:00', cold), at('14:15'));
  assert.deepEqual(coverageDrift(noRequirements, withEntry, at('14:20'), coverage), { kind: 'cold', at: at('14:00') });
  // Without an entry for the hour in progress, the reading still takes that hour's start.
  const noEntry = weather([hour('15:00', cold), hour('16:00')], hour('14:00', cold), at('14:15'));
  assert.deepEqual(coverageDrift(noRequirements, noEntry, at('14:20'), coverage), { kind: 'cold', at: at('14:00') });
  const wetNoEntry = weather([hour('15:00')], hour('14:00', { condition: 'rain' }), at('14:15'));
  assert.deepEqual(coverageDrift(noRequirements, wetNoEntry, at('14:20'), coverage), { kind: 'rain', at: at('14:00') });
});

test('exactly on an hour start that hour is read as the requirements read it', () => {
  // A choice made now reads the reading and every hour from now on, the one starting now too.
  const hours = [hour('15:00', { condition: 'rain' }), hour('16:00')];
  const coverage = window(at('15:00'), at('20:00'));
  assert.deepEqual(coverageDrift(noRequirements, weather(hours, calm, at('15:00')), at('15:00'), coverage),
    { kind: 'rain', at: at('15:00') });
});

test('drift follows the mandatory cold rule: two hours under 12 or one under 5', () => {
  const end = window('2026-09-25T16:00:00.000Z', '2026-09-25T22:00:00.000Z');
  const at16 = (hours) => weather(hours, calm, '2026-09-25T16:00:00.000Z');
  const single = [hour('18:00', { temperatureCelsius: 11, apparentTemperatureCelsius: 11 }), hour('19:00')];
  assert.equal(coverageDrift(noRequirements, at16(single), '2026-09-25T16:00:00.000Z', end), null);
  const twoHours = [hour('18:00', { apparentTemperatureCelsius: 11 }), hour('19:00', { apparentTemperatureCelsius: 10 })];
  assert.deepEqual(coverageDrift(noRequirements, at16(twoHours), '2026-09-25T16:00:00.000Z', end),
    { kind: 'cold', at: '2026-09-25T18:00:00.000Z' });
  const freezing = [hour('20:00', { apparentTemperatureCelsius: 4 })];
  assert.equal(coverageDrift(noRequirements, at16(freezing), '2026-09-25T16:00:00.000Z', end)?.at,
    '2026-09-25T20:00:00.000Z');
  const insulated = { reasonCodes: [], requirements: [{ kind: 'thermal', minimum: 'moderate',
    priority: 'mandatory', reasonCodes: ['temperature_low'] }] };
  assert.equal(coverageDrift(insulated, at16(twoHours), '2026-09-25T16:00:00.000Z', end), null);
});

test('a later short cool spell is a finishing touch, never mandatory cold', () => {
  const coverage = { start: '2026-09-25T11:00:00.000Z', end: '2026-09-25T20:00:00.000Z' };
  const warm = { temperatureCelsius: 22, apparentTemperatureCelsius: 22 };
  const day = (tail) => ['11:00', '12:00', '13:00', '14:00'].map((clock) => hour(clock, warm))
    .concat(['15:00', '16:00', '17:00', '18:00', '19:00'].map((clock) => hour(clock, tail[clock] ?? warm)));
  const nowIso = '2026-09-25T11:05:00.000Z';
  // One hour at 11 and a cool 16 after it: short, so it is a touch at the first cool hour.
  const short = day({ '17:00': { temperatureCelsius: 15, apparentTemperatureCelsius: 11 },
    '18:00': { temperatureCelsius: 16, apparentTemperatureCelsius: 16 } });
  assert.deepEqual(laterCoolSpell(noRequirements, short, nowIso, coverage), { at: '2026-09-25T17:00:00.000Z' });
  // Two consecutive hours under 12, or one under 5, is mandatory protection instead.
  const twoHours = day({ '17:00': { temperatureCelsius: 11, apparentTemperatureCelsius: 11 },
    '18:00': { temperatureCelsius: 11, apparentTemperatureCelsius: 10 } });
  assert.equal(laterCoolSpell(noRequirements, twoHours, nowIso, coverage), null);
  const freezing = day({ '18:00': { temperatureCelsius: 6, apparentTemperatureCelsius: 4 } });
  assert.equal(laterCoolSpell(noRequirements, freezing, nowIso, coverage), null);
  // The first four hours decide the outfit: a cool hour inside them is not a later spell.
  assert.equal(laterCoolSpell(noRequirements, day({}).map((value) => value.forecastAt.includes('T13:')
    ? { ...value, temperatureCelsius: 15, apparentTemperatureCelsius: 15 } : value), nowIso, coverage), null);
  // Nothing cool at all, or a spell already behind the viewer, or after the window ends.
  assert.equal(laterCoolSpell(noRequirements, day({}), nowIso, coverage), null);
  assert.equal(laterCoolSpell(noRequirements, short, '2026-09-25T19:10:00.000Z', coverage), null);
  assert.equal(laterCoolSpell(noRequirements, short, nowIso,
    { start: coverage.start, end: '2026-09-25T17:00:00.000Z' }), null);
  // An outfit already chosen with mandatory insulation needs no extra layer.
  const insulated = { reasonCodes: [], requirements: [{ kind: 'thermal', minimum: 'light',
    priority: 'mandatory', reasonCodes: ['temperature_low'] }] };
  assert.equal(laterCoolSpell(insulated, short, nowIso, coverage), null);
});

test('the coverage window keeps its own bands, apart from the dressing day', () => {
  const at = (clock) => `2026-09-25T${clock}:00.000Z`;
  // The small-hours band ends at 04:00 on the date the clock shows.
  assert.equal(outfitCoverage(at('03:59'), 'UTC')?.end, '2026-09-25T04:00:00.000Z');
  assert.equal(outfitCoverage(at('04:00'), 'UTC')?.end, '2026-09-25T19:00:00.000Z');
  // The night band starts at 18:00 and runs to 01:00 of the next date.
  assert.equal(outfitCoverage(at('17:59'), 'UTC')?.end, '2026-09-25T22:00:00.000Z');
  assert.equal(outfitCoverage(at('18:00'), 'UTC')?.end, '2026-09-26T01:00:00.000Z');
  // Not a copy of the dressing day: at 00:30 that runs to 04:00, coverage only to 01:00,
  // and at 18:00 that runs to 04:00 the next morning, coverage to 01:00.
  assert.equal(wardrobeDayWindow(at('00:30'), 'UTC')?.end, '2026-09-25T04:00:00.000Z');
  assert.equal(outfitCoverage(at('00:30'), 'UTC')?.end, '2026-09-25T01:00:00.000Z');
  assert.equal(wardrobeDayWindow(at('18:00'), 'UTC')?.end, '2026-09-26T04:00:00.000Z');
});
