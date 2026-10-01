import assert from 'node:assert/strict';
import test from 'node:test';

import { messages } from './messages.ts';

// A temperature never wraps away from the word before it: only the space in front of the number
// is non-breaking, so a narrow line still breaks between the words of a label ("Feels like"),
// which would not fit one line at the largest standard text size if they were glued too.
test('weather lines keep every temperature on the line of its label', () => {
  for (const language of ['en', 'tr']) {
    const copy = messages[language];
    const lines = [
      copy.weather.feelsLike('6,8°'),
      copy.weather.range('9,2°', '10,8°'),
      copy.today.tomorrow.weather({ condition: 'Rain', minimum: '7,2°', maximum: '9,6°' }),
    ];
    for (const line of lines) {
      for (const segment of line.split(' · ')) {
        const number = segment.search(/\d/);
        if (number < 0) continue;
        const before = segment.slice(0, number).replace(/[-\u2212]$/, '');
        assert.ok(before === '' || before.endsWith('\u00a0'), `${language}: "${segment}" can break before its number`);
        assert.ok(!segment.slice(number).includes(' '), `${language}: "${segment}" can break inside its number`);
      }
    }
  }
});

test('the Closet badge wording keeps its last two words together', () => {
  assert.equal(messages.en.today.ownershipOnBoard.owned, 'In your\u00a0Closet');
  assert.ok(messages.en.today.ownershipOnBoard.similar.endsWith('your\u00a0Closet'));
  assert.equal(messages.en.weather.feelsLike('6.8°'), 'Feels like\u00a06.8°');
});
