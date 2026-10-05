import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// Copy rules every user-visible string follows, checked on the string literals of the three
// localization sources and on the values of the two native permission files (`native/en.json`
// and `native/tr.json`, the iOS permission prompts). The scan reads the source, not the
// evaluated objects, so a template function's text is checked too and no placeholder argument
// has to be invented.
//
// The consent screens' words are fixed and stay exactly as they are, including their
// straight apostrophes and lowercase "gardırop" (`analytics.consentTitle`, `consentBody` and
// `consentSettingsBody`). So is the lawyer-approved sync consent wording
// (`account.consent.syncConsentSubtitle`, `syncConsentBox` and `syncConsentText`), which
// `sync-consent-text.test.mjs` pins to its text version. They are the only exemptions.
const SOURCES = [
  new URL('./messages.ts', import.meta.url),
  new URL('../features/catalog/localization/catalog-messages.ts', import.meta.url),
  new URL('../features/recommendation/localization/recommendation-messages.ts', import.meta.url),
];

const NATIVE_FILES = {
  en: new URL('./native/en.json', import.meta.url),
  tr: new URL('./native/tr.json', import.meta.url),
};

const CONSENT_KEYS = new Set([
  'consentTitle', 'consentBody', 'consentSettingsBody', 'syncConsentSubtitle', 'syncConsentBox', 'syncConsentText',
]);

/**
 * Every string literal of `source` with the object key it belongs to: line and block comments
 * are skipped, a template literal contributes its text parts and not its `${...}` expressions.
 */
function literals(source) {
  const found = [];
  let key = '';
  let index = 0;
  const readString = (quote) => {
    let text = '';
    index += 1;
    while (index < source.length && source[index] !== quote) {
      if (source[index] === '\\') {
        text += source[index] + source[index + 1];
        index += 2;
        continue;
      }
      if (quote === '`' && source[index] === '$' && source[index + 1] === '{') {
        let depth = 1;
        index += 2;
        while (index < source.length && depth > 0) {
          const char = source[index];
          if (char === '{') depth += 1;
          else if (char === '}') depth -= 1;
          else if (char === '\'' || char === '"' || char === '`') {
            readString(char);
            continue;
          }
          index += 1;
        }
        text += ' ';
        continue;
      }
      text += source[index];
      index += 1;
    }
    index += 1;
    return text;
  };
  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];
    if (char === '/' && next === '/') {
      while (index < source.length && source[index] !== '\n') index += 1;
    } else if (char === '/' && next === '*') {
      index = source.indexOf('*/', index + 2) + 2;
    } else if (char === '\'' || char === '"' || char === '`') {
      const start = index;
      const text = readString(char);
      const after = source.slice(index).match(/^\s*:/);
      if (after && char !== '`') key = text;
      else found.push({ key, text, line: source.slice(0, start).split('\n').length });
    } else if (/[A-Za-z_$]/.test(char)) {
      const word = /^[A-Za-z0-9_$]+/.exec(source.slice(index))[0];
      if (/^\s*:/.test(source.slice(index + word.length))) key = word;
      index += word.length;
    } else {
      index += 1;
    }
  }
  return found;
}

/** The literals of one language's block: from its `const <language> =` to the next top-level `const`. */
function languageLiterals(url, language) {
  const source = readFileSync(url, 'utf8');
  const start = source.search(new RegExp(`^const ${language}\\b`, 'm'));
  assert.ok(start >= 0, `${url.pathname} has no "const ${language}" block`);
  const rest = source.slice(start + 1);
  const end = rest.search(/^(const|export) /m);
  const block = end < 0 ? rest : rest.slice(0, end);
  const lineOffset = source.slice(0, start).split('\n').length - 1;
  return literals(block)
    .map((literal) => ({ ...literal, line: literal.line + lineOffset }))
    .filter((literal) => !CONSENT_KEYS.has(literal.key) && literal.text.trim() !== '');
}

/** The permission prompts of one language's native file, each with its Info.plist key. */
function nativeLiterals(language) {
  const lines = readFileSync(NATIVE_FILES[language], 'utf8').split('\n');
  const found = [];
  lines.forEach((text, index) => {
    const entry = /^\s*"(\w+)":\s*"(.*)",?$/.exec(text);
    if (entry) found.push({ key: entry[1], text: entry[2], line: index + 1 });
  });
  return found;
}

