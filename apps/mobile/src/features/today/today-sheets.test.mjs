import assert from 'node:assert/strict';
import test from 'node:test';

import {
  askAgainSheetReducer,
  closedAskAgainSheet,
  closedDayQuestionSheet,
  dayQuestionSheetReducer,
} from './application/today-sheets.ts';

const run = (events, state = closedDayQuestionSheet) => events.reduce(dayQuestionSheetReducer, state);
const asked = (question) => ({ type: 'asked', question });
const stylesPicked = { type: 'stylesPicked', styles: ['classic'], dayType: 'smart' };

test('the day question opens on the question asked and draws it', () => {
  const sheet = run([asked('evening')]);
  assert.equal(sheet.open, 'evening');
  assert.deepEqual(sheet.drawn, { question: 'evening', stylesStep: null });
  assert.equal(sheet.error, false);
});

test('an answer that saves closes the sheet and clears the styles step, which stays drawn while it animates out', () => {
  const open = run([asked('morning'), stylesPicked, { type: 'answerSaving' }]);
  const sheet = dayQuestionSheetReducer(open, { type: 'answerSaved' });
  assert.equal(sheet.open, null);
  assert.equal(sheet.stylesStep, null);
  assert.deepEqual(sheet.drawn, { question: 'morning', stylesStep: open.stylesStep });
});

test('an answer that fails keeps the sheet open on the error, and the next attempt clears it', () => {
  const failed = run([asked('morning'), { type: 'answerSaving' }, { type: 'answerFailed' }]);
  assert.equal(failed.open, 'morning');
  assert.equal(failed.error, true);
  assert.equal(dayQuestionSheetReducer(failed, { type: 'answerSaving' }).error, false);
});

test('a dismissal closes at once without the earlier error, and keeps the drawn question', () => {
  const sheet = run([asked('evening'), { type: 'answerFailed' }, { type: 'dismissSaving' }]);
  assert.equal(sheet.open, null);
  assert.equal(sheet.error, false);
  assert.deepEqual(sheet.drawn, { question: 'evening', stylesStep: null });
});

test('a dismissal that saves clears the styles step only after it lands', () => {
  const closing = run([asked('morning'), stylesPicked, { type: 'dismissSaving' }]);
  assert.notEqual(closing.stylesStep, null);
  assert.equal(dayQuestionSheetReducer(closing, { type: 'dismissSaved' }).stylesStep, null);
});

test('a dismissal that fails reopens the same question on the error, on the step it was on', () => {
  const closing = run([asked('morning'), stylesPicked, { type: 'dismissSaving' }]);
  const sheet = dayQuestionSheetReducer(closing, { type: 'dismissFailed', question: 'morning' });
  assert.equal(sheet.open, 'morning');
  assert.equal(sheet.error, true);
  assert.deepEqual(sheet.drawn, { question: 'morning', stylesStep: closing.stylesStep });
});

test('the styles step starts on the day styles and the usual day type, then edits its draft and day type', () => {
  const sheet = run([
    asked('morning'),
    stylesPicked,
    { type: 'stylesDrafted', draft: ['classic', 'sporty'] },
    { type: 'stylesDayTypeChosen', dayType: 'formal' },
  ]);
  assert.deepEqual(sheet.stylesStep, { initial: ['classic'], draft: ['classic', 'sporty'], dayType: 'formal' });
  assert.equal(sheet.drawn.stylesStep, sheet.stylesStep);
});

test('a styles edit without a styles step changes nothing', () => {
  const open = run([asked('morning')]);
  assert.equal(dayQuestionSheetReducer(open, { type: 'stylesDrafted', draft: ['sporty'] }), open);
  assert.equal(dayQuestionSheetReducer(open, { type: 'stylesDayTypeChosen', dayType: 'formal' }), open);
});

test('a closed sheet keeps drawing its last question until another one opens', () => {
  const closed = run([asked('evening'), { type: 'answerSaved' }]);
  assert.deepEqual(closed.drawn, { question: 'evening', stylesStep: null });
  assert.deepEqual(dayQuestionSheetReducer(closed, asked('morning')).drawn, { question: 'morning', stylesStep: null });
});

test('the re-ask sheet opens on its clock without the error of an earlier opening', () => {
  const failed = askAgainSheetReducer(closedAskAgainSheet, { type: 'confirmFailed', at: 5 });
  const sheet = askAgainSheetReducer(askAgainSheetReducer(failed, { type: 'dismissed' }), { type: 'opened', at: 9 });
  assert.deepEqual(sheet, { openedAt: 9, busy: false, error: false, choosingWindow: null });
});

test('a confirmed re-ask closes the sheet and holds its choosing window until the regeneration settles', () => {
  const window = { start: '2026-08-13T12:00:00.000Z', end: '2026-08-13T17:00:00.000Z' };
  const saving = askAgainSheetReducer(
    askAgainSheetReducer(closedAskAgainSheet, { type: 'opened', at: 1 }),
    { type: 'confirmSaving' },
  );
  assert.equal(saving.busy, true);
  const saved = askAgainSheetReducer(saving, { type: 'confirmSaved', choosingWindow: window });
  assert.deepEqual(saved, { openedAt: null, busy: false, error: false, choosingWindow: window });
  assert.equal(askAgainSheetReducer(saved, { type: 'choosingSettled', choosingWindow: window }).choosingWindow, null);
});

test('a re-ask that settles after a newer one was confirmed leaves the newer choosing window', () => {
  const first = { start: '2026-08-13T12:00:00.000Z', end: '2026-08-13T17:00:00.000Z' };
  const second = { start: '2026-08-13T12:00:00.000Z', end: '2026-08-13T17:00:00.000Z' };
  const confirmed = (state, choosingWindow) =>
    askAgainSheetReducer(askAgainSheetReducer(state, { type: 'confirmSaving' }), { type: 'confirmSaved', choosingWindow });
  const both = confirmed(confirmed(closedAskAgainSheet, first), second);
  const afterFirst = askAgainSheetReducer(both, { type: 'choosingSettled', choosingWindow: first });
  assert.equal(afterFirst.choosingWindow, second);
  assert.equal(askAgainSheetReducer(afterFirst, { type: 'choosingSettled', choosingWindow: second }).choosingWindow, null);
});

test('a failed re-ask keeps the opening clock, or reopens a sheet closed meanwhile on the failure clock', () => {
  const open = askAgainSheetReducer(closedAskAgainSheet, { type: 'opened', at: 1 });
  const stillOpen = askAgainSheetReducer(askAgainSheetReducer(open, { type: 'confirmSaving' }), { type: 'confirmFailed', at: 7 });
  assert.deepEqual(stillOpen, { openedAt: 1, busy: false, error: true, choosingWindow: null });
  const closedMeanwhile = askAgainSheetReducer(askAgainSheetReducer(open, { type: 'dismissed' }), { type: 'confirmFailed', at: 7 });
  assert.equal(closedMeanwhile.openedAt, 7);
});
