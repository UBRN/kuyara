import assert from 'node:assert/strict';
import test from 'node:test';

import { nextBareDressingDayKey } from './dressing-day-choice.ts';
import { coverageDrift, forecastBoundedCoverage, laterCoolSpell, outfitCoverage } from './outfit-coverage.ts';

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
});

test('plan target is the bare next date, including overnight', () => {
  assert.equal(nextBareDressingDayKey('2026-09-24:evening'), '2026-09-25');
  assert.equal(new Intl.DateTimeFormat('en', { timeZone: 'UTC', weekday: 'long' })
    .format(new Date(`${nextBareDressingDayKey('2026-09-24:evening')}T12:00:00.000Z`)), 'Friday');
});

const hour = (clock, values = {}) => ({
  forecastAt: `2026-09-25T${clock}:00.000Z`, temperatureCelsius: 16, apparentTemperatureCelsius: 16,
  condition: 'cloudy', precipitationProbability: 0.1, windSpeedMetersPerSecond: 2, humidity: 0.5,
  uvIndex: 1, ...values,
});
const noRequirements = { requirements: [], reasonCodes: [] };

test('a short forecast ends the promised window at its last hour, never past it', () => {
  const coverage = { start: '2026-09-25T13:00:00.000Z', end: '2026-09-25T20:00:00.000Z' };
  const full = ['13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00'].map((clock) => hour(clock));
  assert.deepEqual(forecastBoundedCoverage(coverage, full), coverage);
  assert.deepEqual(forecastBoundedCoverage(coverage, full.slice(0, 6)),
    { start: coverage.start, end: '2026-09-25T18:00:00.000Z' });
  assert.equal(forecastBoundedCoverage(coverage, []), null);
});

test('drift names rain the outfit was not chosen for, and stays quiet when it was', () => {
  const hours = [hour('13:00'), hour('17:00', { condition: 'rain' }), hour('18:00', { condition: 'rain' })];
  assert.deepEqual(coverageDrift(noRequirements, hours, '2026-09-25T13:10:00.000Z', '2026-09-25T19:00:00.000Z'),
    { kind: 'rain', at: '2026-09-25T17:00:00.000Z' });
  const rainReady = { reasonCodes: [], requirements: [{ kind: 'water_protection', target: 'body',
    minimum: 'waterproof', priority: 'mandatory', reasonCodes: ['condition_rain'] }] };
  assert.equal(coverageDrift(rainReady, hours, '2026-09-25T13:10:00.000Z', '2026-09-25T19:00:00.000Z'), null);
  // Rain after the window ends is not this outfit's business.
  assert.equal(coverageDrift(noRequirements, hours, '2026-09-25T13:10:00.000Z', '2026-09-25T17:00:00.000Z'), null);
  assert.equal(coverageDrift(noRequirements, [hour('15:00', { condition: 'snow' })],
    '2026-09-25T13:10:00.000Z', '2026-09-25T19:00:00.000Z')?.kind, 'snow');
});

test('drift follows the mandatory cold rule: two hours under 12 or one under 5', () => {
  const end = '2026-09-25T22:00:00.000Z';
  const single = [hour('18:00', { temperatureCelsius: 11, apparentTemperatureCelsius: 11 }), hour('19:00')];
  assert.equal(coverageDrift(noRequirements, single, '2026-09-25T16:00:00.000Z', end), null);
  const twoHours = [hour('18:00', { apparentTemperatureCelsius: 11 }), hour('19:00', { apparentTemperatureCelsius: 10 })];
  assert.deepEqual(coverageDrift(noRequirements, twoHours, '2026-09-25T16:00:00.000Z', end),
    { kind: 'cold', at: '2026-09-25T18:00:00.000Z' });
  const freezing = [hour('20:00', { apparentTemperatureCelsius: 4 })];
  assert.equal(coverageDrift(noRequirements, freezing, '2026-09-25T16:00:00.000Z', end)?.at,
    '2026-09-25T20:00:00.000Z');
  const insulated = { reasonCodes: [], requirements: [{ kind: 'thermal', minimum: 'moderate',
    priority: 'mandatory', reasonCodes: ['temperature_low'] }] };
  assert.equal(coverageDrift(insulated, twoHours, '2026-09-25T16:00:00.000Z', end), null);
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
