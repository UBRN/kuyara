import assert from 'node:assert/strict';
import test from 'node:test';

import { createProductAnalytics } from './data/create-product-analytics.ts';
import { DevelopmentLoggingProductAnalytics } from './data/development-logging-product-analytics.ts';
import { noopProductAnalytics } from './data/noop-product-analytics.ts';

test('the development logger prints only the event and JSON properties after consent', async (t) => {
  const messages = [];
  const original = console.debug;
  console.debug = (...values) => messages.push(values);
  t.after(() => {
    console.debug = original;
  });
  const analytics = new DevelopmentLoggingProductAnalytics('undecided');

  analytics.capture('screen_viewed', {
    schema_version: 1,
    screen_name: 'today',
  });
  await analytics.optIn('first_launch_sheet');
  analytics.capture('screen_viewed', {
    schema_version: 1,
    screen_name: 'today',
  });
  await analytics.withdraw();
  analytics.capture('notification_opened', { schema_version: 1 });

  assert.deepEqual(messages, [
    [
      'analytics analytics_consent_granted {"schema_version":1,"surface":"first_launch_sheet"}',
    ],
    ['analytics screen_viewed {"schema_version":1,"screen_name":"today"}'],
    ['analytics analytics_consent_withdrawn {"schema_version":1}'],
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
  assert.equal(createProductAnalytics(false, 'granted'), noopProductAnalytics);

  process.env.EXPO_PUBLIC_POSTHOG_API_KEY = 'configured-but-invalid';
  assert.equal(createProductAnalytics(true, 'granted'), noopProductAnalytics);
});
