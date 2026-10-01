import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';

// Jest does not run React Compiler, so only the compiled output can show what a memo block
// is keyed on. Today's three boards re-render on every weather update; when the composition
// was read above the board's hooks it sat in no memo block, and each update composed and
// redrew every piece again (measured 2026-10-01: 4.4 ms of board work per update in a
// development build, 0.2 ms once the drawing was kept).
const compiled = execFileSync(
  process.execPath,
  [
    path.join(import.meta.dirname, '../../../../test/react-compiler-output.cjs'),
    path.join(import.meta.dirname, 'garment-board.tsx'),
  ],
  { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
);

test('a board keeps its composed drawing while its pieces, colours and width are unchanged', () => {
  const lines = compiled.split('\n');
  const board = lines.findIndex((line) => line.startsWith('export function GarmentBoard('));
  assert.ok(board > 0, 'the compiled file declares GarmentBoard');
  const call = lines.findIndex((line, index) => index > board && line.includes('placePieces(pieces, width'));
  assert.ok(call > board, 'GarmentBoard composes its pieces with placePieces');
  const guard = lines.slice(board, call).findLast((line) => /if \(\$\[\d+\] !==/u.test(line));
  assert.ok(guard, 'the composition sits in a memo block');
  for (const input of ['pieces', 'width', 'roles']) {
    assert.ok(guard.includes(`!== ${input} `) || guard.includes(`!== ${input})`),
      `the composition's memo block is keyed on ${input}: ${guard.trim()}`);
  }
});
