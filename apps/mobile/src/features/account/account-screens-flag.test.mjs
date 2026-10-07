// The account screens ship switched on from build 20 (ADR 0041 section 5). One constant owns the
// switch; this test locks it on and proves that every production file reaching an account screen
// goes through it.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { sourceFiles as listSourceFiles } from '../../../test/source-files.mjs';
import { ACCOUNT_SCREENS_ENABLED } from './application/account-screens-flag.ts';

const sourceRoot = path.resolve(import.meta.dirname, '../..');

const sourceFiles = () => listSourceFiles(sourceRoot, { extensions: ['.ts', '.tsx'] });

const read = (file) => readFileSync(path.join(sourceRoot, file), 'utf8');

test('the account screens are switched on', () => {
  assert.equal(ACCOUNT_SCREENS_ENABLED, true);
  assert.match(read('features/account/application/account-screens-flag.ts'), /ACCOUNT_SCREENS_ENABLED: boolean = true;/);
});

test('only the six composition files reach the account screens, each behind the switch', () => {
  const reaching = sourceFiles()
    .filter((file) => !file.startsWith('features/account/'))
    .filter((file) => /from '@\/features\/account\/presentation\//.test(read(file)));

  assert.deepEqual(reaching.sort(), [
    'app/(tabs)/(profile)/profile.tsx',
    'app/(tabs)/(profile)/settings/account.tsx',
    'app/(tabs)/(profile)/settings/delete-account.tsx',
    'app/(tabs)/(profile)/settings/index.tsx',
    'app/(tabs)/(today)/[id].tsx',
    'app/(tabs)/_layout.tsx',
  ]);
  for (const file of reaching) {
    const source = read(file);
    if (file.includes('/settings/account') || file.includes('/settings/delete-account')) {
      // An account route's default export redirects to Settings while the switch is off.
      assert.match(source, /export default function \w+\(\) \{\n {2}return ACCOUNT_SCREENS_ENABLED \? <\w+ \/> : <Redirect href="\/settings" \/>;\n\}/, file);
      continue;
    }
    // Every account element Profile, Settings, outfit detail and the tab layout render is the true branch of the switch.
    const uses = source.match(/<Account\w+/g) ?? [];
    const gated = source.match(/ACCOUNT_SCREENS_ENABLED\s*\?\s*<Account\w+/g) ?? [];
    assert.ok(uses.length > 0, `${file} renders an account screen`);
    assert.equal(gated.length, uses.length, `${file} renders an account screen outside the switch`);
  }
});

test('the switch has one owner', () => {
  const owners = sourceFiles().filter((file) => /export const ACCOUNT_SCREENS_ENABLED/.test(read(file)));
  assert.deepEqual(owners, ['features/account/application/account-screens-flag.ts']);
});
