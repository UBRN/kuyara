import assert from 'node:assert/strict';
import test from 'node:test';

import { createApprovedTriggerCoalescer } from './approved-trigger-coalescer.ts';
import { signalsOfInput, signalsOfSnapshot } from './recommendation-signals.ts';
import { garmentCatalogVersion } from '../../catalog/domain/garment-catalog.ts';
import { defaultDressStyle } from '../../profile/domain/profile.ts';

const settle = () => new Promise((resolve) => setImmediate(resolve));

function inputFor(styleAesthetics, now = '2026-08-01T20:00:00.000Z') {
  return {
    snapshot: { id: 'weather-one', locationKey: 'manual:sample.istanbul' },
    clothingPreference: 'womens',
    dressStyle: 'smart',
    styleAesthetics,
    localDayKey: '2026-08-01',
    now,
  };
}

// An evaluation that settles when the test says so and records what ran.
function gatedEvaluator() {
  const ran = [];
  const gates = [];
  const evaluate = (input) => {
    ran.push(input.styleAesthetics.join('+'));
    return new Promise((resolve) => gates.push(() => resolve(true)));
  };
  const release = async () => {
    await settle();
    gates.shift()();
    await settle();
  };
  return { evaluate, ran, release };
}

test('an input that changes no approved signal joins the evaluation in flight', async () => {
  const submit = createApprovedTriggerCoalescer();
  const { evaluate, ran, release } = gatedEvaluator();
  const first = submit(inputFor(['classic']), evaluate);
  const joined = submit(inputFor(['classic'], '2026-08-01T21:00:00.000Z'), evaluate);
  assert.equal(joined, first);
  await release();
  assert.deepEqual(ran, ['classic']);
});

test('while one evaluation runs, only the latest changed input runs after it', async () => {
  const submit = createApprovedTriggerCoalescer();
  const { evaluate, ran, release } = gatedEvaluator();
  submit(inputFor(['classic']), evaluate);
  submit(inputFor(['classic', 'sporty']), evaluate);
  submit(inputFor(['classic', 'romantic']), evaluate);
  await release();
  await release();
  assert.deepEqual(ran, ['classic', 'classic+romantic']);
});

test('settings that change back to the evaluation in flight leave nothing to run after it', async () => {
  const submit = createApprovedTriggerCoalescer();
  const { evaluate, ran, release } = gatedEvaluator();
  submit(inputFor(['classic']), evaluate);
  const queued = submit(inputFor(['classic', 'sporty']), evaluate);
  submit(inputFor(['classic']), evaluate);
  await release();
  assert.deepEqual(ran, ['classic']);
  assert.equal(await queued, true);
});

test('a change made after settings changed back is still evaluated once', async () => {
  const submit = createApprovedTriggerCoalescer();
  const { evaluate, ran, release } = gatedEvaluator();
  submit(inputFor(['classic']), evaluate);
  submit(inputFor(['classic', 'sporty']), evaluate);
  submit(inputFor(['classic']), evaluate);
  submit(inputFor(['classic', 'romantic']), evaluate);
  await release();
  await release();
  assert.deepEqual(ran, ['classic', 'classic+romantic']);
});

test('a failed evaluation still lets the queued input run', async () => {
  const submit = createApprovedTriggerCoalescer();
  const ran = [];
  let failFirst;
  const first = submit(inputFor(['classic']), () => new Promise((_, reject) => { failFirst = reject; }));
  const queued = submit(inputFor(['sporty']), async (input) => {
    ran.push(input.styleAesthetics.join('+'));
    return true;
  });
  failFirst(new Error('boom'));
  await assert.rejects(first);
  assert.equal(await queued, true);
  assert.deepEqual(ran, ['sporty']);
});

test('the signals of an input and of the snapshot it produced agree', () => {
  const input = inputFor(['classic']);
  const snapshot = {
    weatherSnapshotId: 'weather-one',
    locationKey: 'manual:sample.istanbul',
    clothingPreference: 'womens',
    dressStyle: 'smart',
    styleAesthetics: ['classic'],
    catalogVersion: garmentCatalogVersion,
    localDayKey: '2026-08-01',
  };
  assert.deepEqual(signalsOfSnapshot(snapshot), signalsOfInput(input));
});

test('an input without a dress style reads the default one', () => {
  const { dressStyle, ...withoutStyle } = inputFor(['classic']);
  assert.equal(signalsOfInput(withoutStyle).dressStyle, defaultDressStyle);
});
