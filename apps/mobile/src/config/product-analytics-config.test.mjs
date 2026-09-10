import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveProductAnalyticsConfiguration } from './product-analytics-config.ts';

const enabled = {
  apiKey: 'phc_publishable_key',
  host: 'https://analytics.example.com',
  isDevelopment: false,
};

test('a key and an https origin enable the provider', () => {
  assert.deepEqual(resolveProductAnalyticsConfiguration(enabled), {
    kind: 'enabled',
    apiKey: 'phc_publishable_key',
    host: 'https://analytics.example.com',
  });
});

test('a missing, blank, or hostless key leaves analytics disabled without throwing', () => {
  for (const options of [
    { isDevelopment: false },
    { ...enabled, apiKey: '   ' },
    { ...enabled, host: undefined },
    { ...enabled, host: '' },
  ]) {
    assert.deepEqual(resolveProductAnalyticsConfiguration(options), { kind: 'disabled' });
  }
});

test('a malformed host disables the provider instead of throwing', () => {
  for (const host of [
    'not a url',
    'ftp://analytics.example.com',
    'https://user:pass@analytics.example.com',
    'https://analytics.example.com/ingest',
    'https://analytics.example.com/?a=b',
    'https://analytics.example.com/#fragment',
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
