import assert from 'node:assert/strict';
import test from 'node:test';
import * as profile from './profile.ts';

test('age band derives from the local year with exact 30 and 60 boundaries', () => {
  const today = new Date(2026, 8, 8);
  for (const [date, band] of [[null, 'adult'], ['1997-12-31', 'young'], ['1996-12-31', 'adult'], ['1967-01-01', 'adult'], ['1966-12-31', 'older']]) {
    assert.equal(profile.deriveAgeBand(date, today), band);
  }
  assert.equal(profile.deriveAgeBand('1997-12-31', new Date(2027, 0, 1)), 'adult');
});

test('birth dates validate calendar dates, static years and the moving future bound', () => {
  const today = new Date(2026, 8, 8);
  for (const date of [null, '1900-01-01', '2000-02-29', '2026-09-08']) {
    assert.equal(profile.isValidBirthDate(date, today), true, String(date));
  }
  for (const date of ['1899-12-31', '2101-01-01', '2026-09-09', '2027-01-01', '2001-02-29', '2000-02-30', '2000-13-01', '2000-1-01', '', 2000]) {
    assert.equal(profile.isValidBirthDate(date, today), false, String(date));
  }
});
