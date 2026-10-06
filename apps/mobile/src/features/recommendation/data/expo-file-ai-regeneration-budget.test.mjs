import assert from 'node:assert/strict';
import test from 'node:test';
import { installFakeExpoFileSystem } from '../../../../test/fakes/expo-file-system.mjs';

// Mock the device file to verify durable, serialized reservations.
const fileSystem = installFakeExpoFileSystem();
const { files } = fileSystem;

const { ExpoFileAiRegenerationBudget } = await import(
  './expo-file-ai-regeneration-budget.ts'
);

const budgetPath = 'file:///documents/kuyara/recommendation/ai-regenerations.json';

test.beforeEach(() => {
  files.clear();
  fileSystem.readFailure = false;
  fileSystem.writeFailure = false;
});

test('six concurrent reservations across instances allow exactly five', async () => {
  const reservations = await Promise.all(Array.from({ length: 6 }, () =>
    new ExpoFileAiRegenerationBudget().reserve('2026-09-18')));
  assert.deepEqual(reservations, [true, true, true, true, true, false]);
  assert.equal(files.get(budgetPath), JSON.stringify({ dayKey: '2026-09-18', count: 5 }));
});

test('the dressing-day date shares one allowance and a new date resets it', async () => {
  const budget = new ExpoFileAiRegenerationBudget();
  assert.equal(await budget.reserve('2026-09-18'), true);
  assert.equal(await budget.reserve('2026-09-18'), true);
  assert.equal(await budget.reserve('2026-09-19'), true);
  assert.equal(files.get(budgetPath), JSON.stringify({ dayKey: '2026-09-19', count: 1 }));
});

test('corrupt content starts a fresh count that is rewritten, and still caps the day at five', async () => {
  for (const stored of ['not json', '', 'null', '[]', '{"dayKey":"2026-09-18"}',
    '{"dayKey":"2026-09-18","count":"2"}', '{"dayKey":"2026-09-18","count":-1}',
    '{"dayKey":"2026-09-18","count":1.5}']) {
    files.set(budgetPath, stored);
    assert.equal(await new ExpoFileAiRegenerationBudget().reserve('2026-09-18'), true, stored);
    assert.equal(files.get(budgetPath), JSON.stringify({ dayKey: '2026-09-18', count: 1 }), stored);
  }
  files.set(budgetPath, 'not json');
  const reservations = [];
  for (let attempt = 0; attempt < 6; attempt += 1) {
    reservations.push(await new ExpoFileAiRegenerationBudget().reserve('2026-09-18'));
  }
  assert.deepEqual(reservations, [true, true, true, true, true, false]);
  assert.equal(files.get(budgetPath), JSON.stringify({ dayKey: '2026-09-18', count: 5 }));
});

test('unreadable and unwritable stores deny a reservation', async () => {
  const budget = new ExpoFileAiRegenerationBudget();
  files.set(budgetPath, JSON.stringify({ dayKey: '2026-09-18', count: 1 }));
  fileSystem.readFailure = true;
  assert.equal(await budget.reserve('2026-09-18'), false);
  fileSystem.readFailure = false;
  assert.equal(files.get(budgetPath), JSON.stringify({ dayKey: '2026-09-18', count: 1 }));
  files.clear();
  fileSystem.readFailure = true;
  assert.equal(await budget.reserve('2026-09-18'), false);
  fileSystem.readFailure = false;
  fileSystem.writeFailure = true;
  assert.equal(await budget.reserve('2026-09-18'), false);
  assert.equal(files.has(budgetPath), false);
});

test('a failed write does not falsely consume or grant a slot', async () => {
  const budget = new ExpoFileAiRegenerationBudget();
  files.set(budgetPath, JSON.stringify({ dayKey: '2026-09-18', count: 4 }));
  fileSystem.writeFailure = true;
  assert.equal(await budget.reserve('2026-09-18'), false);
  fileSystem.writeFailure = false;
  assert.equal(await budget.reserve('2026-09-18'), true);
  assert.equal(await budget.reserve('2026-09-18'), false);
});

test('a released slot is given back to its day, never below zero and never to another day', async () => {
  const budget = new ExpoFileAiRegenerationBudget();
  for (let attempt = 0; attempt < 5; attempt += 1) await budget.reserve('2026-09-18');
  assert.equal(await budget.reserve('2026-09-18'), false);
  await budget.release('2026-09-18');
  assert.equal(files.get(budgetPath), JSON.stringify({ dayKey: '2026-09-18', count: 4 }));
  assert.equal(await budget.reserve('2026-09-18'), true);

  await budget.release('2026-09-17');
  assert.equal(files.get(budgetPath), JSON.stringify({ dayKey: '2026-09-18', count: 5 }));

  files.set(budgetPath, JSON.stringify({ dayKey: '2026-09-19', count: 0 }));
  await budget.release('2026-09-19');
  assert.equal(files.get(budgetPath), JSON.stringify({ dayKey: '2026-09-19', count: 0 }));
  files.clear();
  await budget.release('2026-09-19');
  assert.equal(files.has(budgetPath), false);
});

test('a release runs in turn with reservations, and a store it cannot use changes nothing', async () => {
  files.set(budgetPath, JSON.stringify({ dayKey: '2026-09-18', count: 5 }));
  const budget = new ExpoFileAiRegenerationBudget();
  const [released, reserved] = await Promise.all([budget.release('2026-09-18'), new ExpoFileAiRegenerationBudget().reserve('2026-09-18')]);
  assert.equal(released, undefined);
  assert.equal(reserved, true);
  assert.equal(files.get(budgetPath), JSON.stringify({ dayKey: '2026-09-18', count: 5 }));

  fileSystem.writeFailure = true;
  await budget.release('2026-09-18');
  fileSystem.writeFailure = false;
  fileSystem.readFailure = true;
  await budget.release('2026-09-18');
  fileSystem.readFailure = false;
  assert.equal(files.get(budgetPath), JSON.stringify({ dayKey: '2026-09-18', count: 5 }));
});

test('a signed-in member\'s day allows ten re-asks; everyone else keeps five', async () => {
  const { dailyAiRegenerationsFor } = await import('../domain/regeneration-policy.ts');
  assert.equal(dailyAiRegenerationsFor(false), 5);
  assert.equal(dailyAiRegenerationsFor(true), 10);
  const budget = new ExpoFileAiRegenerationBudget();
  const member = [];
  for (let attempt = 0; attempt < 11; attempt += 1) member.push(await budget.reserve('2026-09-18', dailyAiRegenerationsFor(true)));
  assert.deepEqual(member, [...Array(10).fill(true), false]);
  // Signing out the same day leaves the five a non-member has, already spent.
  assert.equal(await budget.reserve('2026-09-18', dailyAiRegenerationsFor(false)), false);
});
