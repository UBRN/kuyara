// ADR 0020: every animation plays in full whatever the system motion setting. Reanimated
// follows that setting by default and jumps each animation to its end, so the root turns the
// default off once, ahead of every animated subtree, and no file opts back in.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { sourceFiles } from '../test/source-files.mjs';

const sourceRoot = import.meta.dirname;
const read = (file) => readFileSync(path.join(sourceRoot, file), 'utf8');

test('the root turns off the system motion default before any animated subtree mounts', () => {
  const layout = read('app/_layout.tsx');
  const root = layout.indexOf('<GestureHandlerRootView');
  const override = layout.indexOf('<ReducedMotionConfig mode={ReduceMotion.Never} />');
  const curtain = layout.indexOf('<LaunchCurtain');
  assert.ok(root !== -1 && override > root && override < curtain);
});

test('no file follows the system motion setting', () => {
  const offenders = sourceFiles(sourceRoot)
    .filter((file) => /ReduceMotion\.(System|Always)|useReducedMotion|isReduceMotionEnabled|reduceMotionChanged|\.reduceMotion\(/
      .test(read(file)));
  assert.deepEqual(offenders, []);
});
