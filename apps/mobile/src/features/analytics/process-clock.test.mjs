import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createProcessClock } from './domain/process-clock.ts';
import { createFirstRecommendationReport } from './application/first-recommendation-report.ts';

function readings(...values) {
  const queue = [...values];
  return () => queue.shift();
}

test('the clock measures from the first mark and ignores a later one', () => {
  const clock = createProcessClock(readings(100, 450));
  clock.mark();
  clock.mark();
  assert.equal(clock.elapsedMs(), 350);
});

test('a clock that was never marked has no elapsed time', () => {
  assert.equal(createProcessClock(readings(5)).elapsedMs(), null);
});

function recorder() {
  const events = [];
  return { events, logEvent: (name, attributes) => events.push([name, attributes]) };
}

test('the first shown recommendation of a process is reported once, with the elapsed time', () => {
  const telemetry = recorder();
  const report = createFirstRecommendationReport({ elapsedMs: readings(1200.4, 9000) });
  report(telemetry, { generationMode: 'ai-assisted', cacheState: 'stale_shown' });
  report(telemetry, { generationMode: 'on-device-ai', cacheState: 'fresh' });
  assert.deepEqual(telemetry.events, [
    ['recommendation.first_shown', { duration_ms: 1200, generation_mode: 'ai_assisted', cache_state: 'stale_shown' }],
  ]);
});

test('a process whose start was never marked reports nothing and may still report later', () => {
  const telemetry = recorder();
  const report = createFirstRecommendationReport({ elapsedMs: readings(null, 700) });
  report(telemetry, { generationMode: 'ai-assisted', cacheState: 'fresh' });
  assert.deepEqual(telemetry.events, []);
  report(telemetry, { generationMode: 'ai-assisted', cacheState: 'fresh' });
  assert.equal(telemetry.events.length, 1);
});

// The monotonic read has one owner, and the root layout takes the mark once, before Observe is
// configured and before any screen mounts.
test('performance.now is read only by the process clock, and the root layout marks it first', () => {
  const root = new URL('../../', import.meta.url);
  const readers = execFileSync('grep', ['-rl', 'performance\\.now', '.'], { cwd: root, encoding: 'utf8' })
    .split('\n').filter((file) => file && !file.includes('.test.'));
  assert.deepEqual(readers, ['./features/analytics/data/process-clock.ts']);

  const layout = readFileSync(new URL('app/_layout.tsx', root), 'utf8');
  const mark = layout.indexOf('processClock.mark()');
  assert.ok(mark > 0 && mark < layout.indexOf('configureObserveTelemetry({'));
});
