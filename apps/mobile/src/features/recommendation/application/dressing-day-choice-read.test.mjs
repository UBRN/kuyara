import assert from 'node:assert/strict';
import test from 'node:test';

import {
  answeredChoice,
  currentDayChoiceRead,
  dayChoiceRead,
  failedDayChoiceRead,
  writtenDayChoice,
} from './dressing-day-choice-read.ts';

const formal = { id: 'choice-one', dayKey: '2026-09-24', formality: 'formal' };

test('a read finds the day\'s answer or finds none', () => {
  assert.deepEqual(dayChoiceRead('profile-one', '2026-09-24', formal),
    { profileId: 'profile-one', key: '2026-09-24', status: 'row', choice: formal });
  assert.deepEqual(dayChoiceRead('profile-one', '2026-09-24', null),
    { profileId: 'profile-one', key: '2026-09-24', status: 'none' });
});

test('a written answer is the day\'s row', () => {
  assert.deepEqual(writtenDayChoice('profile-one', '2026-09-24', formal),
    { profileId: 'profile-one', key: '2026-09-24', status: 'row', choice: formal });
});

test('a failed read keeps the answer an earlier read of the same day found, through later failures', () => {
  const found = dayChoiceRead('profile-one', '2026-09-24', formal);
  const failed = failedDayChoiceRead(found, 'profile-one', '2026-09-24');
  assert.deepEqual(failed,
    { profileId: 'profile-one', key: '2026-09-24', status: 'unknown', previousChoice: formal });
  assert.equal(answeredChoice(failedDayChoiceRead(failed, 'profile-one', '2026-09-24')), formal);
});

test('a failed read keeps nothing from another day, another profile, a day without an answer or no read', () => {
  const found = dayChoiceRead('profile-one', '2026-09-24', formal);
  assert.equal(failedDayChoiceRead(found, 'profile-one', '2026-09-24:evening').previousChoice, null);
  assert.equal(failedDayChoiceRead(found, 'profile-two', '2026-09-24').previousChoice, null);
  assert.equal(failedDayChoiceRead(dayChoiceRead('profile-one', '2026-09-24', null),
    'profile-one', '2026-09-24').previousChoice, null);
  assert.equal(failedDayChoiceRead(null, 'profile-one', '2026-09-24').previousChoice, null);
});

test('only the read of the rendered profile and day counts', () => {
  const found = dayChoiceRead('profile-one', '2026-09-24', formal);
  assert.equal(currentDayChoiceRead(found, 'profile-one', '2026-09-24'), found);
  assert.equal(currentDayChoiceRead(found, 'profile-one', '2026-09-24:evening'), null);
  assert.equal(currentDayChoiceRead(found, 'profile-two', '2026-09-24'), null);
  assert.equal(currentDayChoiceRead(null, 'profile-one', '2026-09-24'), null);
});

test('the day dresses for a found answer, a kept one, or none', () => {
  assert.equal(answeredChoice(dayChoiceRead('profile-one', '2026-09-24', formal)), formal);
  assert.equal(answeredChoice(dayChoiceRead('profile-one', '2026-09-24', null)), null);
  assert.equal(answeredChoice(null), null);
});
