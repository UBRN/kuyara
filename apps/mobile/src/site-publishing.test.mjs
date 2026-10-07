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
