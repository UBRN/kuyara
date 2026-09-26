import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createProductAnalytics,
  createUnavailableProductAnalytics,
} from './data/create-product-analytics.ts';
import { DevelopmentLoggingProductAnalytics } from './data/development-logging-product-analytics.ts';

test('the development logger prints only the event and JSON properties after consent', async (t) => {
  const messages = [];
  const original = console.debug;
  console.debug = (...values) => messages.push(values);
  t.after(() => {
    console.debug = original;
  });
  const analytics = new DevelopmentLoggingProductAnalytics('undecided');

  analytics.capture('screen_viewed', {
    schema_version: 3,
    screen_name: 'today',
  });
  await analytics.optIn('today_sheet');
  analytics.capture('screen_viewed', {
    schema_version: 3,
    screen_name: 'today',
  });
  await analytics.withdraw();
  analytics.capture('notification_opened', { schema_version: 3 });

  assert.deepEqual(messages, [
    [
      'analytics analytics_consent_granted {"schema_version":3,"surface":"today_sheet"}',
    ],
    ['analytics screen_viewed {"schema_version":3,"screen_name":"today"}'],
  ]);
  assert.equal(analytics.getIdentifier(), null);
});

test('the factory uses logging only for a missing development key', (t) => {
  const originalKey = process.env.EXPO_PUBLIC_POSTHOG_API_KEY;
  const originalHost = process.env.EXPO_PUBLIC_POSTHOG_HOST;
  t.after(() => {
    if (originalKey === undefined) delete process.env.EXPO_PUBLIC_POSTHOG_API_KEY;
    else process.env.EXPO_PUBLIC_POSTHOG_API_KEY = originalKey;
    if (originalHost === undefined) delete process.env.EXPO_PUBLIC_POSTHOG_HOST;
    else process.env.EXPO_PUBLIC_POSTHOG_HOST = originalHost;
  });
  delete process.env.EXPO_PUBLIC_POSTHOG_API_KEY;
  delete process.env.EXPO_PUBLIC_POSTHOG_HOST;

  assert.ok(
    createProductAnalytics(true, 'granted')
      instanceof DevelopmentLoggingProductAnalytics,
  );
  assert.equal(createProductAnalytics(false, 'granted').getIdentifier(), null);

  process.env.EXPO_PUBLIC_POSTHOG_API_KEY = 'configured-but-invalid';
  assert.equal(createProductAnalytics(true, 'granted').getIdentifier(), null);
});

test('missing provider config keeps cleanup pending across restart when native disable fails', async () => {
  const files = new Map([['.posthog-rn.json', JSON.stringify({
    version: 'v1', content: { opted_out: false, distinct_id: 'old-id', queue: ['old'] },
  })]]);
  const storage = {
    getItem: (key) => files.get(key) ?? null,
    setItem: (key, value) => { files.set(key, value); },
  };
  const failed = createUnavailableProductAnalytics('withdrawn', storage, () => {
    throw new Error('native disable failed');
  });
  await failed.whenReady();
  assert.equal(failed.isCleanupPending(), true);
  assert.deepEqual(JSON.parse(files.get('.posthog-rn.json')).content, { opted_out: true });

  const restarted = createUnavailableProductAnalytics('withdrawn', storage, () => undefined);
  await restarted.whenReady();
  assert.equal(restarted.isCleanupPending(), false);
  await restarted.prepareGrant();
  assert.deepEqual(JSON.parse(files.get('.posthog-rn-logs.json')).content, {});
});
