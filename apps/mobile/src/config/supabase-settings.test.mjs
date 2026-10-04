import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveSupabaseSettings } from './supabase-settings.ts';

const key = `sb_publishable_${'fixture'}`;

test('an https project origin and a publishable key compose the account port', () => {
  assert.deepEqual(resolveSupabaseSettings(' https://project.supabase.co ', key),
    { url: 'https://project.supabase.co', publishableKey: key });
  assert.deepEqual(resolveSupabaseSettings('https://project.supabase.co/', key)?.url, 'https://project.supabase.co');
});

test('a missing or malformed value leaves accounts as they are today', () => {
  for (const [url, publishableKey] of [
    [undefined, key], ['https://project.supabase.co', undefined], ['', key], ['https://project.supabase.co', ''],
    ['http://project.supabase.co', key], ['https://project.supabase.co/rest/v1', key],
    ['https://user:pass@project.supabase.co', key], ['not a url', key],
    // The legacy anon JWT and, above all, a secret key are refused.
    ['https://project.supabase.co', 'eyJhbGciOiJIUzI1NiJ9.e30.c2ln'],
    ['https://project.supabase.co', 'sb_secret_AbC12'],
  ]) {
    assert.equal(resolveSupabaseSettings(url, publishableKey), null, `${url} ${publishableKey}`);
  }
});
