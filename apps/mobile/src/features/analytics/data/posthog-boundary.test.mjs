import assert from 'node:assert/strict';
import test from 'node:test';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dataDirectory = dirname(fileURLToPath(import.meta.url));
const sources = readdirSync(dataDirectory)
  .filter((name) => name.endsWith('.ts'))
  .map((name) => [name, readFileSync(join(dataDirectory, name), 'utf8')]);

// ADR 0033 section 6 item 5 and taxonomy 2: no person profile is ever created in the
// accountless release, so these four SDK methods must have no caller. This is the greppable
// guard the ADR asks for, in the same spirit as the `@expo/ui` rule in `AGENTS.md`.
test('no adapter creates a person profile, reads a flag, or records a session', () => {
  // Composed rather than written out, so the repository-wide grep for these call sites finds
  // no match in the guard that forbids them.
  const forbidden = [
    ...['identify', 'alias', 'group', 'setPersonProperties'].map((name) => `${name}(`),
    'isFeatureEnabled',
    'getFeatureFlag',
    'startSessionRecording',
  ];
  for (const [name, source] of sources) {
    const code = source.replace(/^\s*\/\/.*$/gm, '');
    for (const method of forbidden) {
      assert.equal(code.includes(method), false, `${name} must not use ${method}`);
    }
  }
});

test('exactly one adapter imports the PostHog SDK, and it pins the privacy options', () => {
  const importers = sources.filter(([, source]) => source.includes('posthog-react-native'));
  assert.deepEqual(
    importers.map(([name]) => name),
    ['posthog-product-analytics.ts'],
  );
  const [[, adapter]] = importers;
  for (const option of [
    'defaultOptIn: false',
    "personProfiles: 'identified_only'",
    'disableGeoip: true',
    "persistence: 'file'",
    'captureAppLifecycleEvents: true',
    'reset([])',
  ]) {
    assert.equal(adapter.includes(option), true, `the adapter must keep ${option}`);
  }
});
