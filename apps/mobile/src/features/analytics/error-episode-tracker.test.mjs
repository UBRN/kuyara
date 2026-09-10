import assert from 'node:assert/strict';
import test from 'node:test';

import { ErrorEpisodeTracker } from './application/error-episode-tracker.ts';

function createTracker(times = ['2026-09-09T09:00:00.000Z']) {
  const captures = [];
  let index = 0;
  const tracker = new ErrorEpisodeTracker(
    (name, properties, options) => captures.push({ name, properties, options }),
    () => times[Math.min(index++, times.length - 1)],
  );
  return { tracker, captures };
}

const todayOffline = { surface: 'today', failureCategory: 'offline' };
const weatherRateLimited = { surface: 'weather', failureCategory: 'rate_limited' };

test('a failure captures nothing until the pair is finalised', () => {
  const { tracker, captures } = createTracker();
  tracker.failed(todayOffline);
  tracker.failed(todayOffline);
  assert.deepEqual(captures, []);
});

test('recovery emits the buffered error_shown before error_recovered', () => {
  const { tracker, captures } = createTracker(['2026-09-09T09:00:00.000Z']);
  tracker.failed(todayOffline);
  tracker.failed(todayOffline);
  tracker.recovered(todayOffline);

  assert.deepEqual(captures.map(({ name }) => name), [
    'error_shown',
    'error_recovered',
  ]);
  assert.deepEqual(captures[0].properties, {
    schema_version: 1,
    surface: 'today',
    failure_category: 'offline',
    occurrence_count: 2,
  });
  // The timestamp is the instant the first failure became visible, not the flush time.
  assert.deepEqual(captures[0].options, {
    timestamp: '2026-09-09T09:00:00.000Z',
  });
  assert.equal(captures[1].options, undefined);
});

test('occurrences beyond four collapse to the 5+ bucket', () => {
  const { tracker, captures } = createTracker();
  for (let i = 0; i < 9; i += 1) tracker.failed(todayOffline);
  tracker.recovered(todayOffline);
  assert.equal(captures[0].properties.occurrence_count, '5+');
});

test('a finalised pair never emits or counts again in the same session', () => {
  const { tracker, captures } = createTracker();
  tracker.failed(todayOffline);
  tracker.recovered(todayOffline);
  tracker.failed(todayOffline);
  tracker.failed(todayOffline);
  tracker.recovered(todayOffline);
  assert.deepEqual(captures.map(({ name }) => name), [
    'error_shown',
    'error_recovered',
  ]);
  assert.equal(captures[0].properties.occurrence_count, 1);
});

test('recovery without a preceding failure emits nothing', () => {
  const { tracker, captures } = createTracker();
  tracker.recovered(weatherRateLimited);
  assert.deepEqual(captures, []);
});

test('pairs are tracked independently', () => {
  const { tracker, captures } = createTracker([
    '2026-09-09T09:00:00.000Z',
    '2026-09-09T09:05:00.000Z',
  ]);
  tracker.failed(todayOffline);
  tracker.failed(weatherRateLimited);
  tracker.recovered(weatherRateLimited);

  assert.deepEqual(captures.map(({ name }) => name), [
    'error_shown',
    'error_recovered',
  ]);
  assert.equal(captures[0].properties.surface, 'weather');
  assert.deepEqual(captures[0].options, {
    timestamp: '2026-09-09T09:05:00.000Z',
  });
});

test('backgrounding flushes every buffered failure exactly once', () => {
  const { tracker, captures } = createTracker([
    '2026-09-09T09:00:00.000Z',
    '2026-09-09T09:05:00.000Z',
  ]);
  tracker.failed(todayOffline);
  tracker.failed(weatherRateLimited);
  tracker.flushAll('background');
  tracker.flushAll('background');

  assert.deepEqual(captures.map(({ name }) => name), [
    'error_shown',
    'error_shown',
  ]);
  assert.deepEqual(
    captures.map(({ properties }) => properties.surface).sort(),
    ['today', 'weather'],
  );
});

test('a pair flushed on backgrounding still reports its recovery, without a second error_shown', () => {
  const { tracker, captures } = createTracker();
  tracker.failed(todayOffline);
  tracker.flushAll('background');
  tracker.recovered(todayOffline);

  assert.deepEqual(captures.map(({ name }) => name), [
    'error_shown',
    'error_recovered',
  ]);
});

test('session end clears the buffer, so the next session starts a new episode', () => {
  const { tracker, captures } = createTracker([
    '2026-09-09T09:00:00.000Z',
    '2026-09-09T10:00:00.000Z',
  ]);
  tracker.failed(todayOffline);
  tracker.flushAll('session_end');
  tracker.failed(todayOffline);
  tracker.recovered(todayOffline);

  assert.deepEqual(captures.map(({ name }) => name), [
    'error_shown',
    'error_shown',
    'error_recovered',
  ]);
  assert.deepEqual(captures[1].options, {
    timestamp: '2026-09-09T10:00:00.000Z',
  });
});

test('reset discards buffered and finalised pairs without capturing', () => {
  const { tracker, captures } = createTracker([
    '2026-09-09T09:00:00.000Z',
    '2026-09-09T10:00:00.000Z',
  ]);
  tracker.failed(todayOffline);
  tracker.reset();
  assert.deepEqual(captures, []);

  tracker.failed(todayOffline);
  tracker.recovered(todayOffline);
  assert.deepEqual(captures.map(({ name }) => name), [
    'error_shown',
    'error_recovered',
  ]);
});
