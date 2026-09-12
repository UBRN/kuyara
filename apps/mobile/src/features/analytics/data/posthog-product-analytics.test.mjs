import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createPostHogProductAnalytics,
  sanitizePostHogEvent,
} from './posthog-product-analytics.ts';

class FakeClient {
  captures = [];
  operations = [];
  identifierGeneration = 1;
  deviceId = 'device-1';
  failures = new Set();

  constructor(identifier = 'identifier') {
    this.identifier = identifier;
  }

  fail(operation) {
    this.failures.add(operation);
  }

  throwIfFailed(operation) {
    if (this.failures.has(operation)) throw new Error(`${operation} failed`);
  }

  capture(name, properties, options) {
    this.operations.push(`capture:${name}`);
    this.throwIfFailed('capture');
    this.captures.push({ name, properties, options });
  }

  async flush() {
    this.operations.push('flush');
    this.throwIfFailed('flush');
  }

  getDistinctId() {
    return `${this.identifier}-${this.identifierGeneration}`;
  }

  getSessionId() {
    return 'session-1';
  }

  async optIn() {
    this.operations.push('optIn');
    this.throwIfFailed('optIn');
  }

  async optOut() {
    this.operations.push('optOut');
    this.throwIfFailed('optOut');
  }

  reset() {
    this.operations.push('reset');
    this.throwIfFailed('reset');
    this.identifierGeneration += 1;
  }

  setPersistedProperty(key, value) {
    this.operations.push(`persist:${key}:${value}`);
    this.throwIfFailed('persist');
    if (key === 'device_id') this.deviceId = value;
  }
}

const options = (consent) => ({
  apiKey: 'phc_test',
  host: 'https://eu.i.posthog.com',
  consent,
});

test('undecided and withdrawn profiles create no client until opt-in', async () => {
  for (const consent of ['undecided', 'withdrawn']) {
    const clients = [];
    const analytics = createPostHogProductAnalytics(options(consent), () => {
      const client = new FakeClient(`identifier-${clients.length + 1}`);
      clients.push(client);
      return client;
    });

    analytics.capture('notification_opened', { schema_version: 1 });
    await analytics.flush();

    assert.deepEqual(clients, []);
    assert.equal(analytics.getIdentifier(), null);
    assert.equal(analytics.getSessionId(), null);

    await analytics.optIn('today_sheet');
    assert.equal(clients.length, 1);
    assert.deepEqual(clients[0].operations, [
      'optIn',
      'capture:analytics_consent_granted',
    ]);
  }
});

test('a granted profile reconciles silently and exposes the provider identifier', async () => {
  const client = new FakeClient();
  let createCount = 0;
  const analytics = createPostHogProductAnalytics(options('granted'), () => {
    createCount += 1;
    return client;
  });
  await Promise.resolve();

  assert.equal(createCount, 1);
  assert.deepEqual(client.operations, ['optIn']);
  assert.deepEqual(client.captures, []);
  assert.equal(analytics.getIdentifier(), 'identifier-1');
  assert.equal(analytics.getSessionId(), 'session-1');
});

test('opt-in precedes the consent event and forwards an optional timestamp as a Date', async () => {
  const client = new FakeClient();
  const analytics = createPostHogProductAnalytics(options('undecided'), () => client);
  await analytics.optIn('today_sheet');
  analytics.capture(
    'notification_opened',
    { schema_version: 1 },
    { timestamp: '2026-09-09T12:00:00.000Z' },
  );

  assert.deepEqual(client.operations, [
    'optIn',
    'capture:analytics_consent_granted',
    'capture:notification_opened',
  ]);
  assert.deepEqual(client.captures[0], {
    name: 'analytics_consent_granted',
    properties: { schema_version: 1, surface: 'today_sheet' },
    options: undefined,
  });
  assert.equal(client.captures[1].options.timestamp.toISOString(), '2026-09-09T12:00:00.000Z');
});

test('withdrawal is the last event, clears the device id, and re-consent has a fresh identifier', async () => {
  const clients = [];
  const analytics = createPostHogProductAnalytics(options('granted'), () => {
    const client = new FakeClient(`identifier-${clients.length + 1}`);
    clients.push(client);
    return client;
  });
  await Promise.resolve();
  const client = clients[0];
  client.operations.length = 0;
  const firstIdentifier = analytics.getIdentifier();

  await analytics.withdraw();

  assert.deepEqual(client.operations, [
    'capture:analytics_consent_withdrawn',
    'optOut',
    'flush',
    'reset',
    'persist:device_id:null',
  ]);
  assert.equal(client.deviceId, null);
  assert.equal(analytics.getIdentifier(), null);

  await analytics.optIn('settings_privacy');
  assert.equal(clients.length, 2);
  assert.notEqual(analytics.getIdentifier(), firstIdentifier);
  assert.deepEqual(clients[1].captures.at(-1), {
    name: 'analytics_consent_granted',
    properties: { schema_version: 1, surface: 'settings_privacy' },
    options: undefined,
  });
});

test('withdrawal attempts every cleanup step and rejects after failures', async () => {
  const clients = [];
  const analytics = createPostHogProductAnalytics(options('granted'), () => {
    const client = new FakeClient(`identifier-${clients.length + 1}`);
    clients.push(client);
    return client;
  });
  await Promise.resolve();
  const client = clients[0];
  client.operations.length = 0;
  for (const operation of ['capture', 'optOut', 'flush', 'reset', 'persist']) {
    client.fail(operation);
  }

  await assert.rejects(() => analytics.withdraw(), /capture failed/);

  assert.deepEqual(client.operations, [
    'capture:analytics_consent_withdrawn',
    'optOut',
    'flush',
    'reset',
    'persist:device_id:null',
  ]);
  assert.equal(analytics.getIdentifier(), null);

  await analytics.optIn('settings_privacy');
  assert.equal(clients.length, 2);
});

test('the before-send filter removes lifecycle URLs and non-allowlisted properties', () => {
  const original = {
    event: 'Application Opened',
    properties: {
      url: 'kuyara://profile/private-path',
      previous_version: '1.0.0',
      schema_version: 1,
      '$lib': 'posthog-react-native',
      '$ip': '203.0.113.1',
      '$geoip_country_code': 'TR',
      '$geoip_disable': true,
      '$screen_name': 'private-screen',
      '$current_url': 'kuyara://private',
      '$referrer': 'private-referrer',
    },
  };

  assert.deepEqual(sanitizePostHogEvent(original), {
    event: 'Application Opened',
    properties: {
      schema_version: 1,
      '$lib': 'posthog-react-native',
      '$geoip_disable': true,
    },
  });
  assert.equal(original.properties.url, 'kuyara://profile/private-path');
});
