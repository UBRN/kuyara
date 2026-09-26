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
  optedOut = false;
  queue = [];
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
    this.queue.push(name);
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
    this.optedOut = false;
  }

  async optOut() {
    this.operations.push('optOut');
    this.throwIfFailed('optOut');
    this.optedOut = true;
  }

  async ready() { this.throwIfFailed('ready'); }

  async persistAndVerifyCleanup() {
    this.throwIfFailed('durable');
    if (!this.optedOut || this.deviceId !== null || this.queue.length !== 0) {
      throw new Error('cleanup not durable');
    }
  }

  reset(propertiesToKeep) {
    this.operations.push(`reset:${(propertiesToKeep ?? []).join(',')}`);
    this.throwIfFailed('reset');
    this.identifierGeneration += 1;
  }

  setPersistedProperty(key, value) {
    this.operations.push(`persist:${key}:${value}`);
    this.throwIfFailed('persist');
    if (key === 'device_id') this.deviceId = value;
    if (key === 'queue') this.queue = value ?? [];
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

    analytics.capture('notification_opened', { schema_version: 3 });
    await analytics.flush();

    assert.deepEqual(clients, []);
    assert.equal(analytics.getIdentifier(), null);
    assert.equal(analytics.getSessionId(), null);

    await analytics.whenReady();
    if (consent === 'withdrawn') await analytics.prepareGrant();
    await analytics.optIn('today_sheet');
    assert.equal(clients.length, 1);
    assert.deepEqual(clients[0].operations.slice(-2), [
      'optIn', 'capture:analytics_consent_granted',
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
  await analytics.whenReady();

  assert.equal(createCount, 1);
  assert.deepEqual(client.operations, ['optIn']);
  assert.deepEqual(client.captures, []);
  assert.equal(analytics.getIdentifier(), 'identifier-1');
  assert.equal(analytics.getSessionId(), 'session-1');
});

test('failed granted startup reconciliation stays unapplied and blocks later autocapture', async () => {
  const client = new FakeClient();
  client.fail('ready');
  let beforeSend;
  const analytics = createPostHogProductAnalytics(options('granted'), (hook) => {
    beforeSend = hook;
    return client;
  });
  await analytics.whenReady();

  assert.equal(analytics.isApplied(), false);
  assert.equal(analytics.getIdentifier(), null);
  assert.equal(beforeSend({ event: 'Application Opened', properties: {} }), null);
});

test('opt-in precedes the consent event and forwards an optional timestamp as a Date', async () => {
  const client = new FakeClient();
  const analytics = createPostHogProductAnalytics(options('undecided'), () => client);
  await analytics.optIn('today_sheet');
  analytics.capture(
    'notification_opened',
    { schema_version: 3 },
    { timestamp: '2026-09-09T12:00:00.000Z' },
  );

  assert.deepEqual(client.operations, [
    'optIn',
    'capture:analytics_consent_granted',
    'capture:notification_opened',
  ]);
  assert.deepEqual(client.captures[0], {
    name: 'analytics_consent_granted',
    properties: { schema_version: 3, surface: 'today_sheet' },
    options: undefined,
  });
  assert.equal(client.captures[1].options.timestamp.toISOString(), '2026-09-09T12:00:00.000Z');
});

test('final withdrawal event keeps concurrent and later feature and SDK captures closed', async () => {
  const client = new FakeClient();
  let beforeSend;
  let releaseFlush;
  client.flush = () => new Promise((resolve) => { releaseFlush = resolve; });
  const analytics = createPostHogProductAnalytics(options('granted'), (hook) => {
    beforeSend = hook;
    return client;
  });
  await analytics.whenReady();

  analytics.capture('analytics_consent_withdrawn', { schema_version: 3 });
  const flushing = analytics.flush();
  analytics.capture('notification_opened', { schema_version: 3 });
  analytics.capture('analytics_consent_withdrawn', { schema_version: 3 });
  assert.equal(beforeSend({ event: 'Application Opened', properties: {} }), null);
  assert.deepEqual(client.captures.map(({ name }) => name), ['analytics_consent_withdrawn']);

  releaseFlush();
  await flushing;
  analytics.capture('notification_opened', { schema_version: 3 });
  assert.equal(analytics.isWithdrawalInProgress(), true);
  assert.equal(beforeSend({ event: 'Application Opened', properties: {} }), null);
  assert.deepEqual(client.captures.map(({ name }) => name), ['analytics_consent_withdrawn']);
});

test('stored withdrawal sends no further event, clears the device id, and re-consent has a fresh identifier', async () => {
  const clients = [];
  const beforeSendHooks = [];
  const analytics = createPostHogProductAnalytics(options('granted'), (beforeSend) => {
    beforeSendHooks.push(beforeSend);
    const client = new FakeClient(`identifier-${clients.length + 1}`);
    clients.push(client);
    return client;
  });
  await analytics.whenReady();
  const client = clients[0];
  client.operations.length = 0;
  const firstIdentifier = analytics.getIdentifier();

  await analytics.withdraw();

  assert.deepEqual(client.operations, [
    'optOut',
    'persist:queue:null',
    'persist:ai_queue:null',
    'persist:ai_capture_queue:null',
    'persist:logs_queue:null',
    'reset:opted_out',
    'persist:device_id:null',
  ]);
  assert.equal(client.deviceId, null);
  assert.equal(analytics.getIdentifier(), null);
  assert.equal(beforeSendHooks[0]({ event: '$exception', properties: {} }), null);
  assert.equal(beforeSendHooks[0]({ event: 'Application Opened', properties: {} }), null);

  await analytics.prepareGrant();
  await analytics.optIn('settings_privacy');
  assert.equal(clients.length, 2);
  assert.equal(beforeSendHooks.length, 2);
  assert.equal(beforeSendHooks[0]({ event: '$exception', properties: {} }), null);
  assert.notEqual(beforeSendHooks[1]({ event: '$exception', properties: {} }), null);
  assert.notEqual(beforeSendHooks[1]({ event: 'Application Opened', properties: {} }), null);
  assert.notEqual(analytics.getIdentifier(), firstIdentifier);
  assert.deepEqual(clients[1].captures.at(-1), {
    name: 'analytics_consent_granted',
    properties: { schema_version: 3, surface: 'settings_privacy' },
    options: undefined,
  });
});

test('withdrawal rejects on failed opt-out and a later clean attempt can recover', async () => {
  const clients = [];
  const analytics = createPostHogProductAnalytics(options('granted'), () => {
    const client = new FakeClient(`identifier-${clients.length + 1}`);
    clients.push(client);
    return client;
  });
  await analytics.whenReady();
  const client = clients[0];
  client.operations.length = 0;
  for (const operation of ['capture', 'optOut', 'flush', 'reset', 'persist']) {
    client.fail(operation);
  }

  await assert.rejects(() => analytics.withdraw(), /optOut failed/);

  assert.deepEqual(client.operations, ['optOut']);
  assert.equal(analytics.getIdentifier(), null);

  client.failures.clear();
  client.fail('persist');
  await assert.rejects(() => analytics.prepareGrant(), /persist failed/);
  assert.equal(clients.length, 1);
  client.failures.clear();
  await analytics.prepareGrant();
  await analytics.optIn('settings_privacy');
  assert.equal(clients.length, 2);
});

test('failed cleanup across restart blocks re-grant until old queue and identity are cleared while opted out', async () => {
  const clients = [];
  const client = new FakeClient('old-identifier');
  client.queue = ['old-queued-event'];
  client.fail('persist');
  const analytics = createPostHogProductAnalytics(options('withdrawn'), (_hook, defaultOptIn) => {
    clients.push({ defaultOptIn });
    return clients.length === 1 ? client : new FakeClient('new-identifier');
  });

  await assert.rejects(() => analytics.prepareGrant(), /persist failed/);
  assert.deepEqual(clients, [{ defaultOptIn: false }]);
  assert.deepEqual(client.queue, ['old-queued-event']);
  assert.equal(analytics.getIdentifier(), null);

  client.failures.clear();
  client.fail('durable');
  await assert.rejects(() => analytics.prepareGrant(), /durable failed/);
  assert.equal(analytics.getIdentifier(), null);
  client.failures.clear();
  await analytics.prepareGrant();
  assert.deepEqual(client.queue, []);
  assert.equal(client.deviceId, null);
  assert.equal(client.operations.includes('flush'), false);
  assert.equal(client.operations.some((operation) => operation.startsWith('capture:')), false);

  await analytics.optIn('settings_privacy');
  assert.deepEqual(clients, [{ defaultOptIn: false }, { defaultOptIn: false }]);
  assert.notEqual(analytics.getIdentifier(), 'old-identifier-1');
  assert.deepEqual(client.captures.map(({ name }) => name), []);
});

test('withdrawal never flushes queued events and completes durable local opt-out', async () => {
  const client = new FakeClient();
  const analytics = createPostHogProductAnalytics(options('granted'), () => client);
  await analytics.whenReady();
  client.fail('flush');

  await analytics.withdraw();

  assert.equal(analytics.isApplied(), false);
  assert.equal(client.optedOut, true);
  assert.deepEqual(client.queue, []);
  assert.equal(client.deviceId, null);
  assert.equal(client.operations.includes('flush'), false);
});

test('the before-send filter removes lifecycle URLs and non-allowlisted properties', () => {
  const original = {
    event: 'Application Opened',
    properties: {
      url: 'kuyara://profile/private-path',
      displayName: 'Utku',
      profileNote: 'private profile note',
      previous_version: '1.0.0',
      schema_version: 3,
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
      schema_version: 3,
      '$lib': 'posthog-react-native',
      '$geoip_disable': true,
    },
  });
  assert.equal(original.properties.url, 'kuyara://profile/private-path');
});
