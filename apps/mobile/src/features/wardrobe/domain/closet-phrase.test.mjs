import assert from 'node:assert/strict';
import test from 'node:test';

import { listSelectableGarmentTypes } from '@/features/catalog/domain/garment-catalog';
import { catalogMessages } from '@/features/catalog/localization/catalog-messages';

import { colorChoiceFamily, isClosetColorOptionId } from './closet-color-options.ts';
import { matchClosetPhrase } from './closet-phrase.ts';

// Labelled by hand. `types`: the acceptable catalog garment types, 'unsupported' when the
// catalog has no such piece (then "not understood" is right). `families`: the acceptable colour
// families, null when the phrase names no colour (then no colour is right). `kind`: the case.
const labelled = [
  ['lacivert keten gömlek', ['shirt'], ['blue'], 'plain'],
  ['navy linen shirt', ['shirt'], ['blue'], 'plain'],
  ['siyah deri ceket', ['leather_jacket'], ['black'], 'plain'],
  ['black leather jacket', ['leather_jacket'], ['black'], 'plain'],
  ['beyaz spor ayakkabı', ['sneakers'], ['white'], 'plain'],
  ['white trainers', ['sneakers'], ['white'], 'slang'],
  ['açık mavi kot', ['jeans'], ['blue'], 'slang'],
  ['light wash jeans', ['jeans'], ['blue'], 'plain'],
  ['bordo kazak', ['sweater'], ['red'], 'plain'],
  ['burgundy jumper', ['sweater'], ['red'], 'slang'],
  ['gri hoodie', ['hoodie'], ['gray'], 'plain'],
  ['grey hoody', ['hoodie'], ['gray'], 'typo'],
  ['haki parka', ['parka'], ['green'], 'plain'],
  ['olive puffer jacket', ['insulated_jacket'], ['green'], 'slang'],
  ['şişme mont siyah', ['insulated_jacket'], ['black'], 'slang'],
  ['kırmızı ekose atkı', ['scarf'], ['red'], 'plain'],
  ['red plaid scarf', ['scarf'], ['red'], 'plain'],
  ['mavi beyaz çizgili tişört', ['t_shirt'], ['white', 'blue'], 'plain'],
  ['breton stripe tee', ['t_shirt'], ['white', 'blue'], 'slang'],
  ["Levi's 501", ['jeans'], null, 'brand'],
  ['Converse All Star beyaz', ['sneakers'], ['white'], 'brand'],
  ['Nike tech fleece eşofman altı', ['track_pants'], null, 'brand'],
  ['Barbour waxed jacket', ['light_jacket', 'rain_jacket'], null, 'brand'],
  ['Dr. Martens', ['ankle_boots'], null, 'brand'],
  ['Uniqlo ultra light down', ['insulated_jacket', 'puffer_vest'], null, 'brand'],
  ['çanta', ['unsupported'], null, 'unsupported'],
  ['leather handbag', ['unsupported'], ['brown', 'black'], 'unsupported'],
  ['kemer', ['unsupported'], null, 'unsupported'],
  ['güneş gözlüğü', ['unsupported'], null, 'unsupported'],
  ['kol saati', ['unsupported'], null, 'unsupported'],
  ['bikini', ['unsupported'], null, 'unsupported'],
  ['pijama', ['unsupported'], null, 'unsupported'],
  ['kravat', ['unsupported'], null, 'unsupported'],
  ['terlik', ['unsupported', 'sandals'], null, 'unsupported'],
  ['socks', ['unsupported'], null, 'unsupported'],
  ['lacivert takım elbise', ['blazer', 'trousers', 'unsupported'], ['blue'], 'multi'],
  ['kot pantolon ve beyaz gömlek', ['jeans', 'shirt'], ['white', 'blue'], 'multi'],
  ['beanie and gloves', ['beanie', 'gloves'], null, 'multi'],
  ['kot ceket', ['light_jacket'], ['blue'], 'plain'],
  ['denim jacket', ['light_jacket'], ['blue'], 'plain'],
  ['bej trençkot', ['trench_coat'], ['beige'], 'plain'],
  ['camel coat', ['coat'], ['brown'], 'plain'],
  ['deve tüyü kaban', ['coat'], ['brown'], 'plain'],
  ['swetshirt gri', ['sweatshirt'], ['gray'], 'typo'],
  ['tisort beyz', ['t_shirt'], ['white'], 'typo'],
  ['blck jens', ['jeans'], ['black'], 'typo'],
  ['eşofman altı', ['track_pants'], null, 'plain'],
  ['sarı yağmurluk', ['rain_jacket'], ['yellow'], 'plain'],
  ['wellies', ['rain_boots'], null, 'slang'],
  ['brown chelsea boots', ['ankle_boots'], ['brown'], 'slang'],
  ['siyah babet', ['ballet_flats'], ['black'], 'plain'],
  ['kahverengi mokasen', ['loafers'], ['brown'], 'slang'],
  ['siyah balıkçı yaka kazak', ['turtleneck'], ['black'], 'plain'],
  ['yeşil polo yaka tişört', ['polo_shirt'], ['green'], 'plain'],
  ['çiçekli elbise', ['dress'], ['pink'], 'plain'],
  ['floral midi dress', ['dress'], ['pink'], 'plain'],
  ['maxi etek', ['long_skirt'], null, 'slang'],
  ['pink mini skirt', ['skirt'], ['pink'], 'plain'],
  ['lacivert yelek', ['puffer_vest', 'unsupported'], ['blue'], 'ambiguous'],
  ['bej hırka', ['cardigan'], ['beige'], 'plain'],
  ['polar', ['fleece'], null, 'plain'],
  ['mont', ['insulated_jacket', 'parka', 'light_jacket'], null, 'ambiguous'],
  ['shacket', ['overshirt'], null, 'slang'],
  ['crewneck sweatshirt', ['sweatshirt'], null, 'plain'],
  ['tayt', ['leggings'], null, 'plain'],
  ['kot şort', ['shorts'], ['blue'], 'plain'],
  ['kar botu', ['weather_boots'], null, 'plain'],
  ['lastik çizme', ['rain_boots'], null, 'slang'],
  ['şapka', ['brimmed_hat', 'cap'], null, 'ambiguous'],
  ['kasket', ['cap'], null, 'slang'],
  ['boyunluk', ['neck_gaiter'], null, 'plain'],
  ['oversize siyah tişört', ['t_shirt'], ['black'], 'slang'],
  // Capital letters, the Turkish dotted and dotless i, and a keyboard without Turkish letters.
  ['BALIKÇI YAKA KAZAK', ['turtleneck'], null, 'case'],
  ['balikci yaka kazak siyah', ['turtleneck'], ['black'], 'case'],
  ['SİYAH DERİ CEKET', ['leather_jacket'], ['black'], 'case'],
  ['SIYAH DERI CEKET', ['leather_jacket'], ['black'], 'case'],
  ['kirmizi atki', ['scarf'], ['red'], 'case'],
  ['Lacivert Keten Gömlek', ['shirt'], ['blue'], 'case'],
  ['BEYAZ GÖMLEK', ['shirt'], ['white'], 'case'],
  ['KIRIK BEYAZ GOMLEK', ['shirt'], ['beige'], 'case'],
  // One letter missing, extra, changed or swapped.
  ['lacivret gömlek', ['shirt'], ['blue'], 'typo'],
  ['gri kazk', ['sweater'], ['gray'], 'typo'],
  ['trençkt', ['trench_coat'], null, 'typo'],
  ['white sneakres', ['sneakers'], ['white'], 'typo'],
  ['haki parkaa', ['parka'], ['green'], 'typo'],
  // More everyday names.
  ['lacivert chino', ['trousers'], ['blue'], 'plain'],
  ['siyah kot', ['jeans'], ['black'], 'plain'],
  ['beyaz siyah tişört', ['t_shirt'], ['white'], 'plain'],
  ['lacivert çizgili gömlek', ['shirt'], ['white'], 'plain'],
  ['uzun kollu tişört', ['long_sleeve_t_shirt'], null, 'plain'],
  ['kapüşonlu sweatshirt', ['hoodie'], null, 'plain'],
  ['kaz tüyü mont', ['insulated_jacket'], null, 'plain'],
  ['deri pantolon', ['trousers'], null, 'plain'],
  ['fleece jacket', ['fleece'], null, 'plain'],
  ['baseball cap', ['cap'], null, 'plain'],
  ['hasır şapka', ['brimmed_hat'], null, 'plain'],
  ['yağmur çizmesi', ['rain_boots'], null, 'plain'],
  ['koşu ayakkabısı', ['sneakers'], null, 'plain'],
  ['atlet', ['sleeveless_top'], null, 'plain'],
  ['ipek bluz', ['blouse'], null, 'plain'],
  ['kot etek', ['skirt'], ['blue'], 'plain'],
  ['shirt dress', ['dress'], null, 'plain'],
  ['siyah kaşmir kazak', ['sweater'], ['black'], 'plain'],
  ['grey wool coat', ['coat'], ['gray'], 'plain'],
  ['white canvas sneakers', ['sneakers'], ['white'], 'plain'],
  ['krem hırka', ['cardigan'], ['beige'], 'plain'],
  ['hakı pantolon', ['trousers'], ['green'], 'case'],
  ['bordo kadife pantolon', ['trousers'], ['red'], 'plain'],
  ['denim shorts', ['shorts'], ['blue'], 'plain'],
  ['tan trench coat', ['trench_coat'], ['brown'], 'plain'],
  ['north face mont', ['insulated_jacket'], null, 'brand'],
  ['lacivert blazer ceket', ['blazer'], ['blue'], 'plain'],
  // A word the vocabulary lacks may be the real piece, or one letter from a colour by chance.
  ['puffer gilet', ['puffer_vest', 'unsupported'], null, 'trap'],
  ['denim overalls', ['jumpsuit', 'unsupported'], null, 'trap'],
  ['kot salopet', ['jumpsuit', 'unsupported'], null, 'trap'],
  ['sweater vest', ['unsupported'], null, 'trap'],
  ['vintage band tee', ['t_shirt'], null, 'trap'],
  ['siyah ceketim', ['unsupported'], ['black'], 'trap'],
  ['polo ralph lauren', ['polo_shirt', 'unsupported'], null, 'trap'],
  ['gray hoodie and black jeans', ['unsupported'], null, 'trap'],
];

