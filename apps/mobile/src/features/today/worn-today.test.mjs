import assert from 'node:assert/strict';
import test from 'node:test';

import { coldTodayScreenState, todayScreenState } from './__tests__/fixtures.ts';
import { latestWornLook, wornLookOutfitId } from './application/worn-today.ts';
import { createTodayPresentation } from './presentation/today-presentation.ts';
import { wornOutfitFrom } from '../recommendation/domain/outfit-history.ts';
import { wardrobeDayWindow } from '../weather/domain/wardrobe-day.ts';

const recommendation = todayScreenState.snapshot.recommendation;
if (recommendation.status !== 'recommended') throw new Error('fixture');
const [first, second, third] = recommendation.outfits;
const now = Date.parse('2026-08-13T06:30:00.000Z');

function record(outfit, wornAt, overrides = {}) {
  return {
    id: `look-${wornAt}`,
    localProfileId: 'profile-1',
    dayKey: '2026-08-13',
    outfit,
    pieceColors: null,
    photoPath: null,
    wornAt,
    createdAt: wornAt,
    updatedAt: wornAt,
    deletedAt: null,
    ...overrides,
  };
}

const dressingDay = (iso) => wardrobeDayWindow(iso, 'UTC')?.key;

test('the latest look of the dressing day leads, whatever order the day reads in', () => {
  const morning = record(wornOutfitFrom(first), '2026-08-13T07:00:00.000Z');
  const noon = record(wornOutfitFrom(second), '2026-08-13T12:00:00.000Z');
  const evening = record(wornOutfitFrom(third), '2026-08-13T19:00:00.000Z');
  assert.equal(latestWornLook([morning, evening, noon], '2026-08-13'), evening);
  assert.equal(latestWornLook([morning, noon], dressingDay('2026-08-13T19:30:00.000Z')), noon);
  assert.equal(latestWornLook([], '2026-08-13'), null);
});

test('a look of another day or a deleted look never leads', () => {
  const yesterday = record(wornOutfitFrom(first), '2026-08-12T19:00:00.000Z', { dayKey: '2026-08-12' });
  const deleted = record(wornOutfitFrom(second), '2026-08-13T19:00:00.000Z', {
    deletedAt: '2026-08-13T20:00:00.000Z',
  });
  const kept = record(wornOutfitFrom(third), '2026-08-13T08:00:00.000Z');
  assert.equal(latestWornLook([yesterday], '2026-08-13'), null);
  assert.equal(latestWornLook([yesterday, deleted, kept], '2026-08-13'), kept);
});

test('the evening look stays through the small hours and leaves when the dressing day turns at 04:00', () => {
  const evening = record(wornOutfitFrom(first), '2026-08-13T21:00:00.000Z');
  const beforeTurn = dressingDay('2026-08-14T03:59:00.000Z');
  const afterTurn = dressingDay('2026-08-14T04:00:00.000Z');
  assert.equal(latestWornLook([evening], beforeTurn), evening);
  assert.equal(latestWornLook([evening], afterTurn), null);
});

test('a worn look opens the outfit of the day it dresses, and a changed look opens none', () => {
  assert.equal(wornLookOutfitId(wornOutfitFrom(second), recommendation.outfits), second.optionId);
  assert.equal(wornLookOutfitId(wornOutfitFrom(second, 'manual'), recommendation.outfits), second.optionId);
  const coldRecommendation = coldTodayScreenState.snapshot.recommendation;
  if (coldRecommendation.status !== 'recommended') throw new Error('fixture');
  assert.equal(wornLookOutfitId(wornOutfitFrom(coldRecommendation.outfits[0]), recommendation.outfits), null);
});

test('the worn look leads Today in its recorded colours, kuyara\'s three unchanged behind it', () => {
  const worn = record(wornOutfitFrom(second), '2026-08-13T07:00:00.000Z', {
    pieceColors: Object.fromEntries(Object.keys(wornOutfitFrom(second).garments).map((slot) => [slot, 'navy'])),
  });
  const presentation = createTodayPresentation(todayScreenState, 'en', false, 'celsius', now, null, worn);
  assert.equal(presentation.kind, 'loaded');
  const hero = presentation.wornHero;
  assert.ok(hero);
  assert.equal(hero.detailId, second.optionId);
  assert.equal(hero.title, presentation.suggestions[1].title);
  assert.deepEqual(hero.boardPieces, presentation.suggestions[1].boardPieces);
  assert.ok(hero.palette.pieces.every(({ recordedSwatchId }) => recordedSwatchId === 'navy'));
  assert.deepEqual(hero.accessories.map(({ garmentTypeId }) => garmentTypeId),
    presentation.suggestions[1].accessories.map(({ garmentTypeId }) => garmentTypeId));
  assert.match(hero.stageAccessibilityLabel, new RegExp(presentation.suggestions[1].title));
  assert.deepEqual(presentation.suggestions.map(({ id }) => id), recommendation.outfits.map(({ optionId }) => optionId));
  assert.equal(createTodayPresentation(todayScreenState, 'en', false, 'celsius', now).wornHero, null);
});

test('a look the reader changed leads as their outfit and opens no detail', () => {
  const coldRecommendation = coldTodayScreenState.snapshot.recommendation;
  if (coldRecommendation.status !== 'recommended') throw new Error('fixture');
  const worn = record(wornOutfitFrom(coldRecommendation.outfits[0], 'manual'), '2026-08-13T07:00:00.000Z');
  const english = createTodayPresentation(todayScreenState, 'en', false, 'celsius', now, null, worn);
  const turkish = createTodayPresentation(todayScreenState, 'tr', false, 'celsius', now, null, worn);
  assert.equal(english.wornHero?.detailId, null);
  assert.equal(english.wornHero?.title, 'Your outfit');
  assert.equal(turkish.wornHero?.title, 'Senin kombinin');
  assert.equal(english.wornHero?.id, `worn-${worn.id}`);
});
