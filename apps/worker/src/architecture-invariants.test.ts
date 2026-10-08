// Greppable Worker rules, kept next to the Worker so its own test run sees them.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const sourceRoot = import.meta.dirname;

/** Every `.ts` file under `src` that is not a `*.test.ts`, as posix paths relative to `src`. */
function sourceFiles(directory = sourceRoot, relative = ''): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryRelative = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules') {
        found.push(...sourceFiles(path.join(directory, entry.name), entryRelative));
      }
    } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
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
  const inline: string[] = [];
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
// promise form `.catch(() => {})` is the same swallow and is held to the same measure.
test('Worker production code has no empty catch block or empty promise catch handler', () => {
  const empty = /catch(?:\s*\([^)]*\))?\s*\{\s*\}|\.catch\(\s*(?:\(\s*\w*\s*(?::[^)]*)?\)|\w+)\s*=>\s*\{\s*\}\s*\)/g;
  const hits: string[] = [];
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
  const casts: string[] = [];
  for (const relativePath of sourceFiles()) {
    readFileSync(path.join(sourceRoot, relativePath), 'utf8').split('\n').forEach((line, index) => {
      if (/as Parameters<typeof/.test(line)) casts.push(`${relativePath}:${index + 1}`);
    });
  }

  assert.deepEqual(casts, [], 'type the argument as the contracts type instead of casting');
});

// The JSON response headers and the error envelope have one owner, `json-response.ts`.
test('only json-response.ts defines the Worker JSON headers', () => {
  const definers = sourceFiles()
    .filter((relativePath) => /['"]Cache-Control['"]\s*:\s*['"]no-store['"]/.test(
      readFileSync(path.join(sourceRoot, relativePath), 'utf8'),
    ));

  assert.deepEqual(definers, ['json-response.ts']);
});

