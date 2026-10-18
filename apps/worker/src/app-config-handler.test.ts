import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test, { mock } from 'node:test';

import { appConfigV1Path } from '@kuyara/contracts';

import { appConfigSiriCardKey, createAppConfigHandler, type AppConfigStore } from './app-config-handler.ts';
import { buildRouter } from './index.ts';

const warnings: unknown[] = [];
mock.method(console, 'warn', (entry: unknown) => warnings.push(entry));

const request = (method = 'GET') => new Request(`https://worker.test${appConfigV1Path}`, { method });
const ctx = { waitUntil: () => {} };

function harness(stored: () => Promise<string | null>) {
  let reads = 0;
  const store: AppConfigStore = { get: async (key) => { reads++; assert.equal(key, appConfigSiriCardKey); return stored(); } };
  const handle = createAppConfigHandler({ store });
  return { reads: () => reads, send: (method = 'GET') => handle(request(method)) };
}

test('a stored on or off answers the switch with the Worker JSON headers, read from the store each time', async () => {
  for (const value of ['on', 'off']) {
    const fake = harness(async () => value);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await fake.send();
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8');
      assert.deepEqual(await response.json(), { data: { siriCard: value } });
    }
    assert.equal(fake.reads(), 2, 'no cache sits in front of the store, so a change applies at once');
  }
});

test('an absent, malformed or unreadable key answers unavailable and logs one closed line without the value', async () => {
  const cases: [() => Promise<string | null>, string][] = [
    [async () => null, 'absent'],
    [async () => 'OFF', 'malformed'],
    [async () => ' off', 'malformed'],
    [async () => '{"siriCard":"off"}', 'malformed'],
    [async () => '', 'malformed'],
    [async () => { throw new Error('private store failure'); }, 'read_failed'],
  ];
  for (const [source, reason] of cases) {
    warnings.length = 0;
    const response = await harness(source).send();
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: { code: 'unavailable' } });
    assert.deepEqual(warnings, [{ event: 'app_config_unavailable', route: appConfigV1Path, reason }]);
  }
});

test('a method other than GET is refused before the store is read', async () => {
  const fake = harness(async () => 'on');
  const response = await fake.send('POST');
  assert.equal(response.status, 405);
  assert.equal(response.headers.get('allow'), 'GET');
  assert.deepEqual(await response.json(), { error: { code: 'method_not_allowed' } });
  assert.equal(fake.reads(), 0);
});

test('the composed route answers from the APP_CONFIG binding and is unavailable without it', async () => {
  const offline = await buildRouter({})(request(), ctx);
  assert.equal(offline.status, 503);
  assert.deepEqual(await offline.json(), { error: { code: 'unavailable' } });
  const online = await buildRouter({ APP_CONFIG: { get: async () => 'off' } })(request(), ctx);
  assert.deepEqual(await online.json(), { data: { siriCard: 'off' } });
});

test('the operator script writes the key the handler reads, through the APP_CONFIG binding', () => {
  const script = readFileSync(path.join(import.meta.dirname, '..', 'scripts', 'app-config.mjs'), 'utf8');
  assert.match(script, new RegExp(`'${appConfigSiriCardKey}'`));
  assert.match(script, /'--binding=APP_CONFIG'/);
});
