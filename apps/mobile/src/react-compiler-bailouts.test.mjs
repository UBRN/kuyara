// React Compiler (`experiments.reactCompiler`) memoizes a component only when it can compile
// it, and it skips a whole component for a construct it cannot lower, such as a `finally`
// clause anywhere in its body, or a suppressed hooks lint rule. A skipped component re-renders its entire subtree whenever it
// renders: TodayRoute did, and Today drew on every navigation commit (measured 2026-09-29).
// Jest does not run the compiler, so a render count cannot see that; this test compiles every
// production .ts and .tsx file (hooks live in .ts files) with the compiler's own logger and
// fails on any bail-out that the list below does not name.

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
  // Compiling it would memoize `activeDeparture`'s `Date.now()` read, which is an impure
  // read in render (react-hooks/purity) and needs a clock state, a timing change; the provider
  // opts out with 'use no memo'.
  ['features/recommendation/application/recommendation-application-provider.tsx', 1],
  // Hooks. A conditional inside a try/catch.
  ['features/recommendation/application/use-ai-probe.ts', 1],
  // A logical expression the compiler cannot reorder.
  ['features/recommendation/application/use-manual-mix.ts', 1],
  // A suppressed hooks lint rule.
  ['features/analytics/application/use-interaction-events.ts', 1],
  // A `??=` assignment.
  ['features/analytics/application/use-analytics-consent.ts', 1],
]);

// The screens on the Today and Weather tabs and the outfit detail must also compile at least
// one component: an empty report would pass the check without compiling anything.
const hotPath = new Set([
  'app/(tabs)/(today)/index.tsx',
  'app/(tabs)/weather/index.tsx',
  'features/today/presentation/today-screen.tsx',
  'features/today/presentation/today-alternates.tsx',
  'features/today/presentation/today-header.tsx',
  'features/today/presentation/today-interludes.tsx',
  'features/today/presentation/today-motion.tsx',
  'features/today/presentation/today-outfit.tsx',
  'features/today/presentation/today-outfit-notes.tsx',
  'features/weather/presentation/weather-screen.tsx',
  // Phase 7b: a piece change re-renders the whole outfit detail when any of these is skipped.
  'app/(tabs)/(today)/[id].tsx',
  'features/today/presentation/outfit-detail-screen.tsx',
  'features/today/presentation/outfit-detail-board-names.tsx',
  'features/today/presentation/outfit-detail-pieces.tsx',
  'features/today/presentation/outfit-detail-recap.tsx',
  'features/today/presentation/outfit-detail-why.tsx',
  'features/today/presentation/outfit-detail-worn.tsx',
  'garment-art/garment-swap-board.tsx',
  'garment-art/swap-piece-view.tsx',
]);

// On the outfit detail path, Today and the Closet list, the values a compiled component still
// computes on every render because the compiler dropped their memo block: file -> component ->
// how many. A value derived before a hook call and handed to an unknown function after it
// keeps its block open across the hook, and the compiler drops the block; everything built from it then changes
// identity on every render, and the board below it draws again (measured 2026-09-29). The
// list only shrinks, and a count that no longer matches fails in both directions.
const knownPruned = new Map([
  // The recommendation and the open outfit, read from provider state whose identity holds.
  ['app/(tabs)/(today)/[id].tsx', { OutfitDetailRoute: 4 }],
  ['features/today/presentation/outfit-detail-screen.tsx', {}],
  ['garment-art/garment-swap-board.tsx', { GarmentSwapBoard: 27 }],
  ['garment-art/swap-piece-view.tsx', {}],
  ['garment-art/garment-painting.tsx', {}],
  ['features/today/presentation/today-screen.tsx', {}],
  // Today's routes and the hooks they read: a hook result's property read before another hook,
  // or the Today state inside an object literal handed to a hook, would drop these blocks.
  ['app/(tabs)/(today)/index.tsx', {}],
  ['features/today/application/use-ask-again-sheet.ts', {}],
  ['features/today/application/use-closet-seed.ts', {}],
  ['features/today/application/use-day-question-sheet.ts', {}],
  ['features/today/application/use-day-worn-looks.ts', {}],
  ['features/today/application/use-name-prompt.ts', {}],
  ['features/today/application/use-outfit-detail-opened-report.ts', {}],
  ['features/today/application/use-today-alert-offer.ts', {}],
  ['features/today/application/use-today-focus.ts', {}],
  ['features/today/application/use-today-pull-refresh.ts', {}],
  ['features/today/application/use-today-reports.ts', {}],
  ['features/wardrobe/application/use-piece-sheet.ts', {}],
  ['features/wardrobe/presentation/wardrobe-list-screen.tsx', {}],
]);

const files = readdirSync(sourceRoot, { recursive: true })
  .map((file) => file.split(path.sep).join('/'))
  .filter((file) => /\.tsx?$/.test(file) && !/\.(test|d)\.tsx?$/.test(file) && !file.includes('__tests__/'))
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
  test(`React Compiler memoizes every value it can in ${file}`, () => {
    assert.deepEqual(report[path.join(sourceRoot, file)].pruned, pruned);
  });
}

test('the bail-out list and the hot path name production files that exist', () => {
  for (const file of [...knownBailouts.keys(), ...hotPath, ...knownPruned.keys()]) {
    assert.ok(existsSync(path.join(sourceRoot, file)), `${file} no longer exists`);
    assert.ok(files.includes(file), `${file} is not a production source file`);
  }
  for (const [file, count] of knownBailouts) {
    assert.ok(count > 0, `${file} is listed with no bail-outs`);
  }
});