function offenders(language, pattern) {
  const hits = [];
  for (const url of SOURCES) {
    for (const { key, text, line } of languageLiterals(url, language)) {
      if (pattern.test(text)) hits.push(`${url.pathname.split('/').pop()}:${line} ${key}: ${text}`);
    }
  }
  for (const { key, text, line } of nativeLiterals(language)) {
    if (pattern.test(text)) hits.push(`${language}.json:${line} ${key}: ${text}`);
  }
  return hits;
}

test('the scanner sees the strings it is meant to police', () => {
  const english = languageLiterals(SOURCES[0], 'en');
  const turkish = languageLiterals(SOURCES[0], 'tr');
  assert.ok(english.some(({ text }) => text === 'Morning summary'));
  assert.ok(turkish.some(({ text }) => text === 'Sabah özeti'));
  assert.ok(turkish.some(({ text }) => text === 'Apple Intelligence ile seçildi'));
  assert.ok(english.length > 800 && turkish.length > 800, `${english.length} / ${turkish.length}`);
  assert.equal(nativeLiterals('en').length, 4);
  assert.ok(nativeLiterals('tr').some(({ key }) => key === 'NSCameraUsageDescription'));
  const sample = literals("a: 'x', // it's\n b: `it's ${'q'} fine`, c: \"don't\"");
  assert.deepEqual(sample.map(({ text }) => text), ['x', 'it\'s   fine', 'don\'t']);
});

test('no user-visible string in either language holds a straight apostrophe', () => {
  for (const language of ['en', 'tr']) {
    assert.deepEqual(offenders(language, /['`]|\\'/), [], `${language}: use the typographic apostrophe`);
  }
});

test('Turkish copy says "yapay zeka", never "AI" or "zekâ"', () => {
  assert.deepEqual(offenders('tr', /\bAI\b/), []);
  assert.deepEqual(offenders('tr', /zekâ/i), []);
  assert.ok(languageLiterals(SOURCES[0], 'tr').some(({ text }) => text === 'Yapay zeka ile seçildi'));
});

test('Turkish copy writes "Gardırop" with a capital in every form', () => {
  assert.deepEqual(offenders('tr', /gardıro[bp]/), []);
});

test('English copy says "Closet", never "Wardrobe" or a lowercase "closet"', () => {
  assert.deepEqual(offenders('en', /wardrobe/i), []);
  assert.deepEqual(offenders('en', /(?<![A-Za-z])closet/), []);
});

test('English copy uses American spelling', () => {
  const british = /(colour|grey|licence|centre|metre|\bcatalogue|behaviour|favourite|cancelled|cancelling|organis|personalis|customis|recognis|analyse|neighbour|flavour)/i;
  assert.deepEqual(offenders('en', british), []);
});

test('the morning notification is "Sabah özeti" and "Morning summary" in every place it is named', () => {
  assert.deepEqual(offenders('en', /morning briefing|Good morning/i), []);
  assert.deepEqual(offenders('tr', /brifing|Günaydın/i), []);
});

test('the native permission files read the way the copy rules say, with the same prompts in both languages', () => {
  assert.deepEqual(
    nativeLiterals('tr').map(({ key }) => key),
    nativeLiterals('en').map(({ key }) => key),
  );
  // A straight apostrophe or a banned word in a permission prompt fails the scan above; the
  // sample proves the scan reaches the file and does not skip it.
  assert.equal(offenders('en', /take a Closet photo/).filter((hit) => hit.startsWith('en.json')).length, 1);
  assert.equal(offenders('tr', /Gardırop fotoğrafı çek/).filter((hit) => hit.startsWith('tr.json')).length, 1);
});

// The expo plugins write the English prompt into Info.plist as the base value and the locale
// files override it per language, so the two must say the same thing.
test('the app.json permission prompts equal the English native file', () => {
  const { expo } = JSON.parse(readFileSync(new URL('../../app.json', import.meta.url), 'utf8'));
  const pluginOptions = (name) => expo.plugins.find((plugin) => Array.isArray(plugin) && plugin[0] === name)[1];
  const english = JSON.parse(readFileSync(NATIVE_FILES.en, 'utf8')).ios;
  const location = pluginOptions('expo-location');
  const picker = pluginOptions('expo-image-picker');

  assert.equal(location.locationWhenInUsePermission, english.NSLocationWhenInUseUsageDescription);
  assert.equal(location.motionUsagePermission, english.NSMotionUsageDescription);
  assert.equal(picker.cameraPermission, english.NSCameraUsageDescription);
  assert.equal(picker.photosPermission, english.NSPhotoLibraryUsageDescription);
});
