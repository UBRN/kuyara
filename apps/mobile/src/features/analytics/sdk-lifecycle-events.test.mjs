import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';

import { sdkLifecycleEventNames } from './domain/analytics-events.ts';

// The SDK's lifecycle autocapture sends events the app never names in code. Each one the
// installed SDK can emit has to be reviewed and named in docs/analytics-taxonomy.md
// section 5.1, so an SDK upgrade that adds a lifecycle event fails here until reviewed.
const require = createRequire(import.meta.url);
const sdkBundle = readFileSync(
  new URL('posthog-rn.js', `file://${require.resolve('posthog-react-native')}`),
  'utf8',
);
const taxonomy = readFileSync(new URL('../../../../../docs/analytics-taxonomy.md', import.meta.url), 'utf8');

function sdkLifecycleEvents() {
  return [...new Set([...sdkBundle.matchAll(/capture\(['"](Application [A-Za-z ]+)['"]/g)]
    .map(([, name]) => name))].sort();
}

function taxonomySection(heading) {
  const start = taxonomy.indexOf(`### ${heading}`);
  assert.notEqual(start, -1, `docs/analytics-taxonomy.md has no section "${heading}"`);
  const end = taxonomy.indexOf('\n### ', start + 1);
  return taxonomy.slice(start, end === -1 ? undefined : end);
}

test('the installed SDK still exposes its lifecycle captures to this scan', () => {
  assert.ok(sdkLifecycleEvents().includes('Application Opened'));
});

test('every lifecycle event the installed SDK emits is named in taxonomy section 5.1', () => {
  const section = taxonomySection('5.1 App lifecycle and session usage');
  const missing = sdkLifecycleEvents().filter((name) => !section.includes(`\`${name}\``));
  assert.deepEqual(missing, []);
});

test('the adapter allowlist is exactly the set of lifecycle events the installed SDK emits', () => {
  assert.deepEqual([...sdkLifecycleEventNames].sort(), sdkLifecycleEvents());
});
