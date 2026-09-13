import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

import {
  createPostHogBeforeSend,
  resolvePostHogProviderOptions,
} from '../data/posthog-product-analytics.ts';

function exceptionEvent(line = 12) {
  return {
    event: '$exception',
    properties: {
      schema_version: 2,
      unapproved_custom: 'drop me',
      '$lib': 'posthog-react-native',
      '$ip': '203.0.113.1',
      '$geoip_country_code': 'TR',
      '$geoip_disable': true,
      '$screen_name': 'private-screen',
      '$current_url': 'kuyara://private',
      '$referrer': 'private-referrer',
      '$exception_level': 'error',
      '$exception_steps': [{ message: 'private breadcrumb' }],
      '$exception_issue_id': 'drop me',
      '$exception_list': [{
        type: 'TypeError',
        value: 'broken',
        mechanism: {
          handled: false,
          type: 'generic',
          synthetic: false,
          source: 'onerror',
          vars: { token: 'secret' },
          extra: 'drop me',
        },
        module: 'drop me',
        thread_id: 'drop me',
        stacktrace: {
          type: 'raw',
          frames: [{
            platform: 'javascript',
            filename: 'app.ts',
            function: 'run',
            module: 'app',
            lineno: line,
            colno: 4,
            abs_path: '/private/app.ts',
            context_line: 'secret()',
            pre_context: ['before'],
            post_context: ['after'],
            in_app: true,
            instruction_addr: '0x1',
            addr_mode: 'rel',
            vars: { token: 'secret' },
            chunk_id: 'chunk-1',
          }],
        },
      }],
    },
  };
}

test('resolved options enable only the approved exception capture paths', () => {
  const options = resolvePostHogProviderOptions('https://eu.i.posthog.com');

  assert.deepEqual(options.errorTracking, {
    autocapture: {
      uncaughtExceptions: true,
      unhandledRejections: true,
    },
    exceptionSteps: { enabled: false },
  });
  assert.equal(Object.hasOwn(options.errorTracking.autocapture, 'console'), false);
  assert.equal(Object.hasOwn(options.errorTracking.autocapture, 'nativeCrashes'), false);
  assert.equal(typeof options.before_send, 'function');
});

test('exception payloads keep only the explicit allowlist', () => {
  const { beforeSend } = createPostHogBeforeSend();

  assert.deepEqual(beforeSend(exceptionEvent()), {
    event: '$exception',
    properties: {
      schema_version: 2,
      '$lib': 'posthog-react-native',
      '$geoip_disable': true,
      '$exception_level': 'error',
      '$exception_list': [{
        type: 'TypeError',
        value: 'broken',
        mechanism: { handled: false, type: 'generic', synthetic: false },
        stacktrace: {
          frames: [{
            platform: 'javascript',
            filename: 'app.ts',
            function: 'run',
            module: 'app',
            lineno: 12,
            colno: 4,
            in_app: true,
            chunk_id: 'chunk-1',
          }],
        },
      }],
    },
  });
});

test('exception deduplication does not consume the five-event session cap', () => {
  const { beforeSend } = createPostHogBeforeSend();

  assert.notEqual(beforeSend(exceptionEvent(1)), null);
  assert.equal(beforeSend(exceptionEvent(1)), null);
  for (const line of [2, 3, 4, 5]) assert.notEqual(beforeSend(exceptionEvent(line)), null);
  assert.equal(beforeSend(exceptionEvent(6)), null);
});

test('exception fingerprints use the last in-app frame', () => {
  const { beforeSend } = createPostHogBeforeSend();
  const first = exceptionEvent();
  const second = exceptionEvent();
  const oldest = { filename: 'shared.ts', function: 'oldest', lineno: 1, in_app: true };
  first.properties.$exception_list[0].stacktrace.frames = [
    oldest,
    { filename: 'first.ts', function: 'top', lineno: 2, in_app: true },
  ];
  second.properties.$exception_list[0].stacktrace.frames = [
    oldest,
    { filename: 'second.ts', function: 'top', lineno: 3, in_app: true },
  ];

  assert.notEqual(beforeSend(first), null);
  assert.notEqual(beforeSend(second), null);
});

test('exception fingerprints fall back to the last frame when none is in-app', () => {
  const { beforeSend } = createPostHogBeforeSend();
  const first = exceptionEvent();
  const second = exceptionEvent();
  const oldest = { filename: 'shared.ts', function: 'oldest', lineno: 1, in_app: false };
  first.properties.$exception_list[0].stacktrace.frames = [
    oldest,
    { filename: 'first-library.ts', function: 'top', lineno: 2, in_app: false },
  ];
  second.properties.$exception_list[0].stacktrace.frames = [
    oldest,
    { filename: 'second-library.ts', function: 'top', lineno: 3, in_app: false },
  ];

  assert.notEqual(beforeSend(first), null);
  assert.notEqual(beforeSend(second), null);
});

test('PostHogCore sends captureException through before_send with an exception list', () => {
  const localRequire = createRequire(import.meta.url);
  const sdkRequire = createRequire(localRequire.resolve('posthog-react-native'));
  const { PostHogCore } = sdkRequire('@posthog/core');
  let seen;

  class TestPostHogCore extends PostHogCore {
    getLibraryId() {
      return 'test';
    }

    getLibraryVersion() {
      return '1';
    }

    getPersistedProperty() {
      return undefined;
    }

    setPersistedProperty() {}
  }

  const client = new TestPostHogCore('phc_test', {
    before_send: (event) => {
      seen = event;
      return null;
    },
    defaultOptIn: true,
    disableRemoteConfig: true,
    flushAt: 100,
    flushInterval: 0,
    preloadFeatureFlags: false,
  });

  client.captureException(new Error('x'));

  assert.equal(seen.event, '$exception');
  assert.equal(Array.isArray(seen.properties.$exception_list), true);
});
