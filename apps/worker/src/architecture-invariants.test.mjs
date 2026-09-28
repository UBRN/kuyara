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

// An exported Worker function never defaults a time parameter to the ambient clock. Only
// annotated parameters (`: Date`, `: string`, `: number`) are read; an unannotated default is
// not covered.
test('a Worker function does not default a time parameter to the ambient clock', () => {
  const clockDefault = /(?::\s*Date|:\s*string|:\s*number)\s*=\s*(?:new Date\(\)|Date\.now\(\))/;
  const hits = sourceFiles().filter((relativePath) => (
    clockDefault.test(readFileSync(path.join(sourceRoot, relativePath), 'utf8'))
  ));

  assert.deepEqual(hits, [], 'make the time parameter required and pass the clock at the call site');
});

// A swallowed error is justified in one line: an empty `catch` block says nothing. The
// promise form `.catch(() => {})` is not covered yet.
test('Worker production code has no empty catch block', () => {
  const empty = /catch(?:\s*\([^)]*\))?\s*\{\s*\}/g;
  const hits = [];
  for (const relativePath of sourceFiles()) {
    const text = readFileSync(path.join(sourceRoot, relativePath), 'utf8');
    for (const match of text.matchAll(empty)) {
      hits.push(`${relativePath}:${text.slice(0, match.index).split('\n').length}`);
    }
  }

  assert.deepEqual(hits, [], 'say in one comment line why swallowing the error is safe');
});

// The archetype id reaches the precondition gate already typed by the parsed pick schema, so
// the gate is never called through a cast of its own parameter type.
test('the archetype gate is not called through a parameter-type cast', () => {
  const casts = [];
  for (const relativePath of sourceFiles()) {
    readFileSync(path.join(sourceRoot, relativePath), 'utf8').split('\n').forEach((line, index) => {
      if (/as Parameters<typeof/.test(line)) casts.push(`${relativePath}:${index + 1}`);
    });
  }

  assert.deepEqual(casts, [], 'type the argument as the contracts type instead of casting');
});
