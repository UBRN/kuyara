import assert from 'node:assert/strict';
import test from 'node:test';

import { wardrobeDayWindow } from '../../weather/domain/wardrobe-day.ts';
import { localDayKey } from './local-day.ts';
import { dressedFor, summaryWeek, weekSummary } from './outfit-history-week.ts';

// 2026-10-04 is a Sunday; its week runs Monday 28 September to Sunday 4 October.
const week = ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'];
const sundayEvening = '2026-10-04:evening';

const outfit = (garments, formality = 'casual') =>
  ({ garments, archetypeId: 'everyday_easy', formality, source: 'recommended' });
const day = (dayKey, garments, pieceColors = null) => ({ dayKey, outfit: outfit(garments), pieceColors });
const tee = { primary_top: 't_shirt', bottom: 'jeans', footwear: 'sneakers' };
const rainy = { primary_top: 't_shirt', bottom: 'jeans', outer_layer: 'rain_jacket', footwear: 'sneakers' };
const cold = { primary_top: 'sweater', bottom: 'trousers', outer_layer: 'coat', footwear: 'ankle_boots' };
const sweaterDay = { primary_top: 'sweater', bottom: 'trousers', footwear: 'closed_shoes' };

// The device clock is read at the edge and turned into a dressing-day key by the existing
// helpers; the summary reads only that key. The suite runs under TZ=UTC.
test('the summary opens at 18:00 on Sunday, not at 17:59', () => {
  assert.equal(summaryWeek(localDayKey(new Date(2026, 9, 4, 17, 59))), null);
  assert.deepEqual(summaryWeek(localDayKey(new Date(2026, 9, 4, 18, 0))), week);
});

test('the summary stays through the night and closes when the dressing day turns at 04:00 Monday', () => {
  assert.deepEqual(summaryWeek(localDayKey(new Date(2026, 9, 4, 23, 59))), week);
  assert.deepEqual(summaryWeek(localDayKey(new Date(2026, 9, 5, 0, 30))), week);
  assert.deepEqual(summaryWeek(localDayKey(new Date(2026, 9, 5, 3, 59))), week);
  assert.equal(summaryWeek(localDayKey(new Date(2026, 9, 5, 4, 0))), null);
});

test('no other evening opens it: Saturday evening, Monday evening, a Sunday daytime key', () => {
  assert.equal(summaryWeek('2026-10-03:evening'), null);
  assert.equal(summaryWeek('2026-10-05:evening'), null);
  assert.equal(summaryWeek('2026-10-04'), null);
});

test('the window follows the wall clock of the zone the key was read in', () => {
  // 15:00 UTC is 18:00 in Istanbul and 11:00 in New York.
  assert.deepEqual(summaryWeek(wardrobeDayWindow('2026-10-04T15:00:00.000Z', 'Europe/Istanbul').key), week);
  assert.equal(summaryWeek(wardrobeDayWindow('2026-10-04T14:59:00.000Z', 'Europe/Istanbul').key), null);
  assert.equal(summaryWeek(wardrobeDayWindow('2026-10-04T15:00:00.000Z', 'America/New_York').key), null);
  // 03:30 UTC on Monday is still Sunday 23:30 in New York and already Monday 06:30 in Istanbul.
  assert.deepEqual(summaryWeek(wardrobeDayWindow('2026-10-05T03:30:00.000Z', 'America/New_York').key), week);
  assert.equal(summaryWeek(wardrobeDayWindow('2026-10-05T03:30:00.000Z', 'Europe/Istanbul').key), null);
});

test('the week crosses a month and a year boundary', () => {
  assert.deepEqual(summaryWeek('2027-01-03:evening'),
    ['2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03']);
});

test('an empty week shows nothing, and days outside the seven are not counted', () => {
  assert.equal(weekSummary([], sundayEvening), null);
  assert.equal(weekSummary([day('2026-09-27', tee), day('2026-10-05', tee)], sundayEvening), null);
  assert.equal(weekSummary([day('2026-10-01', tee)], '2026-10-04'), null);
});

test('one recorded day is shown plainly, with no piece that came back', () => {
  assert.deepEqual(weekSummary([day('2026-10-01', tee)], sundayEvening), {
    days: 1,
    dressedFor: [{ kind: 'light', days: 1 }],
    mostWorn: null,
  });
});

