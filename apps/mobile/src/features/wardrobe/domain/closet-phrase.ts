import type { GarmentTypeId } from '@/features/catalog/domain/garment-taxonomy';
import type {
  ClosetColorChoice,
  ClosetColorOptionId,
} from '@/features/wardrobe/domain/closet-color-options';

/**
 * What a typed or spoken Closet phrase ("lacivert keten gömlek", "navy linen shirt") names: one
 * catalog garment type and, when the palette can say it exactly, one palette colour. The answer
 * holds ids only, never words, so it reads the same in Turkish and English. A phrase that could
 * mean more than one type, names several pieces, names a piece the catalog lacks or names no
 * piece is not understood: a wrong guess costs more than no guess (ADR 0042). A word for several
 * types names them as `candidates`, in catalog order, for the person to choose from, with the
 * phrase's colour.
 */
export type ClosetPhraseMatch =
  | Readonly<{ kind: 'matched'; garmentTypeId: GarmentTypeId; colorChoice: ClosetColorChoice | null }>
  | Readonly<{
      kind: 'not-understood';
      reason: 'ambiguous';
      candidates: readonly GarmentTypeId[];
      colorChoice: ClosetColorChoice | null;
    }>
  | Readonly<{ kind: 'not-understood'; reason: 'unknown' | 'unsupported' | 'several-pieces' }>;

type GarmentMeaning = GarmentTypeId | 'unsupported' | 'ambiguous' | 'several-pieces';
type Pattern = 'stripes' | 'breton' | 'plaid' | 'gingham' | 'floral' | 'polka_dots' | 'leopard' | 'houndstooth';
type GarmentTerm = Readonly<{
  garment: GarmentMeaning;
  denim: boolean;
  brand: boolean;
  candidates?: readonly GarmentTypeId[];
}>;
type Term =
  | GarmentTerm
  | Readonly<{ color: ClosetColorOptionId }>
  | Readonly<{ pattern: Pattern }>
  | Readonly<{ known: true }>;

