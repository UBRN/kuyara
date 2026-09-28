// Greppable Worker rules, kept next to the Worker so its own test run sees them.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const sourceRoot = import.meta.dirname;

/** Every non-test `.ts` file under `src`, as posix paths relative to `src`. */
function sourceFiles(directory = sourceRoot, relative = '') {
  const found = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryRelative = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules') {
        found.push(...sourceFiles(path.join(directory, entry.name), entryRelative));
      }
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      found.push(entryRelative);
    }
  }
  return found;
}

// A test double never sits beside production code: the sample providers live under a
// `__tests__` folder, where the router can not import them by accident.
test('deterministic test doubles live only under __tests__ folders', () => {
  const doublePattern = /^export class Deterministic(?:Mock|Stub|Fake)\w*/m;
  const misplaced = sourceFiles()
    .filter((relativePath) => !relativePath.split('/').includes('__tests__'))
    .filter((relativePath) => (
      doublePattern.test(readFileSync(path.join(sourceRoot, relativePath), 'utf8'))
    ));

  assert.deepEqual(misplaced, [], 'move the test double under a __tests__ folder next to it');
});

// A weather adapter stamps `fetchedAt` from an injected clock, never from `new Date()` inline,
// so a test pins the stamp without a fake timer.
test('weather adapters take the clock as a dependency', () => {
  const inline = [];
  for (const relativePath of sourceFiles()) {
    if (!relativePath.startsWith('weather/')) continue;
    const lines = readFileSync(path.join(sourceRoot, relativePath), 'utf8').split('\n');
    lines.forEach((line, index) => {
      if (/new Date\(\)\.toISOString\(\)/.test(line)) inline.push(`${relativePath}:${index + 1}`);
    });
  }

  assert.deepEqual(inline, [], 'take `now` in the constructor: `dependencies.now ?? (() => new Date())`');
});
