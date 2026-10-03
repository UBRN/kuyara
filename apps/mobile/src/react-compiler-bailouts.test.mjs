// React Compiler (`experiments.reactCompiler`) memoizes a component only when it can compile
// it, and it skips a whole component for a construct it cannot lower, such as a `finally`
// clause anywhere in its body, or a suppressed hooks lint rule. A skipped component re-renders its entire subtree whenever it
// renders: TodayRoute did, and Today drew on every navigation commit (measured 2026-09-29).
// Jest does not run the compiler, so a render count cannot see that; this test compiles every
// production .tsx file with the compiler's own logger and fails on any bail-out that the
// list below does not name.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const sourceRoot = import.meta.dirname;

// The functions the compiler still skips: file -> how many. The list only shrinks. A count
// that no longer matches fails in both directions, so a fix must delete its entry and a new
// bail-out cannot hide behind an old one.
const knownBailouts = new Map([
  // A `finally` clause on the consent surfaces.
  ['features/analytics/presentation/analytics-consent-screen.tsx', 1],
  ['features/profile/presentation/privacy-settings-screen.tsx', 1],
  // Naming the trailing evaluation from inside itself is the hoisting the compiler rejects,
  // and compiling it would memoize `activeDeparture`'s `Date.now()` read, which is an impure
  // read in render (react-hooks/purity) and needs a clock state, a timing change.
  ['features/recommendation/application/recommendation-application-provider.tsx', 1],
  // An arrow function the compiler cannot reorder.
  ['features/wardrobe/presentation/wardrobe-item-form-screen.tsx', 1],
]);

// The screens on the Today and Weather tabs and the outfit detail must also compile at least
// one component: an empty report would pass the check without compiling anything.
const hotPath = new Set([
  'app/(tabs)/(today)/index.tsx',
  'app/(tabs)/weather/index.tsx',
  'features/today/presentation/today-screen.tsx',
  'features/weather/presentation/weather-screen.tsx',
  // Phase 7b: a piece change re-renders the whole outfit detail when any of these is skipped.
  'app/(tabs)/(today)/[id].tsx',
  'features/today/presentation/outfit-detail-screen.tsx',
  'components/ui/garment-board/garment-swap-board.tsx',
]);

// On the outfit detail path, the values a compiled component still computes on every render
// because the compiler dropped their memo block: file -> component -> how many. A value
// derived before a hook call and handed to an unknown function after it keeps its block open
// across the hook, and the compiler drops the block; everything built from it then changes
// identity on every render, and the board below it draws again (measured 2026-09-29). The
// list only shrinks, and a count that no longer matches fails in both directions.
const knownPruned = new Map([
  // The recommendation and the open outfit, read from provider state whose identity holds.
  ['app/(tabs)/(today)/[id].tsx', { OutfitDetailRoute: 7 }],
  ['features/today/presentation/outfit-detail-screen.tsx', {}],
  ['components/ui/garment-board/garment-swap-board.tsx', { GarmentSwapBoard: 28 }],
  ['components/ui/garment-board/garment-painting.tsx', {}],
]);

const files = readdirSync(sourceRoot, { recursive: true })
  .map((file) => file.split(path.sep).join('/'))
  .filter((file) => file.endsWith('.tsx') && !file.endsWith('.test.tsx') && !file.includes('__tests__/'))
  .sort();

const report = JSON.parse(execFileSync(
  process.execPath,
  [
    path.join(sourceRoot, '../test/react-compiler-report.cjs'),
    ...files.map((file) => path.join(sourceRoot, file)),
  ],
  { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
));

for (const file of files) {
  test(`React Compiler skips exactly the known functions in ${file}`, () => {
    const { compiled, skipped } = report[path.join(sourceRoot, file)];
    assert.equal(skipped.length, knownBailouts.get(file) ?? 0, skipped.join('\n'));
    if (hotPath.has(file)) {
      assert.ok(compiled > 0, 'the compiler should have compiled at least one component');
    }
  });
}

for (const [file, pruned] of knownPruned) {
  test(`React Compiler memoizes every value it can on the detail path in ${file}`, () => {
    assert.deepEqual(report[path.join(sourceRoot, file)].pruned, pruned);
  });
}

test('the bail-out list and the hot path name production files that exist', () => {
  for (const file of [...knownBailouts.keys(), ...hotPath, ...knownPruned.keys()]) {
    assert.ok(existsSync(path.join(sourceRoot, file)), `${file} no longer exists`);
    assert.ok(files.includes(file), `${file} is not a production .tsx file`);
  }
  for (const [file, count] of knownBailouts) {
    assert.ok(count > 0, `${file} is listed with no bail-outs`);
  }
});
