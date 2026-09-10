import assert from 'node:assert/strict';
import test from 'node:test';

import { ConsentBufferingProductAnalytics } from './consent-buffering-product-analytics.ts';
import { RecordingProductAnalytics } from './recording-product-analytics.ts';

test('undecided captures replay after the grant event with their original timestamps', async () => {
  const inner = new RecordingProductAnalytics('undecided');
  const analytics = new ConsentBufferingProductAnalytics(
    inner,
    'undecided',
    () => '2026-09-10T08:00:00.000Z',
  );

  analytics.capture('screen_viewed', {
    schema_version: 1,
    screen_name: 'onboarding',
  });
  analytics.capture(
    'notification_opened',
    { schema_version: 1 },
    { timestamp: '2026-09-10T08:01:00.000Z' },
  );

  assert.deepEqual(inner.captures, []);
  await analytics.optIn('first_launch_sheet');

  assert.deepEqual(inner.names(), [
    'analytics_consent_granted',
    'screen_viewed',
    'notification_opened',
  ]);
  assert.deepEqual(inner.captures[1].options, {
    timestamp: '2026-09-10T08:00:00.000Z',
  });
  assert.deepEqual(inner.captures[2].options, {
    timestamp: '2026-09-10T08:01:00.000Z',
  });
});

test('the 50-event cap drops the oldest undecided captures', async () => {
  const inner = new RecordingProductAnalytics('undecided');
  let captureNumber = 0;
  const analytics = new ConsentBufferingProductAnalytics(
    inner,
    'undecided',
    () => `capture-${captureNumber++}`,
  );

  for (let index = 0; index < 52; index += 1) {
    analytics.capture('notification_opened', { schema_version: 1 });
  }
  await analytics.optIn('first_launch_sheet');

  assert.equal(inner.captures.length, 51);
  assert.equal(inner.captures[1].options.timestamp, 'capture-2');
  assert.equal(inner.captures.at(-1).options.timestamp, 'capture-51');
});

test('decline drops the buffer without touching the provider', async () => {
  const inner = new RecordingProductAnalytics('undecided');
  const analytics = new ConsentBufferingProductAnalytics(inner, 'undecided');
  analytics.capture('notification_opened', { schema_version: 1 });

  await analytics.decline();

  assert.equal(inner.declineCount, 0);
  assert.deepEqual(inner.captures, []);
  await analytics.optIn('settings_privacy');
  assert.deepEqual(inner.names(), ['analytics_consent_granted']);
});

test('withdrawal clears buffered events and disables buffering until re-consent', async () => {
  const inner = new RecordingProductAnalytics('undecided');
  const analytics = new ConsentBufferingProductAnalytics(inner, 'undecided');
  analytics.capture('screen_viewed', {
    schema_version: 1,
    screen_name: 'onboarding',
  });

  await analytics.withdraw();
  analytics.capture('notification_opened', { schema_version: 1 });
  await analytics.optIn('settings_privacy');

  assert.equal(inner.withdrawCount, 1);
  assert.deepEqual(inner.names(), ['analytics_consent_granted']);
});
