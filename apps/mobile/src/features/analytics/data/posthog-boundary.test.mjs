import assert from 'node:assert/strict';
import test from 'node:test';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const dataDirectory = dirname(fileURLToPath(import.meta.url));
const sourceDirectory = join(dataDirectory, '..', '..', '..');
const sdkPackage = ['post', 'hog-react-native'].join('');
const forbiddenCalls = [
  ['identi', 'fy('].join(''),
  ['ali', 'as('].join(''),
  ['.gro', 'up('].join(''),
  ['setPerson', 'Properties('].join(''),
];

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    if (!['.ts', '.tsx'].includes(extname(entry.name)) || entry.name.includes('.test.')) return [];
    return [path];
  });
}

const sources = sourceFiles(sourceDirectory);

// ADR 0033 section 6 item 5 and taxonomy 2: no person profile is ever created in the
// accountless release, so these four SDK methods must have no caller. This is the greppable
// guard the ADR asks for, in the same spirit as the `@expo/ui` rule in `AGENTS.md`.
test('production source never calls provider identity APIs', () => {
  for (const path of sources) {
    const source = readFileSync(path, 'utf8').replace(/^\s*\/\/.*$/gm, '');
    for (const call of forbiddenCalls) {
      assert.equal(
        source.includes(call),
        false,
        `${relative(sourceDirectory, path)} must not call ${call}`,
      );
    }
  }
});

test('exactly one adapter imports the PostHog SDK, and it pins the privacy options', () => {
  const importers = sources
    .filter((path) => readFileSync(path, 'utf8').includes(sdkPackage))
    .map((path) => relative(sourceDirectory, path));
  assert.deepEqual(
    importers,
    [`features/analytics/data/${sdkPackage.replace('-react-native', '-product-analytics.ts')}`],
  );
  assert.equal(
    importers.every((path) => join(sourceDirectory, path).startsWith(dataDirectory)),
    true,
  );
  const adapter = readFileSync(join(sourceDirectory, importers[0]), 'utf8');
  for (const option of [
    'defaultOptIn: true,',
    'private client: PostHogClient | null = null;',
    "personProfiles: 'identified_only'",
    'disableGeoip: true',
    'captureAppLifecycleEvents: true',
    'before_send: sanitizePostHogEvent',
    'preloadFeatureFlags: false',
    'disableRemoteFeatureFlags: true',
    'disableSurveys: true',
    'enableSessionReplay: false',
    'setDefaultPersonProperties: false',
    'setPersistedProperty(',
  ]) {
    assert.equal(adapter.includes(option), true, `the adapter must keep ${option}`);
}
});