// Names are written as people write them; `wordsOf` reads Turkish letters, capitals and the dotted
// and dotless i alike. A word may also stand inside a longer name, and the longest name wins.
const garmentNames: Readonly<Record<Exclude<GarmentMeaning, 'ambiguous'>, string>> = {
  sleeveless_top: 'kolsuz üst|kolsuz|atlet|askılı|sleeveless top|tank top|vest top',
  t_shirt: 'tişört|t shirt|tshirt|tee|tees',
  long_sleeve_t_shirt: 'uzun kollu tişört|long sleeve t shirt|long sleeve tee|long sleeved t shirt',
  shirt: 'gömlek|shirt|button down',
  blouse: 'bluz|blouse',
  sweatshirt: 'sweatshirt|sweat|crewneck',
  hoodie: 'hoodie|hoody|kapüşonlu|kapşonlu|kapüşonlu sweatshirt|kapşonlu sweatshirt|hooded sweatshirt',
  sweater: 'kazak|süveter|sweater|jumper|pullover',
  cardigan: 'hırka|cardigan',
  overshirt: 'gömlek ceket|overshirt|shacket|shirt jacket',
  fleece: 'polar|fleece|polar ceket|polar mont|fleece jacket',
  turtleneck: 'balıkçı|balıkçı yaka|balıkçı yaka kazak|balıkçı kazak|boğazlı kazak|turtleneck|' +
    'turtleneck sweater|roll neck|roll neck sweater',
  polo_shirt: 'polo|polo tişört|polo yaka|polo yaka tişört|polo shirt|polo t shirt',
  trousers: 'pantolon|kumaş pantolon|chino|chinos|trousers|pants|slacks',
  jeans: 'kot|kot pantolon|jean|jean pantolon|denim|jeans|levis|levi s',
  leggings: 'tayt|leggings',
  shorts: 'şort|bermuda|shorts',
  skirt: 'etek|skirt',
  long_skirt: 'uzun etek|maxi etek|maksi etek|long skirt|maxi skirt',
  track_pants: 'eşofman altı|track pants|sweatpants|joggers|jogger|tracksuit bottoms',
  dress: 'elbise|dress',
  jumpsuit: 'tulum|jumpsuit',
  knit_dress: 'triko elbise|kazak elbise|knit dress|sweater dress',
  light_jacket: 'hafif ceket|ince mont|kot ceket|jean ceket|denim ceket|light jacket|denim jacket|jean jacket|' +
    'trucker jacket|waxed jacket',
  trench_coat: 'trençkot|trenç|trench|trench coat|trenchcoat',
  rain_jacket: 'yağmurluk|yağmur ceketi|rain jacket|raincoat|rain coat',
  insulated_jacket: 'mont|şişme mont|yalıtımlı mont|kışlık mont|insulated jacket|puffer|puffer jacket|' +
    'down jacket|ultra light down',
  coat: 'kaban|palto|coat|overcoat',
  parka: 'parka',
  blazer: 'blazer|blazer ceket|takım ceketi|suit jacket|sport coat',
  puffer_vest: 'şişme yelek|puffer vest|down vest',
  bomber_jacket: 'bomber|bomber ceket|bomber jacket',
  leather_jacket: 'deri ceket|deri mont|biker ceket|leather jacket|biker jacket',
  sneakers: 'spor ayakkabı|koşu ayakkabısı|sneaker|sneakers|trainers|running shoes|converse',
  closed_shoes: 'klasik ayakkabı|dress shoes|oxford ayakkabı|oxford shoes',
  ankle_boots: 'bilek botu|chelsea bot|chelsea botu|ankle boots|chelsea boots|dr martens|doc martens',
  weather_boots: 'kışlık bot|kar botu|winter boots|snow boots',
  sandals: 'sandalet|sandal|sandals',
  loafers: 'loafer|loafers|mokasen|makosen|moccasins',
  ballet_flats: 'babet|ballet flats|flats',
  rain_boots: 'yağmur botu|yağmur çizmesi|lastik çizme|lastik bot|rain boots|wellies|wellington boots',
  beanie: 'bere|beanie',
  brimmed_hat: 'geniş kenarlı şapka|hasır şapka|panama şapka|brimmed hat|sun hat|bucket hat|fedora',
  cap: 'kep|kasket|beyzbol şapkası|cap|baseball cap|flat cap',
  balaclava: 'kar maskesi|balaklava|balaclava',
  scarf: 'atkı|şal|scarf|scarves',
  neck_gaiter: 'boyunluk|neck warmer|neck gaiter',
  gloves: 'eldiven|gloves|glove',
  umbrella: 'şemsiye|umbrella',
  unsupported: 'çanta|sırt çantası|bag|bags|handbag|backpack|kemer|belt|gözlük|güneş gözlüğü|glasses|' +
    'sunglasses|saat|kol saati|watch|bikini|mayo|swimsuit|pijama|pyjamas|pajamas|kravat|papyon|tie|bow tie|' +
    'terlik|slippers|flip flops|çorap|sock|socks|iç çamaşırı|underwear|sütyen|bra|kolye|necklace|küpe|' +
    'earrings|bileklik|bracelet|cüzdan|wallet|eşofman üstü|track jacket',
  'several-pieces': 'takım elbise|takım|suit|eşofman takımı|tracksuit',
};

// Words for several types, each with the types a longer name holding it stands for ("deri ceket"),
// at most four, in catalog order: the choices the add form offers.
const ambiguousNames: readonly (readonly [string, readonly GarmentTypeId[]])[] = [
  ['ceket|jacket', ['light_jacket', 'blazer', 'bomber_jacket', 'leather_jacket']],
  ['yelek|vest', ['puffer_vest']],
  ['şapka|hat', ['brimmed_hat', 'cap']],
  ['bot|boot|boots', ['ankle_boots', 'weather_boots', 'rain_boots']],
  ['çizme', ['rain_boots']],
  ['ayakkabı|shoes|shoe', ['sneakers', 'closed_shoes']],
  ['eşofman', ['track_pants']],
  ['üst|top', ['sleeveless_top']],
];

// Names that put the piece in denim, so a blue or black names a denim swatch.
const denimNames = new Set([
  'kot', 'kot ceket', 'jean', 'jean ceket', 'denim', 'denim ceket', 'denim jacket', 'jean jacket', 'trucker jacket',
]);
// Brand names, which a model name may follow ("Converse All Star").
const brandNames = new Set(['converse', 'levis', 'levi s', 'dr martens', 'doc martens']);

