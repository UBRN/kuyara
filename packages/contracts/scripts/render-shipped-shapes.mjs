// Renders the response shapes a shipped binary's contract schemas accept, as JSON Schema with
// every `additionalProperties` removed, into src/__fixtures__/shipped-build8-response-shapes.json.
// src/shipped-shape.test.mjs projects HEAD's schemas the same way and asserts equality.
//
// Regenerate (for example after a Zod upgrade changes toJSONSchema output), from the repo root:
//
//   node --experimental-strip-types packages/contracts/scripts/render-shipped-shapes.mjs 67c20ae
//
// The commit argument is the one the oldest installed binary was built from. The script writes
// that commit's weather-v1.ts, ai-v1.ts and place-search-v1.ts into a temporary directory (under
// TMPDIR), resolves `zod` there through this package's node_modules and imports them unchanged.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { z } from 'zod';

const packageDirectory = join(dirname(fileURLToPath(import.meta.url)), '..');
export const fixturePath = join(
  packageDirectory,
  'src',
  '__fixtures__',
  'shipped-build8-response-shapes.json',
);

// One entry per response body the Worker sends, keyed "<file>:<exportName>".
export const responseSchemaNames = {
  'weather-v1': ['weatherV1SuccessSchema', 'weatherV1ErrorSchema'],
  'ai-v1': [
    'aiRecommendV1SuccessSchema',
    'aiProbeV1SuccessSchema',
    'healthV1SuccessSchema',
    'aiReadyV1SuccessSchema',
    'aiV1ErrorSchema',
  ],
  'place-search-v1': ['placeSearchV1SuccessSchema', 'placeSearchV1ErrorSchema'],
};

// Reader-side enum widening (Lane E: weather `origin.sourceId`, weather and place-search
// `error.code`) renders at HEAD as `anyOf: [enumNode, {}]`, the empty schema being the
// `unrepresentable: 'any'` stand-in for the bounded-string-to-'unknown' transform. The Worker
// still never emits outside the enum, which its own tests hold, so the projection collapses
// that union back to the enum node. The enum members themselves stay in the projection: an
// added emitted member or a retyped code breaks a shipped strict binary and must fail here.
function isEmptySchema(node) {
  return node !== null && typeof node === 'object' && !Array.isArray(node) && Object.keys(node).length === 0;
}

function normalise(node) {
  if (Array.isArray(node)) return node.map(normalise);
  if (node === null || typeof node !== 'object') return node;
  if (
    Array.isArray(node.anyOf) &&
    node.anyOf.length === 2 &&
    Array.isArray(node.anyOf[0]?.enum) &&
    isEmptySchema(node.anyOf[1]) &&
    Object.keys(node).length === 1
  ) {
    return normalise(node.anyOf[0]);
  }
  return Object.fromEntries(
    Object.entries(node)
      .filter(([key]) => key !== 'additionalProperties')
      .map(([key, value]) => [key, normalise(value)]),
  );
}

export function projectResponseShape(_key, schema) {
  return normalise(z.toJSONSchema(schema, { unrepresentable: 'any' }));
}

export async function renderShapes(modulesByFile) {
  const shapes = {};
  for (const [file, names] of Object.entries(responseSchemaNames)) {
    const module = await modulesByFile(file);
    for (const name of names) {
      const key = `${file}:${name}`;
      if (!(name in module)) throw new Error(`${key} is not exported`);
      shapes[key] = projectResponseShape(key, module[name]);
    }
  }
  return shapes;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const commit = process.argv[2];
  if (!commit) throw new Error('Usage: render-shipped-shapes.mjs <commit>');

  const directory = mkdtempSync(join(tmpdir(), 'kuyara-shipped-contracts-'));
  for (const file of Object.keys(responseSchemaNames)) {
    const source = execFileSync('git', ['show', `${commit}:packages/contracts/src/${file}.ts`], {
      cwd: packageDirectory,
      encoding: 'utf8',
    });
    writeFileSync(join(directory, `${file}.ts`), source);
  }
  symlinkSync(join(packageDirectory, 'node_modules'), join(directory, 'node_modules'));

  const shapes = await renderShapes((file) => import(pathToFileURL(join(directory, `${file}.ts`)).href));
  writeFileSync(fixturePath, `${JSON.stringify(shapes, null, 2)}\n`);
  console.log(`Wrote ${Object.keys(shapes).length} shapes from ${commit} to ${fixturePath}`);
}
