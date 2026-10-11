import assert from 'node:assert/strict';
import test from 'node:test';

import { createDressingDayRollover, dayInForce } from './dressing-day-rollover.ts';
import { localDayKey, untilDressingDayTurns } from '../domain/local-day.ts';

function recordingRollover(initialAppState = 'active') {
  let clock = { key: '2026-09-24' };
  const adopted = [];
  let retries = 0;
  const rollover = createDressingDayRollover({
    initialAppState,
    readDay: () => clock,
    adoptDay: (day) => adopted.push(day.key),
    retryChoiceRead: () => { retries += 1; },
    untilNextDay: () => 60_000,
    turnedInFront: () => {},
  });
  return {
    rollover,
    adopted,
    retries: () => retries,
    setClock: (key) => { clock = { key }; },
  };
}

test('the rendered day stays while its key is unchanged, and the read day replaces it once moved', () => {
  const rendered = { key: '2026-09-24', variant: 1 };
  assert.equal(dayInForce(rendered, { key: '2026-09-24', variant: 1 }), rendered);
  const evening = { key: '2026-09-24:evening', variant: 1 };
  assert.equal(dayInForce(rendered, evening), evening);
});

test('a reevaluation reads the clock and hands the day over', () => {
  const { rollover, adopted, setClock } = recordingRollover();
  rollover.reevaluate();
  setClock('2026-09-24:evening');
  rollover.reevaluate();
  assert.deepEqual(adopted, ['2026-09-24', '2026-09-24:evening']);
});

test('only a return to the foreground reevaluates', () => {
  const { rollover, adopted } = recordingRollover('active');
  rollover.appStateChanged('active');
  rollover.appStateChanged('inactive');
  rollover.appStateChanged('background');
  assert.deepEqual(adopted, []);
  rollover.appStateChanged('active');
  assert.deepEqual(adopted, ['2026-09-24']);
  rollover.appStateChanged('active');
  assert.deepEqual(adopted, ['2026-09-24']);
});

test('an app that starts outside the foreground reevaluates on its first activation', () => {
  const { rollover, adopted } = recordingRollover('background');
  rollover.appStateChanged('active');
  assert.deepEqual(adopted, ['2026-09-24']);
});

test('a failed day-choice read is read again at the next reevaluation, until one succeeds', () => {
  const { rollover, retries } = recordingRollover();
  rollover.reevaluate();
  assert.equal(retries(), 0);
  rollover.choiceReadFailed(true);
  rollover.reevaluate();
  rollover.reevaluate();
  assert.equal(retries(), 2);
  rollover.choiceReadFailed(false);
  rollover.reevaluate();
  assert.equal(retries(), 2);
});

// The provider's own wiring on a mocked clock: the day is read from `Date`, and the timer runs
// on the mocked `setTimeout`.
function clockedRollover(t, now, initialAppState = 'active') {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now });
  const adopted = [];
  const turned = [];
  const rollover = createDressingDayRollover({
    initialAppState,
    readDay: () => ({ key: localDayKey(new Date()) }),
    adoptDay: (day) => adopted.push(day.key),
    retryChoiceRead: () => {},
    untilNextDay: () => untilDressingDayTurns(new Date()),
    turnedInFront: (key) => turned.push(key),
  });
  const stop = rollover.watch();
  t.after(stop);
  return { rollover, adopted, turned, stop };
}

test('an app left in front across 18:00 turns to the evening at 18:00, marked as turned in front', (t) => {
  const { adopted, turned } = clockedRollover(t, new Date(2026, 9, 10, 17, 59, 30));
  t.mock.timers.tick(29_999);
  assert.deepEqual(adopted, []);
  t.mock.timers.tick(1);
  assert.deepEqual(adopted, ['2026-10-10:evening']);
  assert.deepEqual(turned, ['2026-10-10:evening']);
});

test('an app left in front across 04:00 turns to the new date, then to the evening at 18:00', (t) => {
  const { adopted } = clockedRollover(t, new Date(2026, 9, 11, 3, 59, 30));
  t.mock.timers.tick(30_000);
  assert.deepEqual(adopted, ['2026-10-11']);
  t.mock.timers.tick(14 * 60 * 60 * 1000);
  assert.deepEqual(adopted, ['2026-10-11', '2026-10-11:evening']);
});

test('no timer runs outside the foreground, and the return clears the mark and reads the day', (t) => {
  const { rollover, adopted, turned } = clockedRollover(t, new Date(2026, 9, 10, 17, 59, 30));
  rollover.appStateChanged('background');
  t.mock.timers.tick(60_000);
  assert.deepEqual(adopted, []);
  rollover.appStateChanged('active');
  assert.deepEqual(adopted, ['2026-10-10:evening']);
  assert.deepEqual(turned, [null]);
  t.mock.timers.tick(10 * 60 * 60 * 1000);
  assert.deepEqual(adopted, ['2026-10-10:evening', '2026-10-11']);
});

test('an app that starts in the background sets no timer until it is active', (t) => {
  const { adopted } = clockedRollover(t, new Date(2026, 9, 10, 17, 59, 30), 'background');
  t.mock.timers.tick(60_000);
  assert.deepEqual(adopted, []);
});

test('stopping the watch clears the timer', (t) => {
  const { adopted, stop } = clockedRollover(t, new Date(2026, 9, 10, 17, 59, 30));
  stop();
  t.mock.timers.tick(60_000);
  assert.deepEqual(adopted, []);
});

test('a turn a screen has already read is not marked as turned in front', (t) => {
  const { rollover, adopted, turned } = clockedRollover(t, new Date(2026, 9, 10, 17, 59, 59, 999));
  t.mock.timers.setTime(new Date(2026, 9, 10, 18, 0, 0, 500).getTime());
  rollover.reevaluate();
  t.mock.timers.tick(1);
  assert.deepEqual(adopted, ['2026-10-10:evening', '2026-10-10:evening']);
  assert.deepEqual(turned, []);
});