const colorNames: Readonly<Partial<Record<ClosetColorOptionId, string>>> = {
  white: 'beyaz|white',
  ecru: 'ekru|krem|kırık beyaz|ecru|cream|off white|ivory',
  stone: 'bej|beige|stone',
  sand: 'kum rengi|sand',
  camel: 'camel|deve tüyü',
  tan_leather: 'taba|açık kahve|açık kahverengi|tan|light brown',
  chocolate: 'kahverengi|kahve|koyu kahve|koyu kahverengi|brown|dark brown|chocolate',
  light_grey: 'açık gri|light grey|light gray',
  heather_grey: 'gri|grey|gray',
  charcoal: 'antrasit|füme|koyu gri|charcoal|dark grey|dark gray',
  black: 'siyah|black',
  navy: 'lacivert|koyu mavi|navy|navy blue|dark blue',
  indigo_denim: 'indigo',
  light_wash_denim: 'açık yıkama|light wash',
  sky_blue: 'açık mavi|bebek mavisi|gök mavisi|light blue|baby blue|sky blue',
  cobalt: 'mavi|saks|saks mavisi|blue|royal blue|cobalt',
  sage: 'adaçayı|mint|açık yeşil|sage|light green',
  olive: 'haki|zeytin yeşili|asker yeşili|olive|olive green',
  forest_green: 'yeşil|koyu yeşil|green|dark green|forest green',
  mustard: 'hardal|mustard',
  rain_yellow: 'sarı|yellow',
  terracotta: 'turuncu|kiremit|orange|terracotta',
  rust: 'pas rengi|rust',
  tomato_red: 'kırmızı|red',
  burgundy: 'bordo|burgundy|maroon|wine|bordeaux',
  blush: 'pudra|toz pembe|blush|powder pink',
  dusty_rose: 'pembe|gül kurusu|pink|dusty rose',
  lavender: 'lila|leylak|lavender|lilac',
  plum: 'mor|mürdüm|purple|plum',
};

const patternNames: Readonly<Record<Pattern, string>> = {
  stripes: 'çizgili|çubuklu|striped|stripe|stripes|stripy',
  breton: 'breton',
  plaid: 'ekose|kareli|plaid|tartan|checked',
  gingham: 'pötikare|gingham',
  floral: 'çiçekli|çiçek desenli|floral|flowered',
  polka_dots: 'puantiyeli|puanlı|polka|polka dot|polka dots|dotted',
  leopard: 'leopar|leopar desenli|leopard|leopard print',
  houndstooth: 'kazayağı|houndstooth',
};

// Recognised words that decide nothing: fabrics, fits, lengths, shades on their own and a colour
// word the palette cannot place ("khaki" is green in Turkish and sand in English).
const knownNames = 'keten|linen|deri|leather|süet|suede|yün|yünlü|wool|kaşmir|cashmere|ipek|silk|pamuk|' +
  'pamuklu|cotton|kadife|fitilli kadife|velvet|corduroy|saten|satin|şifon|chiffon|triko|knit|örgü|waxed|tüvit|' +
  'tweed|kaz tüyü|down|merino|oversize|oversized|slim|slim fit|regular fit|bol|dar|crop|mini|midi|maxi|maksi|' +
  'uzun|long|kısa|short|kısa kollu|short sleeve|açık|koyu|light|dark|khaki|renkli|desenli|v yaka|bisiklet yaka';

const plainLetters: Readonly<Record<string, string>> = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' };

/** Lower case with Turkish letters kept, and each run of other characters as one space. */
function lowerMarked(text: string): string {
  return text.replace(/[İI]/g, 'i').toLowerCase().replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9çğıöşüâîû]+/g, ' ').trim();
}

/** `lowerMarked` with Turkish letters as their plain forms, letter for letter. */
function plain(marked: string): string {
  return marked.replace(/[çğıöşüâîû]/g, (letter) => plainLetters[letter]);
}

/** Words as `lowerMarked` writes them, so each lines up with its plain form letter for letter. */
type Word = Readonly<{ plain: string; marked: string }>;

function wordsOf(text: string): Word[] {
  return lowerMarked(text).split(' ').filter((word) => word.length > 0)
    .map((marked) => ({ plain: plain(marked), marked }));
}

type Entry = Readonly<{ words: readonly Word[]; term: Term }>;

function entries(names: string, term: (name: string) => Term): Entry[] {
  return names.split('|').map((name) => ({ words: wordsOf(name), term: term(name) }));
}

const vocabulary: readonly Entry[] = [
  ...Object.entries(garmentNames).flatMap(([garment, names]) =>
    entries(names, (name) => ({
      garment: garment as GarmentMeaning, denim: denimNames.has(name), brand: brandNames.has(name),
    }))),
  ...ambiguousNames.flatMap(([names, candidates]) =>
    entries(names, () => ({ garment: 'ambiguous', denim: false, brand: false, candidates }))),
  ...Object.entries(colorNames).flatMap(([color, names]) =>
    entries(names, () => ({ color: color as ClosetColorOptionId }))),
  ...Object.entries(patternNames).flatMap(([pattern, names]) =>
    entries(names, () => ({ pattern: pattern as Pattern }))),
  ...entries(knownNames, () => ({ known: true })),
];

