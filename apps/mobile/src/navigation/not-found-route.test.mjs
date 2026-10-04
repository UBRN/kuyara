import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

// A link to a kuyara:// path the app does not have lands on Today, never on the router's
// own English "Unmatched Route" page with its sitemap.
test('an unknown path redirects to Today', async () => {
  const route = await readFile(new URL('../app/+not-found.tsx', import.meta.url), 'utf8');
  assert.match(route, /export default function \w+\(\) \{\n {2}return <Redirect href="\/" \/>;\n\}/);
});
