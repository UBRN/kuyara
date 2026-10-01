import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { brandSymbolPaths, brandSymbolViewBox } from './brand-symbol.ts';

test('the launch curtain draws the master symbol, path for path', async () => {
  const master = await readFile(
    new URL('../../../assets/brand/kuyara-symbol-master.svg', import.meta.url),
    'utf8',
  );
  const paths = [...master.matchAll(/<path\b[^>]*\sd="([^"]+)"/g)].map((match) => match[1]);

  assert.deepEqual(paths, [...brandSymbolPaths]);
  assert.match(master, new RegExp(`viewBox="0 0 ${brandSymbolViewBox} ${brandSymbolViewBox}"`));
});