// The snapshot rules every provider shares (nearest hour, hourly window and cap, today's
// widened low and high, daily slice) have one owner, `weather/provider-snapshot.ts`.
test('the raw weather adapters leave the shared snapshot rules to provider-snapshot.ts', () => {
  const hits: string[] = [];
  for (const relativePath of sourceFiles()) {
    if (!/^weather\/[\w-]+-raw\.ts$/.test(relativePath)) continue;
    readFileSync(path.join(sourceRoot, relativePath), 'utf8').split('\n').forEach((line, index) => {
      if (/Math\.(?:min|max)\(|isWeatherHourlyForecastInWindow|isValidWeatherHourlyForecastWindow/.test(line)) {
        hits.push(`${relativePath}:${index + 1}`);
      }
    });
  }

  assert.deepEqual(hits, [], 'pass the provider rows to assembleProviderSnapshot instead');
});

// The day part of a daily counter key (`name:YYYY-MM-DD`) has one owner, `daily-counter.ts`.
test('only daily-counter.ts builds the UTC day of a daily counter key', () => {
  const hits = sourceFiles()
    .filter((relativePath) => relativePath !== 'daily-counter.ts')
    .filter((relativePath) => /slice\(0, 10\)/.test(
      readFileSync(path.join(sourceRoot, relativePath), 'utf8'),
    ));

  assert.deepEqual(hits, [], 'build the key with dailyCounterKey(name, now)');
});

// How a route reads its request (content type, client IP, per-IP limiter key, Retry-After and
// the bounded body reader) has one owner, `json-request.ts`.
test('only json-request.ts reads the content type, the client IP and the 429 header', () => {
  const patterns = [/headers\.get\(['"]content-type['"]\)/i, /cf-connecting-ip/i, /['"]Retry-After['"]\s*:/];
  const hits = sourceFiles()
    .filter((relativePath) => relativePath !== 'json-request.ts')
    .filter((relativePath) => {
      const text = readFileSync(path.join(sourceRoot, relativePath), 'utf8');
      return patterns.some((pattern) => pattern.test(text));
    });

  assert.deepEqual(hits, [], 'use isJsonRequest, checkRateLimit and rateLimitedHeaders');
});

test('only json-request.ts declares the rate limiter type and reads a stream by chunks', () => {
  const hits: string[] = [];
  for (const relativePath of sourceFiles()) {
    if (relativePath === 'json-request.ts') continue;
    const text = readFileSync(path.join(sourceRoot, relativePath), 'utf8');
    if (/limit\(input: \{ key: string \}\)/.test(text)) hits.push(`${relativePath}: limiter type`);
    if (/\.getReader\(\)/.test(text)) hits.push(`${relativePath}: stream reader`);
  }

  assert.deepEqual(hits, [], 'import RateLimiter and readTextWithLimit from json-request.ts');
});

// The runtime's fetch is bound in one place, and every deadline (a race or an abort timer) is
// run in one place.
test('only default-fetch.ts reads globalThis.fetch and only attempt-timeout.ts runs a deadline', () => {
  const hits: string[] = [];
  for (const relativePath of sourceFiles()) {
    const text = readFileSync(path.join(sourceRoot, relativePath), 'utf8');
    if (relativePath !== 'default-fetch.ts' && /globalThis\.fetch/.test(text)) {
      hits.push(`${relativePath}: globalThis.fetch`);
    }
    if (relativePath !== 'attempt-timeout.ts' && /Promise\.race\(/.test(text)) {
      hits.push(`${relativePath}: Promise.race`);
    }
    if (relativePath !== 'attempt-timeout.ts' && /\bsetTimeout\(/.test(text)) {
      hits.push(`${relativePath}: setTimeout`);
    }
  }

  assert.deepEqual(hits, [], 'use defaultFetch(), raceWithTimeout() and withDeadline()');
});

// The AI handler reads time only through its injected clock.
test('the AI handlers read the clock only through the injected now', () => {
  const hits = ['ai/ai-handler.ts', 'ai/probe-handler.ts'].filter((relativePath) => (
    /Date\.now\(/.test(readFileSync(path.join(sourceRoot, relativePath), 'utf8'))
  ));

  assert.deepEqual(hits, [], 'call the injected now() instead of Date.now()');
});

// The place search handler parses the request and the answer once; the provider does neither,
// and its field bounds come from the contract rather than a second copy.
test('the place provider leaves the contract parse to the handler and owns no bound of its own', () => {
  const text = readFileSync(path.join(sourceRoot, 'places/open-meteo-place-provider.ts'), 'utf8');

  assert.equal(/placeSearchV1(?:Request|Success)Schema/.test(text), false);
  assert.equal(/\.max\((?:200|400)\)/.test(text), false, 'import the bound from @kuyara/contracts');
});

// A `JSON.parse(` whose result does not go straight into a schema is a place untrusted input
// can slip past the boundary, so each one is named here and every caller validates what it
// gets. The list only shrinks: parse at the boundary and hand the schema the text instead.
test('JSON.parse sites that do not feed a schema are a frozen, shrink-only list', () => {
  const allowed = new Map([
    ['account/bounded-fetch.ts', 1],
    ['account/supabase-token-verifier.ts', 1],
    ['ai/ai-provider.ts', 1],
    ['json-request.ts', 1],
  ]);
  const found = new Map();
  for (const relativePath of sourceFiles()) {
    const count = readFileSync(path.join(sourceRoot, relativePath), 'utf8')
      .split('\n')
      .filter((line) => /JSON\.parse\(/.test(line) && !/Schema\b/.test(line)).length;
    if (count > 0) found.set(relativePath, count);
  }

  assert.deepEqual([...found].sort(), [...allowed].sort(), 'do not add a site; remove one from the list when it goes');
});

// A client body is read only through `json-request.ts`, which stops at a byte limit; the
// runtime's own readers buffer whatever arrives. The feedback route now reads through the
// shared reader too, so no route keeps a reader of its own.
test('client request bodies are read only through the bounded reader', () => {
  const unbounded: string[] = [];
  const readers: string[] = [];
  for (const relativePath of sourceFiles()) {
    readFileSync(path.join(sourceRoot, relativePath), 'utf8').split('\n').forEach((line, index) => {
      if (/\b(?:request|req)(?:\.clone\(\))?\.(?:json|text|arrayBuffer|formData|blob|bytes)\(|new Response\((?:request|req)\.body/.test(line)) {
        unbounded.push(`${relativePath}:${index + 1}`);
      }
      if (/\.getReader\(/.test(line)) readers.push(relativePath);
    });
  }

  assert.deepEqual(unbounded, [], 'read the body with readJsonBody and a byte limit');
  assert.deepEqual(readers.sort(), ['json-request.ts']);
});

// A route reads its request through `readRouteRequest` (or `admitRequest` and
// `readRequestBody` when it must check something between them); a hand-written copy of the
// content type check or the bounded read is how the routes' preambles drifted apart.
test('the content type check and the bounded JSON read live only in json-request.ts', () => {
  const hits: string[] = [];
  for (const relativePath of sourceFiles()) {
    if (relativePath === 'json-request.ts') continue;
    readFileSync(path.join(sourceRoot, relativePath), 'utf8').split('\n').forEach((line, index) => {
      if (/\b(?:isJsonRequest|readJsonBody)\(/.test(line)) hits.push(`${relativePath}:${index + 1}`);
    });
  }

  assert.deepEqual(hits, [], 'use readRouteRequest or readRequestBody from json-request.ts');
});

// The paid provider is priced per attempt, so it exists only behind its daily cap: the one
// construction sits in the composition, inside `createDailyCappedAiProvider`.
test('the Haiku adapter is built only inside its daily cap', () => {
  const sites = sourceFiles().flatMap((relativePath) => readFileSync(path.join(sourceRoot, relativePath), 'utf8')
    .split('\n')
    .flatMap((line, index, lines) => (/new HaikuAiProvider\(/.test(line)
      ? [`${relativePath}: ${/createDailyCappedAiProvider\(/.test(lines[index - 1] ?? '') ? 'capped' : 'uncapped'}`]
      : [])));
  assert.deepEqual(sites, ['index.ts: capped']);
});
