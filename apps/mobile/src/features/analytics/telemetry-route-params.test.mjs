// A source test, not a behaviour test. Observe's router integration exports the resolved
// URL and every route and query parameter it can serialize, so a new dynamic segment or a
// new `useLocalSearchParams` key that nobody adds to `telemetryFilteredRouteParams` would
// start sending an identifier off the device silently. This fails the build instead.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { telemetryFilteredRouteParams } from './domain/telemetry-route-params.ts';

const sourceRoot = fileURLToPath(new URL('../..', import.meta.url));
const appRoot = join(sourceRoot, 'app');

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

const filtered = new Set(telemetryFilteredRouteParams);

test('the filtered list is sorted and has no duplicates', () => {
  const values = [...telemetryFilteredRouteParams];
  assert.deepEqual(values, [...new Set(values)].sort());
});

test('every dynamic route segment under src/app is filtered', () => {
  const segments = new Set();
  for (const path of walk(appRoot)) {
    for (const [, name] of path.matchAll(/\[(?:\.\.\.)?([A-Za-z0-9_]+)\]/g)) {
      segments.add(name);
    }
  }

  assert.ok(segments.size > 0, 'expected at least one dynamic route segment');
  for (const segment of segments) {
    assert.ok(filtered.has(segment), `dynamic segment "${segment}" is not in telemetryFilteredRouteParams`);
  }
});

test('every useLocalSearchParams key in the app is filtered', () => {
  const keys = new Set();
  const sources = walk(sourceRoot).filter(
    (path) => /\.tsx?$/.test(path) && !path.includes('__tests__') && !/\.test\./.test(path),
  );

  for (const path of sources) {
    const source = readFileSync(path, 'utf8');
    for (const [, block] of source.matchAll(/useLocalSearchParams<\{([\s\S]*?)\}>/g)) {
      for (const [, key] of block.matchAll(/([A-Za-z0-9_]+)\s*\??\s*:/g)) keys.add(key);
    }
    // A call with no type argument names no keys, so the scan cannot see them.
    assert.equal(
      /useLocalSearchParams\s*\(/.test(source) && !/useLocalSearchParams\s*</.test(source),
      false,
      `${path} calls useLocalSearchParams without a type argument, so its keys cannot be scanned`,
    );
    // `router.push({ pathname, params: { ... } })` and `router.setParams({ ... })`.
    for (const [, block] of source.matchAll(/(?:params:|setParams\()\s*\{([^{}]*)\}/g)) {
      for (const [, key] of block.matchAll(/([A-Za-z0-9_]+)\s*:/g)) keys.add(key);
    }
  }

  assert.ok(keys.size > 0, 'expected at least one route parameter');
  for (const key of keys) {
    assert.ok(filtered.has(key), `route parameter "${key}" is not in telemetryFilteredRouteParams`);
  }
});
