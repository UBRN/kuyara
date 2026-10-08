import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { analyticsConsentState } from './domain/analytics-consent-state.ts';
import { createPostHogProductAnalytics } from './data/posthog-product-analytics.ts';
import { LocalProfileRepository } from '../profile/data/profile-repository.ts';
import { SqliteProfileLocalDataSource } from '../profile/data/sqlite-profile-local-data-source.ts';
import { migrateDatabase } from '../../infrastructure/sqlite/migrations.ts';
import { NodeSqliteDatabase } from '../../../test/node-sqlite-database.mjs';
import { sourceFiles } from '../../../test/source-files.mjs';

const createdAt = '2026-07-30T10:00:00.000Z';

async function createRepository(t) {
  const database = new NodeSqliteDatabase();
  t.after(() => database.close());
  await migrateDatabase(database);
  const dataSource = new SqliteProfileLocalDataSource(database, {
    createId: () => '018f0f4d-1d45-4ae7-a8f1-796e8297d3b4',
    now: () => createdAt,
  });
  return { database, dataSource, repository: new LocalProfileRepository(dataSource) };
}

test('the effective consent starts undecided, which permits nothing', () => {
  assert.equal(analyticsConsentState.current(), 'undecided');
});

test('a committed consent write updates the effective value before the write resolves', async (t) => {
  const { dataSource, repository } = await createRepository(t);
  await repository.getOrCreateProfile();
  analyticsConsentState.set('undecided');

  const write = dataSource.updateAnalyticsConsent('granted');
  assert.equal(analyticsConsentState.current(), 'undecided', 'not before the commit');
  await write;
  assert.equal(analyticsConsentState.current(), 'granted');

  await repository.updateAnalyticsConsent('withdrawn');
  assert.equal(analyticsConsentState.current(), 'withdrawn');
});

test('a failed or invalid consent write leaves the previous effective value', async (t) => {
  const { database, dataSource, repository } = await createRepository(t);

  // No profile row exists yet, so the write changes nothing and fails.
  analyticsConsentState.set('granted');
  await assert.rejects(() => dataSource.updateAnalyticsConsent('withdrawn'));
  assert.equal(analyticsConsentState.current(), 'granted');

  await repository.getOrCreateProfile();
  await assert.rejects(() => repository.updateAnalyticsConsent('maybe'));
  assert.equal(analyticsConsentState.current(), 'granted');

  // A rolled-back transaction is a failed write too.
  const failing = new SqliteProfileLocalDataSource({
    withExclusiveTransactionAsync: async (task) => {
      database.database.exec('BEGIN IMMEDIATE');
      try {
        await task(database);
        throw new Error('commit failed');
      } catch (error) {
        database.database.exec('ROLLBACK');
        throw error;
      }
    },
  }, { createId: () => 'unused', now: () => createdAt });
  await assert.rejects(() => failing.updateAnalyticsConsent('withdrawn'));
  assert.equal(analyticsConsentState.current(), 'granted');
  assert.equal(
    (await database.getFirstAsync('SELECT analytics_consent AS value FROM local_profiles')).value,
    'undecided',
  );
});

class FakeClient {
  captures = [];
  async capture(name) { this.captures.push(name); }
  async flush() { this.captures.push('flush'); }
  getDistinctId() { return 'identifier'; }
  getSessionId() { return 'session'; }
  async optIn() {}
  async optOut() {}
  async ready() {}
  async persistAndVerifyCleanup() {}
  reset() {}
  setPersistedProperty() {}
}

function adapterOn(consent) {
  const sent = [];
  let beforeSend;
  const client = new FakeClient();
  const analytics = createPostHogProductAnalytics(
    {
      apiKey: 'phc_test',
      host: 'https://eu.i.posthog.com',
      consent,
      readConsent: analyticsConsentState.current,
    },
    (hook) => {
      beforeSend = hook;
      return client;
    },
  );
  return {
    analytics,
    client,
    sent,
    send: () => beforeSend({ event: 'screen_viewed', properties: { schema_version: 4 } }),
  };
}

test('nothing is captured or sent while consent is undecided or declined', async () => {
  for (const consent of ['undecided', 'withdrawn']) {
    analyticsConsentState.set(consent);
    const { analytics, client } = adapterOn(consent);
    await analytics.whenReady();
    analytics.capture('notification_opened', { schema_version: 4, kind: 'weather_alert' });
    await analytics.flush();
    assert.deepEqual(client.captures, []);
    assert.equal(analytics.getIdentifier(), null);
  }
});

test('the shared value closes capture, before-send, flush and identifier in the same tick', async () => {
  analyticsConsentState.set('granted');
  const { analytics, client, send } = adapterOn('granted');
  await analytics.whenReady();

  analytics.capture('notification_opened', { schema_version: 4, kind: 'weather_alert' });
  assert.deepEqual(client.captures, ['notification_opened']);
  assert.notEqual(send(), null);
  assert.equal(analytics.getIdentifier(), 'identifier');

  analyticsConsentState.set('withdrawn');
  analytics.capture('notification_opened', { schema_version: 4, kind: 'weather_alert' });
  await analytics.flush();
  assert.deepEqual(client.captures, ['notification_opened']);
  assert.equal(send(), null);
  assert.equal(analytics.getIdentifier(), null);
  assert.equal(analytics.getSessionId(), null);
});

// The stored answer is read from SQLite once, at launch. Every other gate reads the value above,
// so no capture, send, flush or identifier read opens a connection per call.
test('only the root layout reads the consent column synchronously', () => {
  const root = fileURLToPath(new URL('../..', import.meta.url));
  const readers = sourceFiles(root, { extensions: ['.ts', '.tsx'] })
    .filter((file) => !/\.test\.|__tests__/.test(file))
    .filter((file) => readFileSync(join(root, file), 'utf8').includes('readAnalyticsConsentSync'))
    .sort();
  assert.deepEqual(readers, [
    'app/_layout.tsx',
    'features/analytics/data/analytics-consent-sync-source.ts',
  ]);
});
