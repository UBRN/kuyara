import assert from 'node:assert/strict';
import test from 'node:test';
import { buildMessages } from './ai-prompt.ts';

test('prompt supplies the shared formality preference without personal facts', () => {
  for (const [dressStyle, order] of [
    ['casual', ['casual', 'smart', 'formal']],
    ['smart', ['smart', 'casual', 'formal']],
    ['formal', ['formal', 'smart', 'casual']],
    [undefined, ['smart', 'casual', 'formal']],
  ]) {
    const messages = buildMessages({ clothingPreference: 'womens', options: [], dressStyle,
      birthDate: '1960-01-01', birthYear: 1960, gender: 'woman' });
    assert.deepEqual(JSON.parse(messages[1].content), {
      clothingPreference: 'womens', options: [], formalityOrder: order,
    });
    for (const forbidden of ['dressStyle', ['age', 'Band'].join(''), 'birthDate', 'birthYear']) {
      assert.equal(messages[1].content.includes(forbidden), false);
    }
    assert.match(messages[0].content, /prefer/i);
  }
});
