import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { FEEDBACK_FORM_ENABLED } from './application/feedback-form-flag.ts';

test('feedback collection remains switched off', () => {
  assert.equal(FEEDBACK_FORM_ENABLED, false);
});

test('the Settings row and direct route both respect the switch', () => {
  const settings = readFileSync(new URL('../profile/presentation/settings-screen.tsx', import.meta.url), 'utf8');
  const route = readFileSync(new URL('../../app/(tabs)/(profile)/settings/feedback.tsx', import.meta.url), 'utf8');
  assert.match(settings, /FEEDBACK_FORM_ENABLED && onOpenFeedback \? \(/);
  assert.match(route, /FEEDBACK_FORM_ENABLED \? <FeedbackRouteContent \/> : <Redirect href="\/settings" \/>/);
});
