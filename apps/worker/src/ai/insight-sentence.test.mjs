import assert from 'node:assert/strict';
import test from 'node:test';

import { completeInsightSentenceSchema } from './insight-sentence.ts';

const accepts = (sentence) => completeInsightSentenceSchema.safeParse(sentence).success;

test('accepts a complete sentence of four or more words in either language', () => {
  for (const sentence of [
    'A clear day suits this outfit.',
    'The outfit suits the day.',
    'Rain in the air.',
    'Bu kıyafet güne uygun.',
    'Yağmura karşı su geçirmez ceketini al.',
    'Rüzgara karşı kat kat giyin!',
    'Is a light jacket enough for you?',
    'Grab a warm coat to throw on.',
    'Easy layers you can move in.',
    'Bu kombin serin bir akşam için.',
    'Kombinler tam istediğin gibi.',
  ]) {
    assert.equal(accepts(sentence), true, sentence);
  }
});

// Seen on Today on 6 October 2026: a subject and a verb, with nothing about the day or the
// outfits, from the Worker chain in Turkish.
test('rejects the two-word Turkish fragments seen on Today', () => {
  for (const sentence of [
    'Kadınlar giydiler.',
    'Kadınlar giyiniyorlar',
    'Kadınlar giyiniyor.',
  ]) {
    assert.equal(accepts(sentence), false, sentence);
  }
});

// The provider schema caps the string at 90 characters, so a model that runs long is cut
// mid-clause and the cut text has no closing mark.
test('rejects a sentence without a closing period, exclamation or question mark', () => {
  for (const sentence of [
    'Choose a light jacket over a knit, or a shirt with jeans and',
    'These outfits shield against cold, wind, and rain while keeping you warm and dry on a busy',
    'Hafif bir ceket ve rahat bir pantolon seç',
  ]) {
    assert.equal(accepts(sentence), false, sentence);
  }
});

test('rejects a sentence whose last word leaves the clause open, in either language', () => {
  for (const sentence of [
    'Choose a light jacket or a shirt with jeans and.',
    'A warm coat keeps you covered from the.',
    'Pick a scarf to go with your.',
    'Hafif bir ceket ve rahat bir pantolon ve.',
    'Yağmurlu bir gün için ceket ama.',
    'Bu ceket rüzgara karşı bir şemsiye ile.',
  ]) {
    assert.equal(accepts(sentence), false, sentence);
  }
});

test('still applies every rule of the shared schema', () => {
  for (const sentence of [
    'Two short sentences here. Another one.',
    'These looks range from轻 casual to smart.',
    'A light look for the whole day,.',
    ' A clear day suits this outfit.',
    `${'word '.repeat(18)}end.`,
  ]) {
    assert.equal(accepts(sentence), false, sentence);
  }
});
