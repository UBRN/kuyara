import assert from 'node:assert/strict';
import test from 'node:test';
import { buildMessages } from './ai-prompt.ts';

test('prompt supplies the shared band preference without personal facts', () => {
  for (const [ageBand, order] of [
    ['young', ['casual', 'smart', 'formal']],
    ['adult', ['smart', 'casual', 'formal']],
    ['older', ['smart', 'formal', 'casual']],
    [undefined, ['smart', 'casual', 'formal']],
  ]) {
    const messages = buildMessages({ clothingPreference: 'womens', options: [], ageBand,
      birthDate: '1960-01-01', birthYear: 1960, gender: 'woman' });
    assert.deepEqual(JSON.parse(messages[1].content), {
      clothingPreference: 'womens', options: [], formalityOrder: order,
    });
    assert.match(messages[0].content, /prefer/i);
  }
});
