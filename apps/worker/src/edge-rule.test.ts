// The zone WAF custom rule on api.youbrn.com blocks every request except an allowlist that
// docs/architecture.md writes down. A route the router serves but the rule does not allow is
// blocked at the edge, so the two lists must change together: this test fails until they match.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import * as contracts from '@kuyara/contracts';

const routerSource = readFileSync(path.join(import.meta.dirname, 'router.ts'), 'utf8');
const architecture = readFileSync(
  path.join(import.meta.dirname, '..', '..', '..', 'docs', 'architecture.md'),
  'utf8',
);

/** The paths the router serves: every contracts `*Path` constant `router.ts` names. */
function routerPaths(): string[] {
  const constants = routerSource.match(/\b[A-Za-z0-9]+Path\b/gu) ?? [];
  const values = [...new Set(constants)].map((name) => {
    const value = (contracts as Record<string, unknown>)[name];
    assert.equal(typeof value, 'string', `${name} is not a path exported by @kuyara/contracts`);
    return value as string;
  });
  return values.sort();
}

/** Every `METHOD /path` the documented edge rule allows. */
function documentedRule(): { method: string; path: string }[] {
  const start = architecture.indexOf('blocks every request to `api.youbrn.com` except these:');
  const end = architecture.indexOf('The zone rule must change', start);
  assert.ok(start >= 0 && end > start, 'docs/architecture.md must list the zone WAF rule allowlist');
  return [...architecture.slice(start, end).matchAll(/`(GET|POST) (\/[^`\s]+)`/gu)]
    .map(([, method, route]) => ({ method: method as string, path: route as string }));
}

test('the router names every route through a contracts path constant, never a literal', () => {
  assert.doesNotMatch(routerSource, /pathname\s*===\s*['"`]/u);
  assert.ok(routerPaths().length > 0);
});

test('the zone WAF allowlist in docs/architecture.md equals the paths the router serves', () => {
  const documented = documentedRule();
  assert.deepEqual(
    documented.map(({ path: route }) => route).sort(),
    routerPaths(),
    'a route was added or removed: change the zone WAF custom rule on api.youbrn.com and the list in '
    + 'docs/architecture.md together',
  );
});

test('only the two probes the router answers for GET are allowed as GET', () => {
  const getPaths = documentedRule().filter(({ method }) => method === 'GET').map(({ path: route }) => route);
  assert.deepEqual(getPaths.sort(), [contracts.aiReadyV1Path, contracts.healthV1Path].sort());
});
