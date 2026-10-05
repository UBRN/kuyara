import assert from 'node:assert/strict';
import test from 'node:test';

import { WARDROBE_NAME_MAX_LENGTH, shortenWardrobeName } from './wardrobe-name.ts';

const limit = WARDROBE_NAME_MAX_LENGTH;
const filler = (count) => 'a'.repeat(count);
const acute = '\u{301}';
const flag = '\u{1f1f9}\u{1f1f7}';

test('the Closet name limit is 200 UTF-16 units', () => {
  assert.equal(limit, 200);
});

test('a name at or under the limit comes back as it is', () => {
  for (const name of ['', 'Rain coat', filler(limit), `${filler(limit - 2)}😀`, `${filler(limit - 2)}e${acute}`, ` ${filler(limit - 1)}`]) {
    assert.equal(shortenWardrobeName(name), name);
  }
});

test('a longer name is cut to the limit and loses its trailing whitespace', () => {
  assert.equal(shortenWardrobeName(filler(500)), filler(limit));
  assert.equal(shortenWardrobeName(`${filler(195)}${' '.repeat(10)}${filler(50)}`), filler(195));
  assert.equal(shortenWardrobeName(`${filler(195)} \t\n \t\n ${filler(50)}`), filler(195));
});

// Each cluster is placed so the limit falls inside it at every possible unit: the whole of it goes.
const clusters = {
  'a surrogate pair': '😀',
  'a heart with a variation selector': '\u{2764}\u{fe0f}',
  'a letter with a combining mark': `e${acute}`,
  'a ZWJ emoji sequence': '👨‍👩‍👧',
  'a skin tone': '👍🏽',
  'a keycap': '1\u{fe0f}\u{20e3}',
  'a regional indicator flag': flag,
  'a subdivision flag with tag characters': '🏴\u{e0067}\u{e0062}\u{e0065}\u{e006e}\u{e0067}\u{e007f}',
  'a Hangul syllable of jamo': '\u{1112}\u{1161}\u{11ab}',
};

for (const [label, cluster] of Object.entries(clusters)) {
  test(`a cut inside ${label} drops the whole of it`, () => {
    for (let inside = 1; inside < cluster.length; inside += 1) {
      const prefix = filler(limit - inside);
      assert.equal(shortenWardrobeName(`${prefix}${cluster}${filler(40)}`), prefix, `${inside} units in`);
    }
  });

  test(`${label} that ends exactly at the limit stays whole`, () => {
    const prefix = filler(limit - cluster.length);
    assert.equal(shortenWardrobeName(`${prefix}${cluster}${filler(40)}`), `${prefix}${cluster}`);
  });
}

test('with flags in a row the cut falls between two flags, never inside one', () => {
  // The limit falls exactly between the first and second flag: the first stays.
  assert.equal(shortenWardrobeName(`${filler(limit - 4)}${flag}${flag}${filler(30)}`), `${filler(limit - 4)}${flag}`);
  // The limit falls inside the second flag: only the first stays.
  assert.equal(shortenWardrobeName(`${filler(limit - 6)}${flag}${flag}${flag}${filler(30)}`), `${filler(limit - 6)}${flag}`);
  // The limit falls inside the first flag: none of it stays.
  assert.equal(shortenWardrobeName(`${filler(limit - 3)}${flag}${flag}${filler(30)}`), filler(limit - 3));
});

test('a cluster longer than the limit by itself is cut at a whole character, not emptied', () => {
  const name = `e${acute.repeat(300)}`;
  const shortened = shortenWardrobeName(name);
  assert.equal(shortened.length, limit);
  assert.ok(name.startsWith(shortened));
  assert.equal(shortenWardrobeName('😀'.repeat(300)), '😀'.repeat(limit / 2));
  assert.ok(shortenWardrobeName(`${acute}${'😀'.repeat(300)}`).isWellFormed());
});

test('a name that starts with whitespace and is then too long is not emptied', () => {
  assert.equal(shortenWardrobeName(` ${filler(300)}`).length, limit);
});

test('the shortened name is at most 200 units and 600 UTF-8 bytes, inside the account bound, for the widest characters', () => {
  const bytes = (text) => new TextEncoder().encode(text).length;
  const widest = shortenWardrobeName('€'.repeat(500));
  assert.equal(widest.length, limit);
  assert.equal(bytes(widest), 600);
  for (const unit of ['€', '😀', '\u{800}', '\u{ffee}', 'a', 'é']) {
    const shortened = shortenWardrobeName(unit.repeat(900));
    assert.ok(shortened.length <= limit);
    assert.ok(bytes(shortened) <= 3 * limit, unit);
  }
});

// The engine's own grapheme segmentation (Node has Intl.Segmenter; the app does not rely on it)
// is the oracle: the cut is always at one of its boundaries, over many random mixes.
test('over random mixes of tricky pieces a cut never lands inside a cluster', () => {
  const pieces = ['a', 'b', ' ', 'é', `e${acute}`, '😀', '👨‍👩‍👧', '👍🏽', flag, '🇺🇸', '\u{2764}\u{fe0f}', '1\u{fe0f}\u{20e3}',
    '\u{1112}\u{1161}\u{11ab}', '日本', 'ç', '\u{200d}'];
  const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
  let seed = 7;
  const next = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed; };
  for (let run = 0; run < 3000; run += 1) {
    const length = 100 + (next() % 200);
    let name = '';
    while (name.length < length) name += pieces[next() % pieces.length];
    const shortened = shortenWardrobeName(name);
    assert.ok(shortened.length <= limit);
    assert.ok(name.startsWith(shortened));
    assert.ok(shortened.isWellFormed());
    if (name.length <= limit) { assert.equal(shortened, name); continue; }
    assert.ok(shortened.length > 0);
    const boundaries = new Set([...segmenter.segment(name)].map(({ index }) => index).concat(name.length));
    assert.ok(boundaries.has(shortened.length), JSON.stringify(name));
  }
});
