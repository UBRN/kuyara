import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';

// Jest does not run React Compiler, so only the compiled output can show what a memo block
// is keyed on. The hourly rail is Weather's heaviest child: when its columns were built in
// the screen's widest block, every refresh flag change rebuilt all of them and redrew both
// tabs' worth of hours (measured 2026-10-01: 66 ms per weather update in a development build,
// 29 ms once the columns kept their identity).
const compiled = execFileSync(
  process.execPath,
  [
    path.join(import.meta.dirname, '../../../../test/react-compiler-output.cjs'),
    path.join(import.meta.dirname, 'weather-screen.tsx'),
  ],
  { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
);

test('the hourly rail columns are not rebuilt when only the refresh flags change', () => {
  const lines = compiled.split('\n');
  const call = lines.findIndex((line) => line.includes('hourlyRailColumns(') && !line.includes('function'));
  assert.ok(call > 0, 'the screen builds its columns with hourlyRailColumns');
  const guardIndex = lines.slice(0, call).findLastIndex((line) => /if \(\$\[\d+\] !==/u.test(line));
  assert.ok(guardIndex >= 0, 'the columns sit in a memo block');
  const guard = lines[guardIndex];
  // The nearest earlier guard could belong to some other block if the columns lost their own,
  // so the guard must be the columns' own: it sits right above the call and reads the snapshot
  // the columns are built from.
  assert.ok(call - guardIndex <= 2, `the columns call is not the body of its own memo block: ${guard.trim()}`);
  assert.match(guard, /\$\[\d+\] !== snapshot\b/u, `the columns' memo block is not keyed on the snapshot: ${guard.trim()}`);
  for (const flag of ['isRefreshing', 'refreshFailure', 'pullInFlight', 'freshnessStatus', 'handleRefresh']) {
    assert.ok(!guard.includes(flag), `the columns' memo block is keyed on ${flag}: ${guard.trim()}`);
  }
});
