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

// The modes are also plain strings: a `reduceMotion` key or prop, the first argument of
// withSequence, the last of withDelay and withRepeat.
const followsSystemMotion = [
  /ReduceMotion\.(System|Always)|useReducedMotion|isReduceMotionEnabled|reduceMotionChanged|\.reduceMotion\(/,
  /reduceMotion\s*[:=]\s*\{?\s*['"](system|always)['"]/,
  /withSequence\(\s*['"](system|always)['"]/,
  /with(Delay|Repeat)\([^;]*?,\s*['"](system|always)['"]\s*\)/,
];

test('no file follows the system motion setting', () => {
  const offenders = sourceFiles(sourceRoot)
    .filter((file) => followsSystemMotion.some((pattern) => pattern.test(read(file))));
  assert.deepEqual(offenders, []);
});

test('the root override is the only motion config in the app', () => {
  const configs = sourceFiles(sourceRoot)
    .flatMap((file) => read(file).match(/<ReducedMotionConfig\b/g) ?? []);
  assert.equal(configs.length, 1);
});
