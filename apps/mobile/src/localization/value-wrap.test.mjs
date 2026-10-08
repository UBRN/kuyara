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
    ];
    for (const line of lines) {
      // A separator is tied to the part after it, so a wrapped line never ends on a "·".
      assert.ok(!line.includes('· '), `${language}: "${line}" can leave a separator at a line end`);
      for (const segment of line.split(' ·\u00a0')) {
        const number = segment.search(/\d/);
        if (number < 0) continue;
        const before = segment.slice(0, number).replace(/[-\u2212]$/, '');
        assert.ok(before === '' || before.endsWith('\u00a0'), `${language}: "${segment}" can break before its number`);
        assert.ok(!segment.slice(number).includes(' '), `${language}: "${segment}" can break inside its number`);
      }
    }
  }
});

// Tomorrow's strip line is the condition, then the range: it may break only after the
// condition's comma, never inside the range, and it has no separator left to dangle.
test('the tomorrow line keeps its whole range on one line in both languages', () => {
  const expected = {
    en: 'Rain, 7.2°\u00a0to\u00a09.6°',
    tr: 'Yağmurlu, 7,2°\u00a0ile\u00a09,6°\u00a0arası',
  };
  for (const language of ['en', 'tr']) {
    const copy = messages[language].today.tomorrow;
    const condition = language === 'en' ? 'Rain' : 'Yağmurlu';
    const minimum = language === 'en' ? '7.2°' : '7,2°';
    const maximum = language === 'en' ? '9.6°' : '9,6°';
    const line = copy.weather({ condition, minimum, maximum });
    assert.equal(line, expected[language]);
    assert.ok(!line.includes('·'), `${language}: "${line}" still carries a separator`);
    assert.ok(!line.slice(line.search(/\d/)).includes(' '), `${language}: "${line}" can break inside its range`);
    assert.equal(copy.range({ minimum, maximum }), line.slice(line.search(/\d/)));
  }
});

test('the Closet badge wording keeps its last two words together', () => {
  assert.equal(messages.en.today.ownershipOnBoard.owned, 'In your\u00a0Closet');
  assert.ok(messages.en.today.ownershipOnBoard.similar.endsWith('your\u00a0Closet'));
  assert.equal(messages.en.weather.feelsLike('6.8°'), 'Feels like\u00a06.8°');
});

// Turkish takes the same glue where its wording ends on a short word: "var" never stands
// alone on the badge's second line. A two-word phrase of long words keeps its one break.
test('the Turkish Closet badge glues its short last word', () => {
  assert.equal(messages.tr.today.ownershipOnBoard.owned, 'Gardırobunda\u00a0var');
  assert.equal(messages.tr.today.ownershipOnBoard.similar, 'Benzeri Gardırobunda');
  assert.equal(messages.tr.weather.feelsLike('6,8°'), 'Hissedilen\u00a06,8°');
});
