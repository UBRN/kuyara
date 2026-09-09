import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveProductAnalyticsConfiguration } from './product-analytics-config.ts';

const enabled = {
  apiKey: 'phc_publishable_key',
  host: 'https://eu.i.posthog.com',
  isDevelopment: false,
};

test('a key and an https origin enable the provider', () => {
  assert.deepEqual(resolveProductAnalyticsConfiguration(enabled), {
    kind: 'enabled',
    apiKey: 'phc_publishable_key',
    host: 'https://eu.i.posthog.com',
    privacyPolicyUrl: null,
  });
});

test('a missing, blank, or hostless key leaves analytics disabled without throwing', () => {
  for (const options of [
    { isDevelopment: false },
    { ...enabled, apiKey: '   ' },
    { ...enabled, host: undefined },
    { ...enabled, host: '' },
  ]) {
    assert.deepEqual(resolveProductAnalyticsConfiguration(options), {
      kind: 'disabled',
      privacyPolicyUrl: null,
    });
  }
});

test('a malformed host disables the provider instead of throwing', () => {
  for (const host of [
    'not a url',
    'ftp://eu.i.posthog.com',
    'https://user:pass@eu.i.posthog.com',
    'https://eu.i.posthog.com/ingest',
    'https://eu.i.posthog.com/?a=b',
    'https://eu.i.posthog.com/#fragment',
  ]) {
    assert.equal(
      resolveProductAnalyticsConfiguration({ ...enabled, host }).kind,
      'disabled',
    );
  }
});

test('plaintext is accepted only in development, and the origin is kept', () => {
  assert.equal(
    resolveProductAnalyticsConfiguration({
      ...enabled,
      host: 'http://127.0.0.1:8000',
      isDevelopment: true,
    }).host,
    'http://127.0.0.1:8000',
  );
  assert.equal(
    resolveProductAnalyticsConfiguration({ ...enabled, host: 'http://127.0.0.1:8000' }).kind,
    'disabled',
  );
});

test('the privacy policy url keeps its path, requires https, and survives a disabled provider', () => {
  assert.equal(
    resolveProductAnalyticsConfiguration({
      ...enabled,
      privacyPolicyUrl: 'https://kuyara.app/privacy',
    }).privacyPolicyUrl,
    'https://kuyara.app/privacy',
  );
  assert.deepEqual(
    resolveProductAnalyticsConfiguration({
      isDevelopment: false,
      privacyPolicyUrl: 'https://kuyara.app/privacy',
    }),
    { kind: 'disabled', privacyPolicyUrl: 'https://kuyara.app/privacy' },
  );
  for (const privacyPolicyUrl of ['http://kuyara.app/privacy', 'kuyara.app/privacy', '  ']) {
    assert.equal(
      resolveProductAnalyticsConfiguration({ ...enabled, privacyPolicyUrl }).privacyPolicyUrl,
      null,
    );
  }
});
