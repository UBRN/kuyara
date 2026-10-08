import assert from 'node:assert/strict';
import test from 'node:test';

import { outfitRatingReasons, rateOutfit } from './outfit-rating.ts';

const like = { kind: 'verdict', verdict: 'like' };
const dislike = { kind: 'verdict', verdict: 'dislike' };
const reason = (value) => ({ kind: 'reason', reason: value });

test('a verdict is set, switched and cleared, and only setting it is reported', () => {
  assert.deepEqual(rateOutfit(null, like), { rating: { verdict: 'like' }, set: like });
  assert.deepEqual(rateOutfit({ verdict: 'like' }, dislike),
    { rating: { verdict: 'dislike', reason: null }, set: dislike });
  assert.deepEqual(rateOutfit({ verdict: 'dislike', reason: 'too-warm' }, like), { rating: { verdict: 'like' }, set: like });
  assert.deepEqual(rateOutfit({ verdict: 'like' }, like), { rating: null, set: null });
  assert.deepEqual(rateOutfit({ verdict: 'dislike', reason: 'not-my-style' }, dislike), { rating: null, set: null });
});

test('a reason is set, switched and cleared only beside a dislike', () => {
  const disliked = { verdict: 'dislike', reason: null };
  assert.deepEqual(rateOutfit(disliked, reason('too-warm')),
    { rating: { verdict: 'dislike', reason: 'too-warm' }, set: reason('too-warm') });
  assert.deepEqual(rateOutfit({ verdict: 'dislike', reason: 'too-warm' }, reason('not-for-today')),
    { rating: { verdict: 'dislike', reason: 'not-for-today' }, set: reason('not-for-today') });
  assert.deepEqual(rateOutfit({ verdict: 'dislike', reason: 'too-warm' }, reason('too-warm')),
    { rating: disliked, set: null });
  assert.deepEqual(rateOutfit(null, reason('too-light')), { rating: null, set: null });
  assert.deepEqual(rateOutfit({ verdict: 'like' }, reason('too-light')), { rating: { verdict: 'like' }, set: null });
});

test('four reasons are offered, in their order', () => {
  assert.deepEqual(outfitRatingReasons, ['too-warm', 'too-light', 'not-my-style', 'not-for-today']);
});
