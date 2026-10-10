import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

// The public site is built by GitHub Pages from docs/, which also holds the project's own
// documents. Only the landing, the privacy policy, support and the account terms are
// published, in both languages; everything else under docs/ is listed in the Jekyll
// exclude of docs/_config.yml. A new file under docs/ has to be one or the other.
const docs = new URL('../../../docs/', import.meta.url);
const PUBLISHED = new Set(['index.md', 'privacy-policy.md', 'support.md', 'account-terms.md', 'favicon.ico', 'assets', 'tr']);
const PUBLISHED_TR = new Set(['index.md', 'privacy-policy.md', 'support.md', 'account-terms.md']);

function excluded() {
  const config = readFileSync(new URL('_config.yml', docs), 'utf8');
  const block = config.match(/^exclude:\n((?:\s+- .+\n)+)/m)?.[1] ?? '';
  return new Set(block.split('\n').map((line) => line.replace(/^\s+- /, '').replace(/\/$/, '').trim()).filter(Boolean));
}

test('every entry under docs/ is either a published site page or excluded from the site', () => {
  const skip = excluded();
  for (const name of readdirSync(docs)) {
    if (name.startsWith('_') || name.startsWith('.')) continue;
    assert.ok(PUBLISHED.has(name) || skip.has(name), `docs/${name} would be published: add it to the exclude list in docs/_config.yml`);
  }
  for (const name of readdirSync(new URL('tr/', docs))) {
    assert.ok(PUBLISHED_TR.has(name), `docs/tr/${name} would be published`);
  }
});

test('the published pages are never excluded', () => {
  const skip = excluded();
  for (const name of [...PUBLISHED, 'tr/privacy-policy.md', 'tr/support.md']) assert.ok(!skip.has(name), `${name} is excluded`);
});

// The landing leads with the phrases people search ("what to wear today", "bugün ne giysem"):
// the title puts the query before the brand, the description repeats the query, the Open Graph
// locale and image text follow the page language, and the app's structured data prices the
// app in the page's currency.
const LANDINGS = {
  en: {
    file: 'index.md',
    title: 'What to Wear Today: An Outfit for the Weather | kuyara',
    description: /^What to wear today\? /,
    heroLine: /^What to wear today\? /,
    currency: 'USD',
    privacyUrl: '/privacy-policy.html',
  },
  tr: {
    file: 'tr/index.md',
    title: 'Bugün Ne Giysem? Hava Durumuna Göre Kombin | kuyara',
    description: /^Bugün ne giysem\? /,
    heroLine: /^Ne giysem diye düşünme\./,
    currency: 'TRY',
    privacyUrl: '/tr/privacy-policy.html',
  },
};

const field = (source, key) => source.match(new RegExp(`^${key}: (.+)$`, 'm'))?.[1].replace(/^"(.*)"$/, '$1');

for (const [lang, expected] of Object.entries(LANDINGS)) {
  test(`the ${lang} landing leads its title, description and hero line with the search phrase`, () => {
    const page = readFileSync(new URL(expected.file, docs), 'utf8');
    assert.equal(field(page, 'title'), expected.title);
    assert.match(field(page, 'description'), expected.description);
    assert.match(field(page, 'hero_line'), expected.heroLine);
  });

  test(`the ${lang} footer links the canonical .html pages`, () => {
    const ui = readFileSync(new URL('_data/ui.yml', docs), 'utf8');
    const block = ui.split(/^(?=\w+:$)/m).find((part) => part.startsWith(`${lang}:`));
    assert.equal(block.match(/^\s+privacy_url: (.+)$/m)[1], expected.privacyUrl);
    assert.match(block, new RegExp(`support_url: ${expected.privacyUrl.replace('privacy-policy', 'support')}$`, 'm'));
    assert.match(block, new RegExp(`account_terms_url: ${expected.privacyUrl.replace('privacy-policy', 'account-terms')}$`, 'm'));
  });
}

test('the Open Graph locale and image text follow the page language', () => {
  const config = readFileSync(new URL('_config.yml', docs), 'utf8');
  assert.match(config, /path: ""\n\s+values:\n\s+locale: en_US\n/);
  assert.match(config, /path: "tr"\n\s+values:\n\s+locale: tr_TR\n\s+image:\n\s+alt: .+/);
  assert.match(config, /height: 630\n\s+alt: .+/);
});

test('the structured data prices the app at zero in lira on the Turkish landing and in dollars elsewhere', () => {
  const layout = readFileSync(new URL('_layouts/landing.html', docs), 'utf8');
  assert.match(layout, /"price": "0", "priceCurrency": \{% if page\.lang == "tr" %\}"TRY"\{% else %\}"USD"\{% endif %\}/);
  assert.doesNotMatch(layout, /aggregateRating/);
});
