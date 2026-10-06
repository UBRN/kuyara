import assert from 'node:assert/strict';
import test from 'node:test';

import { supabaseBaseUrl } from './supabase-base-url.ts';

test('the project address is parsed once to its https origin', () => {
  assert.equal(supabaseBaseUrl('https://project.supabase.co'), 'https://project.supabase.co');
  assert.equal(supabaseBaseUrl('https://project.supabase.co/'), 'https://project.supabase.co');
  assert.equal(supabaseBaseUrl('https://Project.supabase.co//'), 'https://project.supabase.co');
});

test('a missing, non-https or unreadable address is no address', () => {
  for (const value of [undefined, '', 'http://project.supabase.co', 'not a url', 'ftp://project.supabase.co']) {
    assert.equal(supabaseBaseUrl(value), undefined, String(value));
  }
});
