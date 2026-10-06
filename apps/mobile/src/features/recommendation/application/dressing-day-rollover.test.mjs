import assert from 'node:assert/strict';
import test from 'node:test';

import { createDressingDayRollover, dayInForce } from './dressing-day-rollover.ts';

function recordingRollover(initialAppState = 'active') {
  let clock = { key: '2026-09-24' };
  const adopted = [];
  let retries = 0;
  const rollover = createDressingDayRollover({
    initialAppState,
    readDay: () => clock,
    adoptDay: (day) => adopted.push(day.key),
    retryChoiceRead: () => { retries += 1; },
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
