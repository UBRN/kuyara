import assert from 'node:assert/strict';
import test from 'node:test';
import {
  accountDeleteV1ErrorCodes,
  accountDeleteV1ErrorSchema,
  accountDeleteV1Path,
  accountDeleteV1RequestSchema,
  accountDeleteV1SuccessSchema,
} from './account-delete-v1.ts';
import * as contracts from './index.ts';

test('the route path is versioned and exported through the package index', () => {
  assert.equal(accountDeleteV1Path, '/v1/account/delete');
  assert.equal(contracts.accountDeleteV1Path, accountDeleteV1Path);
});

test('request is strict, has one optional bounded code and never carries a token or user id', () => {
  assert.deepEqual(accountDeleteV1RequestSchema.parse({}), {});
  assert.deepEqual(
    accountDeleteV1RequestSchema.parse({ appleAuthorizationCode: 'c123.0.abcd' }),
    { appleAuthorizationCode: 'c123.0.abcd' },
  );
  for (const bad of [
    { appleAuthorizationCode: '' },
    { appleAuthorizationCode: 'x'.repeat(1025) },
    { appleAuthorizationCode: 7 },
    { accessToken: 'token' },
    { userId: 'user' },
    { appleAuthorizationCode: 'c123', extra: true },
  ]) {
    assert.equal(accountDeleteV1RequestSchema.safeParse(bad).success, false);
  }
});

test('success is tolerant and closed to two statuses', () => {
  for (const status of ['deleted', 'deleted_apple_unrevoked']) {
    const body = { data: { status } };
    assert.deepEqual(accountDeleteV1SuccessSchema.parse(body), body);
    assert.deepEqual(
      accountDeleteV1SuccessSchema.parse({ data: { status, userId: 'private' }, extra: 1 }),
      body,
    );
  }
  assert.equal(accountDeleteV1SuccessSchema.safeParse({ data: { status: 'pending' } }).success, false);
});

test('error codes are a closed list read through the named unknown branch', () => {
  assert.deepEqual(accountDeleteV1ErrorCodes, [
    'invalid_request', 'not_found', 'method_not_allowed', 'unauthorized',
    'rate_limited', 'unavailable', 'internal_error',
  ]);
  for (const code of accountDeleteV1ErrorCodes) {
    assert.deepEqual(accountDeleteV1ErrorSchema.parse({ error: { code } }), { error: { code } });
  }
  assert.deepEqual(
    accountDeleteV1ErrorSchema.parse({ error: { code: 'future_code', message: 'private' } }),
    { error: { code: 'unknown' } },
  );
  assert.equal(accountDeleteV1ErrorSchema.safeParse({ error: { code: 'Not A Code' } }).success, false);
  assert.equal(accountDeleteV1ErrorSchema.safeParse({ error: {} }).success, false);
});
