import assert from 'node:assert/strict';
import test from 'node:test';

import { createWardrobeFormValues, fillWardrobeFormFromPhrase } from './wardrobe-form.ts';

const empty = createWardrobeFormValues();

test('a matched phrase sets the type, the palette colour with its family, and an empty name', () => {
  const fill = fillWardrobeFormFromPhrase(empty, '  lacivert keten gömlek ', 'mens', null);
  assert.equal(fill.kind, 'filled');
  assert.equal(fill.values.garmentTypeId, 'shirt');
  assert.deepEqual(fill.values.colorChoice, { kind: 'option', id: 'navy' });
  assert.equal(fill.values.colorFamily, 'blue');
  assert.equal(fill.values.name, 'lacivert keten gömlek');
  assert.equal(fill.colorFilled, true);
});

test('a match with no colour leaves the colour as it was', () => {
  const chosen = { ...empty, colorChoice: { kind: 'option', id: 'tomato_red' }, colorFamily: 'red' };
  const fill = fillWardrobeFormFromPhrase(chosen, 'polar', null, null);
  assert.equal(fill.kind, 'filled');
  assert.equal(fill.values.garmentTypeId, 'fleece');
  assert.deepEqual(fill.values.colorChoice, { kind: 'option', id: 'tomato_red' });
  assert.equal(fill.values.colorFamily, 'red');
  assert.equal(fill.colorFilled, false);
});

test('the name the person wrote is kept; only an empty or phrase-filled name takes the phrase', () => {
  const written = fillWardrobeFormFromPhrase({ ...empty, name: 'Weekend shirt' }, 'navy linen shirt', null, null);
  assert.equal(written.values.name, 'Weekend shirt');
  const blank = fillWardrobeFormFromPhrase({ ...empty, name: '   ' }, 'navy linen shirt', null, null);
  assert.equal(blank.values.name, 'navy linen shirt');
  // A second phrase replaces the name the first one filled, since the person never wrote it.
  const again = fillWardrobeFormFromPhrase(
    { ...empty, name: 'navy linen shirt' }, 'black leather jacket', null, 'navy linen shirt',
  );
  assert.equal(again.values.name, 'black leather jacket');
  assert.equal(again.values.garmentTypeId, 'leather_jacket');
});

test('a type the clothing preference does not offer is not understood, and nothing changes', () => {
  assert.deepEqual(
    fillWardrobeFormFromPhrase(empty, 'çiçekli elbise', 'mens', null),
    { kind: 'not-understood', reason: 'not-offered' },
  );
  assert.equal(fillWardrobeFormFromPhrase(empty, 'çiçekli elbise', 'womens', null).kind, 'filled');
  // With no preference resolved yet the picker lists the whole catalogue, and so does the phrase.
  assert.equal(fillWardrobeFormFromPhrase(empty, 'çiçekli elbise', null, null).kind, 'filled');
});

test('each reason the matcher gives is passed through unchanged', () => {
  for (const [phrase, reason] of [
    ['zzqx', 'unknown'],
    ['çanta', 'unsupported'],
    ['ceket', 'ambiguous'],
    ['kot pantolon ve beyaz gömlek', 'several-pieces'],
  ]) {
    assert.deepEqual(fillWardrobeFormFromPhrase(empty, phrase, null, null), { kind: 'not-understood', reason }, phrase);
  }
});

test('a blank phrase asks nothing', () => {
  assert.equal(fillWardrobeFormFromPhrase(empty, '   ', null, null), null);
});
