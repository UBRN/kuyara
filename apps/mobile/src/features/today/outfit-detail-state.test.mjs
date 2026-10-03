import assert from 'node:assert/strict';
import test from 'node:test';

import { todayActiveLocation, todayScreenState, todayWeatherSnapshot } from './__tests__/fixtures.ts';
import {
  closetSeedOffer,
  detailOutfit,
  outfitWornState,
  previewIsThisMorning,
  tomorrowDetailIsThisMorning,
  tomorrowDetailState,
  wornOutfitOrNull,
} from './application/outfit-detail-state.ts';

const recommendation = todayScreenState.snapshot.recommendation;
const outfits = recommendation.status === 'recommended' ? recommendation.outfits : [];
const forecastRow = Object.freeze({
  dateKey: '2026-08-14', condition: 'rain', minimumTemperatureCelsius: 15,
  maximumTemperatureCelsius: 23, precipitationProbability: 0.6, precipitationMillimetres: 4,
});
const weather = Object.freeze({
  status: 'ready',
  activeLocation: todayActiveLocation,
  snapshot: { ...todayWeatherSnapshot, daily: [forecastRow] },
  freshness: 'fresh',
  permission: { kind: 'undetermined' },
  locationFlow: 'idle',
  isSelectingLocation: false,
  isRefreshing: false,
  refreshFailure: null,
});
const preview = Object.freeze({
  locationKey: todayActiveLocation.locationKey,
  localDayKey: '2026-08-14',
  coverageStart: '2026-08-14T05:00:00.000Z',
  coverageEnd: '2026-08-14T17:00:00.000Z',
  recommendation,
});

test('tomorrow detail draws the preview with the forecast row it was chosen for', () => {
  const state = tomorrowDetailState(weather, preview, '2026-08-13T06:10:00.000Z');
  assert.equal(state.kind, 'loaded');
  assert.equal(state.forecastDay, forecastRow);
  assert.equal(state.snapshot.freshness, 'fresh');
  assert.equal(state.snapshot.coverageStart, preview.coverageStart);
  assert.equal(tomorrowDetailState(weather, preview, '2026-08-13T08:10:00.000Z').snapshot.freshness, 'stale');
});

test('tomorrow detail is unavailable without the preview, the place, its forecast row or a match', () => {
  const now = '2026-08-13T06:10:00.000Z';
  assert.equal(tomorrowDetailState(weather, null, now).kind, 'unavailable');
  assert.equal(tomorrowDetailState({ status: 'loading' }, preview, now).kind, 'unavailable');
  assert.equal(tomorrowDetailState({ ...weather, activeLocation: null }, preview, now).kind, 'unavailable');
  assert.equal(tomorrowDetailState({ ...weather, snapshot: { ...weather.snapshot, daily: [] } }, preview, now).kind,
    'unavailable');
  assert.equal(tomorrowDetailState(weather, { ...preview, locationKey: 'manual:elsewhere' }, now).kind, 'unavailable');
});

test('tomorrow detail is titled this morning only between midnight and 04:00 of its own day', () => {
  const state = tomorrowDetailState(weather, preview, '2026-08-13T06:10:00.000Z');
  assert.equal(tomorrowDetailIsThisMorning(state, Date.parse('2026-08-13T22:30:00.000Z')), true);
  assert.equal(tomorrowDetailIsThisMorning(state, Date.parse('2026-08-14T02:00:00.000Z')), false);
  assert.equal(tomorrowDetailIsThisMorning(state, Date.parse('2026-08-13T18:00:00.000Z')), false);
  assert.equal(tomorrowDetailIsThisMorning({ kind: 'unavailable' }, Date.parse('2026-08-13T22:30:00.000Z')), false);
});

test('a detail route finds its outfit by option id, with its place among the three', () => {
  assert.deepEqual(detailOutfit(recommendation, outfits[1].optionId), { outfit: outfits[1], position: 2 });
  assert.deepEqual(detailOutfit(recommendation, 'gone'), { outfit: null, position: null });
  assert.deepEqual(detailOutfit(null, outfits[0].optionId), { outfit: null, position: null });
});

test('the worn state compares the open outfit with every look of the day', () => {
  const thisWorn = wornOutfitOrNull(outfits[0]);
  const otherWorn = wornOutfitOrNull(outfits[1]);
  assert.ok(thisWorn && otherWorn);
  assert.equal(outfitWornState(false, { looks: [thisWorn] }, thisWorn), 'this');
  assert.equal(outfitWornState(false, { looks: [otherWorn, thisWorn] }, thisWorn), 'this');
  assert.equal(outfitWornState(false, { looks: [otherWorn] }, thisWorn), 'other');
  assert.equal(outfitWornState(false, { looks: [] }, thisWorn), 'none');
  assert.equal(outfitWornState(false, null, thisWorn), 'unknown');
  assert.equal(outfitWornState(false, { looks: [thisWorn] }, null), 'unknown');
  assert.equal(outfitWornState(true, { looks: [thisWorn] }, thisWorn), 'unknown');
});

test('a worn record that does not parse is none', () => {
  assert.equal(wornOutfitOrNull({ ...outfits[0], archetypeId: 'not-an-archetype' }), null);
});

test('the Closet seed offer stands while the Closet is empty and once after it filled', () => {
  const onSeed = () => undefined;
  assert.deepEqual(closetSeedOffer(null, true, onSeed), { status: 'offer', addedCount: 0, onSeed });
  assert.deepEqual(closetSeedOffer({ status: 'busy' }, true, onSeed), { status: 'busy', addedCount: 0, onSeed });
  assert.deepEqual(closetSeedOffer({ status: 'failed' }, true, onSeed), { status: 'failed', addedCount: 0, onSeed });
  assert.deepEqual(closetSeedOffer({ status: 'added', count: 4 }, false, onSeed), { status: 'added', addedCount: 4, onSeed });
  assert.equal(closetSeedOffer(null, false, onSeed), null);
});

test('the coming morning is "this morning" up to 03:59 and not from 04:00', () => {
  const morning = (iso) => previewIsThisMorning(Date.parse(iso), 'UTC', '2026-08-14');
  assert.equal(morning('2026-08-14T03:59:00.000Z'), true);
  assert.equal(morning('2026-08-14T04:00:00.000Z'), false);
  assert.equal(morning('2026-08-13T17:59:00.000Z'), false);
  assert.equal(morning('2026-08-13T18:00:00.000Z'), false);
});