test('what a day was dressed for is read from its pieces', () => {
  assert.deepEqual(dressedFor(outfit(tee)), ['light']);
  assert.deepEqual(dressedFor(outfit(rainy)), ['rain']);
  assert.deepEqual(dressedFor(outfit(cold)), ['cold']);
  assert.deepEqual(dressedFor(outfit(sweaterDay)), []);
  assert.deepEqual(dressedFor(outfit({ ...cold, outer_layer: 'parka' })), ['rain', 'cold']);
  assert.deepEqual(dressedFor(outfit({ ...tee, handheld: 'umbrella' })), ['rain']);
});

test('the week counts its days by kind and names the piece that came back most', () => {
  const summary = weekSummary([
    day('2026-10-04', rainy, { primary_top: 'white', bottom: 'indigo', outer_layer: 'rainyellow', footwear: 'white' }),
    day('2026-10-02', cold),
    day('2026-09-30', tee, { primary_top: 'navy', bottom: 'indigo', footwear: 'white' }),
    day('2026-09-28', { ...tee, primary_top: 'shirt' }, { primary_top: 'skyblue', bottom: 'midwash', footwear: 'white' }),
  ], sundayEvening);
  assert.equal(summary.days, 4);
  assert.deepEqual(summary.dressedFor, [{ kind: 'rain', days: 1 }, { kind: 'cold', days: 1 }, { kind: 'light', days: 2 }]);
  // Jeans and sneakers both came back three times on the same latest day; jeans come first
  // in the catalog. Indigo is their most frequent colour.
  assert.deepEqual(summary.mostWorn, { garmentTypeId: 'jeans', slot: 'bottom', days: 3, swatchId: 'indigo' });
});

test('a tie in days goes to the piece worn most recently', () => {
  const summary = weekSummary([
    day('2026-09-28', { primary_top: 'shirt', bottom: 'trousers', footwear: 'loafers' }),
    day('2026-09-29', { primary_top: 'shirt', bottom: 'trousers', footwear: 'loafers' }),
    day('2026-10-01', { primary_top: 't_shirt', bottom: 'jeans', footwear: 'sneakers' }),
    day('2026-10-03', { primary_top: 't_shirt', bottom: 'jeans', footwear: 'sneakers' }),
  ], sundayEvening);
  // Shirt, trousers, loafers, T-shirt, jeans and sneakers each have two days; the T-shirt's
  // set was worn last and the T-shirt comes first in the catalog.
  assert.deepEqual(summary.mostWorn, { garmentTypeId: 't_shirt', slot: 'primary_top', days: 2, swatchId: null });
});

test('a colour tie goes to the most recent colour, and a day without colours adds none', () => {
  const summary = weekSummary([
    day('2026-09-29', tee, { primary_top: 'navy', bottom: 'indigo', footwear: 'white' }),
    day('2026-09-30', tee),
    day('2026-10-01', tee, { primary_top: 'olive', bottom: 'midwash', footwear: 'black' }),
  ], sundayEvening);
  assert.deepEqual(summary.mostWorn, { garmentTypeId: 't_shirt', slot: 'primary_top', days: 3, swatchId: 'olive' });
});

test('a day with several looks counts once: in the days, per kind, and per piece and colour', () => {
  const summary = weekSummary([
    day('2026-10-03', rainy, { primary_top: 'white', bottom: 'indigo', outer_layer: 'rainyellow', footwear: 'white' }),
    day('2026-10-03', tee, { primary_top: 'navy', bottom: 'indigo', footwear: 'white' }),
    day('2026-10-03', cold),
    day('2026-10-01', tee, { primary_top: 'navy', bottom: 'midwash', footwear: 'black' }),
  ], sundayEvening);
  assert.equal(summary.days, 2);
  // Saturday counts once toward rain, cold and light; Thursday once toward light.
  assert.deepEqual(summary.dressedFor, [{ kind: 'rain', days: 1 }, { kind: 'cold', days: 1 }, { kind: 'light', days: 2 }]);
  // The T-shirt, jeans and sneakers were worn on two days, not four looks; the T-shirt comes
  // first in the catalog, and navy is its colour on both days.
  assert.deepEqual(summary.mostWorn, { garmentTypeId: 't_shirt', slot: 'primary_top', days: 2, swatchId: 'navy' });
});

test('one day with two looks is still a single day, with no piece that came back', () => {
  const summary = weekSummary([day('2026-10-02', tee), day('2026-10-02', rainy)], sundayEvening);
  assert.equal(summary.days, 1);
  assert.equal(summary.mostWorn, null);
});
