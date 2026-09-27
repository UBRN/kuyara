// Renders response shapes from a recorded shipped commit as JSON Schema with
// every `additionalProperties` removed. v1 is frozen against build 8, v2 against build 15.
// src/shipped-shape.test.mjs projects HEAD's schemas the same way and asserts equality.
//
// Regenerate (for example after a Zod upgrade changes toJSONSchema output), from the repo root:
//
//   node --experimental-strip-types packages/contracts/scripts/render-shipped-shapes.mjs 67c20ae
//   node --experimental-strip-types packages/contracts/scripts/render-shipped-shapes.mjs --v2 046eb2c
//
// The commit argument identifies the recorded binary. The script copies that commit's route
// schemas and their imports into a temporary directory, resolves this package's Zod there,
// and imports the historical source unchanged.

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
export const v2FixturePath = join(packageDirectory, 'src', '__fixtures__',
  'shipped-build15-v2-response-shapes.json');

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
export const v2ResponseSchemaNames = {
  'weather-v2': ['weatherV2SuccessSchema'],
  'ai-v2': ['aiRecommendV2SuccessSchema'],
};

// Reader-side enum widening (weather `origin.sourceId`, weather and place-search
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

export async function renderShapes(modulesByFile, schemaNames = responseSchemaNames) {
  const shapes = {};
  for (const [file, names] of Object.entries(schemaNames)) {
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
  const v2 = process.argv[2] === '--v2';
  const commit = process.argv[v2 ? 3 : 2];
  if (!commit) throw new Error('Usage: render-shipped-shapes.mjs [--v2] <commit>');

  const directory = mkdtempSync(join(tmpdir(), 'kuyara-shipped-contracts-'));
  const names = v2 ? v2ResponseSchemaNames : responseSchemaNames;
  const files = v2
    ? ['enum-or-unknown', 'weather-v1', 'ai-v1', ...Object.keys(names)]
    : Object.keys(names);
  for (const file of files) {
    const source = execFileSync('git', ['show', `${commit}:packages/contracts/src/${file}.ts`], {
      cwd: packageDirectory,
      encoding: 'utf8',
    });
    writeFileSync(join(directory, `${file}.ts`), source);
  }
  symlinkSync(join(packageDirectory, 'node_modules'), join(directory, 'node_modules'));

  const shapes = await renderShapes((file) => import(pathToFileURL(join(directory, `${file}.ts`)).href), names);
  const target = v2 ? v2FixturePath : fixturePath;
  writeFileSync(target, `${JSON.stringify(shapes, null, 2)}\n`);
  console.log(`Wrote ${Object.keys(shapes).length} shapes from ${commit} to ${target}`);
}