/**
 * One letter missing, added or changed, or two neighbours swapped, in a typed word of four letters
 * or more against a name word of five or more: shorter words lie one edit from too many others
 * ("band" from "sand", "here" from "bere").
 */
function oneEditApart(typed: string, known: string): boolean {
  if (typed.length < 4 || known.length < 5 || Math.abs(typed.length - known.length) > 1) return false;
  let start = 0;
  while (start < typed.length && typed[start] === known[start]) start += 1;
  if (typed.length === known.length) {
    const sameAfter = (skip: number) => typed.slice(start + skip) === known.slice(start + skip);
    return sameAfter(1) || (typed[start] === known[start + 1] && typed[start + 1] === known[start] && sameAfter(2));
  }
  const [longer, shorter] = typed.length > known.length ? [typed, known] : [known, typed];
  return longer.slice(start + 1) === shorter.slice(start);
}

// Turkish endings on a name, with ı and ü written plain: possessive (-ım, -m, -ın), accusative
// (-ı, -yı), plural (-lar) and their stacks (-larım, -imi). One starting with a vowel follows a
// consonant, one starting with m or y follows a vowel, and the plural follows either.
const endingsAfterConsonant = new Set(['i', 'u', 'im', 'um', 'in', 'un', 'imi', 'umu', 'ini', 'unu']);
const endingsAfterVowel = new Set(['m', 'yi', 'yu', 'mi']);
const pluralEndings = new Set(['lar', 'ler', 'lari', 'leri', 'larim', 'lerim', 'larimi', 'lerimi', 'larin', 'lerin']);
// A final k, p or t softens before a vowel ending ("gömleğim", "dolabı", "kitadı").
const softened: Readonly<Record<string, string>> = { k: 'ğg', p: 'b', t: 'd' };

/**
 * The typed word is the name word of three letters or more with one Turkish ending. A letter
 * typed without its mark reads as the marked one, but a mark the name lacks does not ("kötü" is
 * not "kot"), since the ending would otherwise turn a plain word into a name.
 */
function inflectedFrom(typed: Word, name: Word): boolean {
  const length = name.marked.length;
  if (length < 3 || typed.marked.length <= length) return false;
  const ending = typed.plain.slice(length);
  const vowelFinal = /[aeiou]$/.test(name.plain);
  const endingFits = pluralEndings.has(ending) ||
    (vowelFinal ? endingsAfterVowel : endingsAfterConsonant).has(ending);
  if (!endingFits) return false;
  return [...name.marked].every((letter, index) => {
    const typedLetter = typed.marked[index];
    if (typedLetter === letter || typedLetter === plain(letter)) return true;
    return index === length - 1 && !vowelFinal && /^[iu]/.test(ending) && (softened[letter] ?? '').includes(typedLetter);
  });
}

type Found = Readonly<{ start: number; end: number; term: Term }>;

/**
 * The longest vocabulary name at each place, an exact spelling before a one-edit one and a
 * one-edit one before an inflected last word ("deri ceketim"). A place where different meanings
 * tie, and a word no name covers, yield nothing.
 */
function findTerms(words: readonly Word[]): readonly Found[] {
  const found: Found[] = [];
  let at = 0;
  while (at < words.length) {
    let best: { length: number; cost: number; terms: Term[] } = { length: 0, cost: 0, terms: [] };
    for (const entry of vocabulary) {
      if (at + entry.words.length > words.length) continue;
      let cost = 0;
      const fits = entry.words.every((word, index) => {
        const typed = words[at + index];
        if (word.plain === typed.plain) return true;
        if (oneEditApart(typed.plain, word.plain)) {
          cost += 1;
          return true;
        }
        cost += 2;
        return index === entry.words.length - 1 && inflectedFrom(typed, word);
      });
      if (!fits || entry.words.length < best.length) continue;
      if (entry.words.length === best.length && cost > best.cost) continue;
      if (entry.words.length > best.length || cost < best.cost) best = { length: entry.words.length, cost, terms: [] };
      best.terms.push(entry.term);
    }
    if (new Set(best.terms.map((term) => JSON.stringify(term))).size === 1) {
      found.push({ start: at, end: at + best.length, term: best.terms[0] });
    }
    at += Math.max(best.length, 1);
  }
  return found;
}

