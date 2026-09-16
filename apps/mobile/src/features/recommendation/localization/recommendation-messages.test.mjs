import assert from 'node:assert/strict';
import test from 'node:test';

import { archetypeLabel, recommendationMessages } from './recommendation-messages.ts';

// The identifier is locale-independent and unchanged; only the words follow the day the
// result is read on, so a weekend result generated before this rule, or one from a Worker
// that predates it, does not call a Tuesday a weekend.
test('weekend_relaxed reads as a plain relaxed day on a weekday', () => {
  assert.equal(
    archetypeLabel(recommendationMessages.en, 'weekend_relaxed', 'weekend'),
    'Weekend Relaxed',
  );
  assert.equal(
    archetypeLabel(recommendationMessages.en, 'weekend_relaxed', 'weekday'),
    'Relaxed',
  );
  assert.equal(
    archetypeLabel(recommendationMessages.tr, 'weekend_relaxed', 'weekend'),
    'Hafta Sonu',
  );
  assert.equal(
    archetypeLabel(recommendationMessages.tr, 'weekend_relaxed', 'weekday'),
    'Rahat Gün',
  );
});

test('every other archetype keeps one label on both kinds of day', () => {
  for (const messages of [recommendationMessages.en, recommendationMessages.tr]) {
    for (const archetypeId of Object.keys(messages.archetypes)) {
      if (archetypeId === 'weekend_relaxed') continue;
      assert.equal(
        archetypeLabel(messages, archetypeId, 'weekday'),
        messages.archetypes[archetypeId],
      );
      assert.equal(
        archetypeLabel(messages, archetypeId, 'weekend'),
        messages.archetypes[archetypeId],
      );
    }
  }
});
