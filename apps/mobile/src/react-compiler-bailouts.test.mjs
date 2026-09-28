// React Compiler (`experiments.reactCompiler`) memoizes a component only when it can compile
// it, and it skips a whole component for a construct it cannot lower, such as a `finally`
// clause anywhere in its body. A skipped component re-renders its entire subtree whenever it
// renders: TodayRoute did, and Today drew on every navigation commit (measured 2026-09-29).
// Jest does not run the compiler, so a render count cannot see that; this test compiles the
// screens on the Today and Weather tabs with the compiler's own logger and fails on any bail-out.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';

const sourceRoot = import.meta.dirname;
const files = [
  'app/(tabs)/(today)/index.tsx',
  'app/(tabs)/weather/index.tsx',
  'features/today/presentation/today-screen.tsx',
  'features/weather/presentation/weather-screen.tsx',
];

const report = JSON.parse(execFileSync(
  process.execPath,
  [
    path.join(sourceRoot, '../test/react-compiler-report.cjs'),
    ...files.map((file) => path.join(sourceRoot, file)),
  ],
  { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
));

for (const file of files) {
  test(`React Compiler compiles every component in ${file}`, () => {
    const { compiled, skipped } = report[path.join(sourceRoot, file)];
    assert.deepEqual(skipped, []);
    assert.ok(compiled > 0, 'the compiler should have compiled at least one component');
  });
}