// Not understood is right for a piece the catalog lacks, several pieces or several possible types.
function isCorrect(match, types, families, kind) {
  if (match.kind === 'not-understood') return types.includes('unsupported') || kind === 'multi' || kind === 'ambiguous';
  const colourFamily = match.colorChoice === null ? null : colorChoiceFamily(match.colorChoice);
  return types.includes(match.garmentTypeId) &&
    (families === null ? colourFamily === null : families.includes(colourFamily));
}

test('every labelled phrase is matched to an accepted type and colour, or not understood when that is accepted', () => {
  const wrong = labelled
    .filter(([phrase, types, families, kind]) => !isCorrect(matchClosetPhrase(phrase), types, families, kind))
    .map(([phrase]) => `${phrase} -> ${JSON.stringify(matchClosetPhrase(phrase))}`);
  assert.deepEqual(wrong, []);
});

test('a phrase naming one catalog piece is understood; a phrase naming several is not', () => {
  const missed = labelled
    .filter(([, types, , kind]) => !types.includes('unsupported') && kind !== 'ambiguous' && kind !== 'multi')
    .filter(([phrase]) => matchClosetPhrase(phrase).kind !== 'matched')
    .map(([phrase]) => phrase);
  assert.deepEqual(missed, []);
  for (const [phrase] of labelled.filter(([, , , kind]) => kind === 'multi')) {
    assert.equal(matchClosetPhrase(phrase).kind, 'not-understood', phrase);
  }
});

