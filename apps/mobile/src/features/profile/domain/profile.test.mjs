import assert from 'node:assert/strict';
import test from 'node:test';
import * as profile from './profile.ts';

test('birth dates validate calendar dates, static years and the moving future bound', () => {
  const today = new Date(2026, 8, 8);
  for (const date of [null, '1900-01-01', '2000-02-29', '2026-09-08']) {
    assert.equal(profile.isValidBirthDate(date, today), true, String(date));
  }
  for (const date of ['1899-12-31', '2101-01-01', '2026-09-09', '2027-01-01', '2001-02-29', '2000-02-30', '2000-13-01', '2000-1-01', '', 2000]) {
    assert.equal(profile.isValidBirthDate(date, today), false, String(date));
  }
});

test('optional names trim whitespace and accept only 2 to 30 characters', () => {
  assert.equal(profile.normalizeDisplayName(null), null);
  assert.equal(profile.normalizeDisplayName('  '), null);
  assert.equal(profile.normalizeDisplayName('  Utku  '), 'Utku');
  assert.equal(profile.normalizeDisplayName('a'.repeat(30)), 'a'.repeat(30));
  assert.equal(profile.displayNameIssue('A'), 'short');
  assert.equal(profile.displayNameIssue('a'.repeat(31)), 'long');
  assert.throws(() => profile.normalizeDisplayName('A'));
  assert.throws(() => profile.normalizeDisplayName('a'.repeat(31)));
});
