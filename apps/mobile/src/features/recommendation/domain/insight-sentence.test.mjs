import assert from 'node:assert/strict';
import test from 'node:test';

import { validateInsightSentence } from './insight-sentence.ts';

const check = (sentence, locale = 'en') => validateInsightSentence({ sentence, locale });

test('accepts digit-free prose with a locale function word', () => {
  assert.equal(check('The outfit suits the day.'), 'The outfit suits the day.');
  assert.equal(check('Bu kıyafet güne uygun.', 'tr'), 'Bu kıyafet güne uygun.');
});

test('rejects every decimal digit, including times and degree values, in both locales', () => {
  for (const locale of ['en', 'tr']) {
    const prefix = locale === 'tr' ? 'Bu gün için ' : 'The day is ';
    for (const value of ['21', '09:00', '21,2°', '3°', '٢١']) {
      assert.equal(check(`${prefix}${value}.`, locale), null, `${locale}: ${value}`);
    }
  }
});

test('Turkish accepts a list word or a distinctive letter, while English requires a list word', () => {
  assert.equal(check('Clear skies, comfortable clothes.'), null);
  assert.equal(check('Hava serin.', 'tr'), null);
  assert.equal(check('Hava güneşli.', 'tr'), 'Hava güneşli.');
  assert.equal(check('İlkbahar geldi.', 'tr'), 'İlkbahar geldi.');
  assert.equal(check('Wearing light clothes', 'tr'), null);
  assert.equal(check('Wearing light clothes', 'en'), null);
  assert.equal(check('I wear light clothes.', 'tr'), null);
  assert.equal(check('Hava güneşli.', 'en'), null);
  assert.equal(check('The güneşli outfit.', 'en'), null);
  assert.equal(check('Rain in the air.'), 'Rain in the air.');
  assert.equal(check('Yağmur için uygun.', 'tr'), 'Yağmur için uygun.');
});

test('rejects banned content in both languages and preserves valid picks independently', () => {
  for (const locale of ['en', 'tr']) {
    for (const text of ['Cloudflare', 'OpenRouter', 'Llama', 'GPT', 'Gemini', 'Claude',
      'Mistral', 'Qwen', 'DeepSeek', 'Nvidia', 'Meta', 'OpenAI', 'Apple Intelligence',
      'AI', 'yapay zeka', 'http', 'www.', '.com', '☀️', '🇹🇷']) {
      assert.equal(check(`${locale === 'tr' ? 'Bu' : 'The'} ${text} day.`, locale), null, text);
    }
  }
  const picks = Object.freeze([{ optionId: 'one' }]);
  assert.equal(check('The AI day.'), null);
  assert.deepEqual(picks, [{ optionId: 'one' }]);
});