type ColorMap = Readonly<Partial<Record<ClosetColorOptionId, ClosetColorOptionId>>>;
const denimShade: ColorMap = {
  navy: 'indigo_denim', cobalt: 'mid_wash_denim', sky_blue: 'light_wash_denim', black: 'black_denim',
};
const stripesOn: ColorMap = { cobalt: 'blue_stripes', navy: 'navy_stripes', black: 'black_stripes', tomato_red: 'red_stripes' };
const ginghamIn: ColorMap = { cobalt: 'blue_gingham', tomato_red: 'red_gingham' };
const colorPairs: readonly (readonly [ClosetColorOptionId, ClosetColorOptionId, ClosetColorOptionId])[] = [
  ['white', 'black', 'white_and_black'], ['white', 'cobalt', 'white_and_blue'], ['navy', 'camel', 'navy_and_camel'],
];

/** The one palette option the colour and pattern words name together, or null when they name none exactly. */
function paletteOption(
  colors: ReadonlySet<ClosetColorOptionId>,
  patterns: ReadonlySet<Pattern>,
  denim: boolean,
): ClosetColorOptionId | null {
  // Patterned cloth is printed on white, so white names the ground, not a second colour.
  const printed = [...colors].filter((color) => color !== 'white');
  const ink = printed.length === 1 ? printed[0] : null;
  // A Breton top is striped by definition, so "breton stripe tee" names one pattern.
  const named = [...patterns].filter((pattern) => !(pattern === 'stripes' && patterns.has('breton')));
  if (named.length > 1) return null;
  const [pattern] = named;
  if (pattern === 'breton') return printed.length === 0 || ink === 'navy' ? 'navy_stripes' : null;
  if (pattern === 'stripes') return ink === null ? null : stripesOn[ink] ?? null;
  if (pattern === 'gingham') return ink === null ? null : ginghamIn[ink] ?? null;
  if (pattern === 'plaid') return ink === 'tomato_red' ? 'tartan' : null;
  if (pattern !== undefined) return pattern;
  if (colors.size === 1) {
    const [color] = colors;
    return denim ? denimShade[color] ?? color : color;
  }
  const pair = colorPairs.find(([first, second]) => colors.size === 2 && colors.has(first) && colors.has(second));
  return pair ? pair[2] : null;
}

function isGarment(found: Found): found is Found & Readonly<{ term: GarmentTerm }> {
  return 'garment' in found.term;
}

export function matchClosetPhrase(phrase: string): ClosetPhraseMatch {
  const words = wordsOf(phrase);
  const terms = findTerms(words);
  const garments = terms.filter(isGarment);
  if (garments.length === 0) return { kind: 'not-understood', reason: 'unknown' };
  // Names written side by side are one piece named by the last ("kot şort", "fleece eşofman
  // altı"); any word between two names makes them two pieces.
  if (garments.some((found, index) => index > 0 && garments[index - 1].end !== found.start)) {
    return { kind: 'not-understood', reason: 'several-pieces' };
  }
  const last = garments[garments.length - 1];
  const head = last.term.garment;
  if (head === 'unsupported' || head === 'several-pieces') return { kind: 'not-understood', reason: head };
  const inDenim = garments.some(({ term }) => term.denim);
  const colors = new Set(terms.flatMap(({ term }) => ('color' in term ? [term.color] : [])));
  const patterns = new Set(terms.flatMap(({ term }) => ('pattern' in term ? [term.pattern] : [])));
  // Denim with no colour word reads as indigo; jeans come in every colour, so they do not.
  const option = inDenim && head !== 'jeans' && colors.size === 0 && patterns.size === 0
    ? 'indigo_denim'
    : paletteOption(colors, patterns, inDenim || head === 'jeans');
  const colorChoice = option === null ? null : { kind: 'option', id: option } as const;
  if (head === 'ambiguous') {
    return { kind: 'not-understood', reason: 'ambiguous', candidates: last.term.candidates ?? [], colorChoice };
  }
  // An unknown word right after the name may be the real head ("puffer gilet", "kot salopet"),
  // unless the name is a brand or the word is a number. Nothing is offered then.
  const after = words[last.end]?.plain;
  if (!last.term.brand && after !== undefined && /^[a-z]+$/.test(after) && !terms.some(({ start }) => start === last.end)) {
    return { kind: 'not-understood', reason: 'ambiguous', candidates: [], colorChoice };
  }
  return { kind: 'matched', garmentTypeId: head, colorChoice };
}