test('a phrase that could mean several catalog types is not understood rather than guessed', () => {
  for (const phrase of ['ceket', 'jacket', 'şapka', 'hat', 'bot', 'boots', 'ayakkabı', 'yelek', 'eşofman']) {
    assert.deepEqual(matchClosetPhrase(phrase), { kind: 'not-understood', reason: 'ambiguous' }, phrase);
  }
});

test('the reason tells several pieces, pieces the catalog lacks and phrases with no piece apart', () => {
  for (const phrase of ['beyaz gömlek siyah pantolon', 'kot pantolon ve beyaz gömlek', 'takım elbise', 'beanie and gloves']) {
    assert.deepEqual(matchClosetPhrase(phrase), { kind: 'not-understood', reason: 'several-pieces' }, phrase);
  }
  for (const phrase of ['çanta', 'deri kemer', 'socks', 'kol saati']) {
    assert.deepEqual(matchClosetPhrase(phrase), { kind: 'not-understood', reason: 'unsupported' }, phrase);
  }
  for (const phrase of ['', '   ', 'kırmızı', 'en sevdiğim şey', '501']) {
    assert.deepEqual(matchClosetPhrase(phrase), { kind: 'not-understood', reason: 'unknown' }, phrase);
  }
});

test('a colour the palette cannot say exactly is left empty, and the piece is still understood', () => {
  for (const [phrase, garmentTypeId] of [
    ['mavi ekose gömlek', 'shirt'], ['yeşil mor gömlek', 'shirt'], ['khaki chinos', 'trousers'],
    ['çizgili tişört', 't_shirt'],
  ]) {
    assert.deepEqual(matchClosetPhrase(phrase), { kind: 'matched', garmentTypeId, colorChoice: null }, phrase);
  }
});

