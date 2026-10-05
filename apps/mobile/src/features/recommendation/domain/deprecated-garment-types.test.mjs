import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';

// A deprecated garment type stays readable on saved items but is never offered. The shipped
// catalog has none, so the probe builds a catalog where three pieces are deprecated, in a
// process with module mocks enabled, and reports what the recommendation domain offers.
const mobileRoot = path.join(import.meta.dirname, '../../../..');
const run = spawnSync(
  process.execPath,
  [
    '--experimental-strip-types',
    '--experimental-test-module-mocks',
    '--import', path.join(mobileRoot, 'test/node-typescript-resolver.mjs'),
    path.join(import.meta.dirname, 'deprecated-garment-types.test.probe.mjs'),
  ],
  { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
);
assert.equal(run.status, 0, run.stderr);
const { deprecated, results } = JSON.parse(run.stdout.trim().split('\n').at(-1));

test('the probe deprecates a footwear piece, the best bottom and an accessory', () => {
  assert.equal(deprecated.length, 3);
});

for (const name of ['recommendation', 'pool', 'footwear candidates', 'best remaining bottom', 'accessory candidates']) {
  test(`${name} never offers a deprecated type`, () => {
    assert.equal(results[name].thrown, undefined, results[name].thrown);
    assert.deepEqual(results[name].offered.filter((typeId) => deprecated.includes(typeId)), []);
  });
}
