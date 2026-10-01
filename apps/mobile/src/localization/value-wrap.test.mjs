import assert from 'node:assert/strict';
import test from 'node:test';

import { messages } from './messages.ts';

// A temperature never wraps away from its label: each "label value" pair is joined by
// non-breaking spaces, so a narrow line breaks only at a " · " separator.
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
        if (/\d/.test(segment)) assert.ok(!segment.includes(' '), `${language}: "${segment}" can break`);
      }
    }
  }
});
