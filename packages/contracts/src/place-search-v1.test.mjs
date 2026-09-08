import assert from 'node:assert/strict';
import test from 'node:test';
import {
  manualLocationIdSchema, placeSearchV1RequestSchema,
  placeSearchV1SuccessSchema, placeSearchV1ErrorSchema,
} from './place-search-v1.ts';

const request = { query: 'İzmir', limit: 5, language: 'tr' };
const place = { id: 'place.311046', displayName: 'İzmir', region: 'İzmir, Türkiye', latitudeE2: 3841, longitudeE2: 2714, timeZone: 'Europe/Istanbul' };
const success = { data: { places: [place], attribution: ['open-meteo', 'geonames'] } };

test('place request trims the query and bounds length, results, language and fields', () => {
  assert.equal(placeSearchV1RequestSchema.parse({ ...request, query: ' İzmir ' }).query, 'İzmir');
  for (const patch of [{ query: ' a ' }, { query: 'a'.repeat(101) }, { limit: 0 }, { limit: 6 }, { limit: 1.5 }, { language: 'de' }, { profileId: 'private' }]) {
    assert.equal(placeSearchV1RequestSchema.safeParse({ ...request, ...patch }).success, false);
  }
});
test('place response accepts empty results and optional provider time zone as null', () => {
  assert.deepEqual(placeSearchV1SuccessSchema.parse(success), success);
  assert.equal(placeSearchV1SuccessSchema.safeParse({ data: { ...success.data, places: [] } }).success, true);
  assert.equal(placeSearchV1SuccessSchema.safeParse({ data: { ...success.data, places: [{ ...place, timeZone: null }] } }).success, true);
});
test('place response rejects invalid coordinates, ids, names, time zones and raw fields', () => {
  for (const patch of [{ id: 'place.0' }, { id: 'place.-1' }, { latitudeE2: 3841.2 }, { longitudeE2: 18001 }, { displayName: ' ' }, { region: '' }, { timeZone: 'Bad/Zone' }, { population: 10 }]) {
    assert.equal(placeSearchV1SuccessSchema.safeParse({ data: { ...success.data, places: [{ ...place, ...patch }] } }).success, false);
  }
  assert.equal(placeSearchV1SuccessSchema.safeParse({ data: { ...success.data, places: Array(6).fill(place) } }).success, false);
});
test('manual ids use a bounded shape and errors expose only a stable code', () => {
  for (const id of ['sample.istanbul', 'sample.ankara', 'sample.london', 'place.311046']) assert.equal(manualLocationIdSchema.safeParse(id).success, true);
  for (const id of ['', 'private free text', 'place.01', 'place.1.5', 'place.12345678901234567', 'sample.', 'place.1\n']) assert.equal(manualLocationIdSchema.safeParse(id).success, false);
  assert.deepEqual(placeSearchV1ErrorSchema.parse({ error: { code: 'places_unavailable' } }), { error: { code: 'places_unavailable' } });
  assert.equal(placeSearchV1ErrorSchema.safeParse({ error: { code: 'places_unavailable', message: 'private query' } }).success, false);
});
