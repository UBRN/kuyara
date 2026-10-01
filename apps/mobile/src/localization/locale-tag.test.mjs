import assert from 'node:assert/strict';
import test from 'node:test';

import { localeTag } from './locale-tag.ts';

test('the locale tag maps the two supported languages and nothing else', () => {
  assert.equal(localeTag('en'), 'en-GB');
  assert.equal(localeTag('tr'), 'tr-TR');
});
