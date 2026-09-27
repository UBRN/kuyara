// Shipped response-shape guard for build 8 /v1 and build 15 /v2 readers.
//
// What it proves: build 8 (67c20ae, live) and build 9 (e4c9350, in review) parse every /v1
// response with strict schemas, and the Worker sends its contract schema's parsed output. So
// while such a binary is installed the /v1 response shapes are frozen: no new key at any level
// (an unknown key fails the whole payload on those binaries), no removed key and no retyped key,
// and no added member in an emitted enum. This test projects each HEAD response schema to JSON
// Schema (`z.toJSONSchema`, `additionalProperties` stripped) and asserts it equals the same
// projection of the build 8 schema, stored in __fixtures__/shipped-build8-response-shapes.json.
// The existing golden payloads in compatibility.test.mjs cannot catch an added optional field;
// this one does. Where the reader side of an enum was widened (weather `origin.sourceId`,
// weather and place-search `error.code`) the projection collapses the resulting union back to
// the enum node, so the members are still compared; the Worker's own tests keep them in the enum.
//
// What it cannot prove: for every route the guard assumes the wire body is the schema's
// parsed output (since 7f3a543 the probe route parses its body too); it does not observe the
// wire, so a handler that bypasses its schema escapes it. `z.toJSONSchema` drops `.refine` and
// `.superRefine`, so a loosened HEAD refinement (for example the hourly window bound) can let the
// Worker emit a body the shipped refinement rejects without this guard noticing.
//
// Regenerate the fixture (after a Zod upgrade changes toJSONSchema output), from the repo root:
//   node --experimental-strip-types packages/contracts/scripts/render-shipped-shapes.mjs 67c20ae
//   node --experimental-strip-types packages/contracts/scripts/render-shipped-shapes.mjs --v2 046eb2c
//
// Retirement: the v1 fixture and its test are removed when the oldest installed binary is one
// built from 8e949ec or later; the source of that fact is the Release State section of
// docs/current-status.md and nothing else. If a later strict-era build were ever shipped,
// regenerate the fixture from the oldest supported build's commit instead of deleting it.
// The v2 fixture remains until no supported build reads that route with this shape.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { z } from 'zod';

import {
  fixturePath,
  v2FixturePath,
  v2ResponseSchemaNames,
  projectResponseShape,
  renderShapes,
  responseSchemaNames,
} from '../scripts/render-shipped-shapes.mjs';
import * as aiV1 from './ai-v1.ts';
import * as placeSearchV1 from './place-search-v1.ts';
import * as weatherV1 from './weather-v1.ts';
import * as weatherV2 from './weather-v2.ts';
import * as aiV2 from './ai-v2.ts';

const headModules = { 'weather-v1': weatherV1, 'ai-v1': aiV1, 'place-search-v1': placeSearchV1 };
const shipped = JSON.parse(readFileSync(fixturePath, 'utf8'));
const shippedV2 = JSON.parse(readFileSync(v2FixturePath, 'utf8'));

test('the fixture covers exactly the response schemas the Worker sends', () => {
  const expectedKeys = Object.entries(responseSchemaNames).flatMap(([file, names]) =>
    names.map((name) => `${file}:${name}`),
  );
  assert.deepEqual(Object.keys(shipped).sort(), expectedKeys.sort());
});

test('current v2 response shapes match the build 15 readers', async () => {
  const modules = { 'weather-v2': weatherV2, 'ai-v2': aiV2 };
  const head = await renderShapes((file) => modules[file], v2ResponseSchemaNames);
  assert.deepEqual(head, shippedV2);
});

test('every HEAD response schema has the shape build 8 accepts', async () => {
  const head = await renderShapes((file) => headModules[file]);
  for (const [key, shape] of Object.entries(shipped)) {
    assert.deepEqual(head[key], shape, `${key} changed shape against build 8`);
  }
});

test('the projection rejects an added optional key', () => {
  const key = 'weather-v1:weatherV1ErrorSchema';
  const widened = weatherV1.weatherV1ErrorSchema.extend({ retryAfterSeconds: z.number().optional() });
  assert.notDeepEqual(projectResponseShape(key, widened), shipped[key]);
});
