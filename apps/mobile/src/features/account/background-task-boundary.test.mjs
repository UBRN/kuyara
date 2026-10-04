// ADR 0041 section 4: the background task (weather alerts) never touches Supabase. This walks
// every module the task entry reaches and proves none is the account feature or the client.

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const sourceRoot = path.resolve(import.meta.dirname, '../..');
const entry = 'features/notifications/data/expo-background-weather-alert-task.ts';

/** The source file a local specifier names, or null for a package. */
function resolve(from, specifier) {
  const base = specifier.startsWith('@/') ? specifier.slice(2)
    : specifier.startsWith('.') ? path.posix.join(path.posix.dirname(from), specifier) : null;
  if (base === null) return null;
  return [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`].find((candidate) =>
    /\.tsx?$/.test(candidate) && existsSync(path.join(sourceRoot, candidate))) ?? null;
}

test('the background task reaches no account module and no Supabase package', () => {
  const seen = new Set([entry]);
  const packages = new Set();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.shift();
    const text = readFileSync(path.join(sourceRoot, file), 'utf8');
    // A type-only import runs nothing, so it is not followed.
    const statements = text.matchAll(/^\s*(?:import|export)\s+(type\s+)?[^;]*?\bfrom\s*['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/gm);
    for (const [, typeOnly, fromSpecifier, dynamicSpecifier] of statements) {
      const specifier = fromSpecifier ?? dynamicSpecifier;
      if (typeOnly !== undefined || specifier === undefined) continue;
      const target = resolve(file, specifier);
      if (target === null) packages.add(specifier);
      else if (!seen.has(target)) { seen.add(target); queue.push(target); }
    }
  }
  assert.ok(seen.size > 5, `the walk found only ${seen.size} modules`);
  assert.deepEqual([...seen].filter((file) => file.startsWith('features/account/')), []);
  assert.deepEqual([...packages].filter((name) => /supabase|apple-authentication|secure-store/.test(name)), []);
});