test('denim words choose the denim swatches', () => {
  const colour = (phrase) => matchClosetPhrase(phrase).colorChoice;
  assert.deepEqual(colour('açık mavi kot'), { kind: 'option', id: 'light_wash_denim' });
  assert.deepEqual(colour('siyah kot'), { kind: 'option', id: 'black_denim' });
  assert.deepEqual(colour('kot ceket'), { kind: 'option', id: 'indigo_denim' });
  assert.deepEqual(colour('mavi gömlek'), { kind: 'option', id: 'cobalt' });
  assert.equal(colour('jeans'), null);
});

test('every catalog name in both languages matches its own type with no colour', () => {
  const wrong = [];
  for (const language of ['tr', 'en']) {
    for (const { typeId, nameKey } of listSelectableGarmentTypes(null)) {
      const match = matchClosetPhrase(catalogMessages[language][nameKey]);
      if (match.kind !== 'matched' || match.garmentTypeId !== typeId || match.colorChoice !== null) {
        wrong.push(`${language} ${catalogMessages[language][nameKey]} -> ${JSON.stringify(match)}`);
      }
    }
  }
  assert.deepEqual(wrong, []);
});

test('the result holds only language-independent catalog and palette ids, the same in both languages', () => {
  const selectable = new Set(listSelectableGarmentTypes(null).map(({ typeId }) => typeId));
  for (const [phrase] of labelled) {
    const match = matchClosetPhrase(phrase);
    if (match.kind !== 'matched') continue;
    assert.ok(selectable.has(match.garmentTypeId), phrase);
    assert.ok(match.colorChoice === null || isClosetColorOptionId(match.colorChoice.id), phrase);
  }
  for (const [turkish, english] of [
    ['lacivert keten gömlek', 'navy linen shirt'], ['siyah deri ceket', 'black leather jacket'],
    ['kırmızı ekose atkı', 'red plaid scarf'], ['bej trençkot', 'beige trench coat'],
    ['gri kapüşonlu sweatshirt', 'grey hoodie'],
  ]) {
    assert.deepEqual(matchClosetPhrase(turkish), matchClosetPhrase(english), turkish);
  }
});
