import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

import { GENERATED_INCLUDES, generateSiteBoards, PREFERENCES, SCENES } from '../../../../scripts/site-boards.mjs';

// The public site draws the app's own boards from files that apps/mobile/scripts/site-boards.mjs
// generates and the repository commits, because GitHub Pages runs no build step beyond
// Jekyll. This suite holds the committed files to the generator and every scene's boards to
// the rules the site claims for them (docs/design/visual-identity.md, Web presence).
const generated = generateSiteBoards();
const root = new URL('../../../../../../', import.meta.url);
const regenerate = 'run apps/mobile/scripts/site-boards.mjs and commit what it writes';

test('the committed site board files are exactly what the generator writes, and nothing else is generated', () => {
  for (const [path, content] of Object.entries(generated.files)) {
    let committed = null;
    try { committed = readFileSync(new URL(path, root), 'utf8'); } catch { /* missing */ }
    assert.ok(committed === content, `${path} is stale or missing: ${regenerate}`);
  }
  for (const name of readdirSync(new URL(GENERATED_INCLUDES, root))) {
    assert.ok(`${GENERATED_INCLUDES}${name}` in generated.files, `${GENERATED_INCLUDES}${name} is no longer generated: ${regenerate}`);
  }
});

test('every scene dresses both catalogues in an outfit the app composes for its weather', () => {
  // The generator stops on an outfit the rules do not compose, so reaching here proves it;
  // this pins that every scene and both catalogues are on the page.
  assert.deepEqual(generated.scenes.map((scene) => scene.id), SCENES.map((scene) => scene.id));
  for (const scene of generated.scenes) assert.equal(scene.boards.length, PREFERENCES.length);
});

test('every site board draws a body core and footwear in two to four pieces, no two from one drawing', () => {
  for (const scene of generated.scenes) {
    scene.boards.forEach((board, index) => {
      const where = `${scene.id} ${PREFERENCES[index]}`;
      const slots = board.pieces.map((piece) => piece.slot);
      const core = slots.includes('one_piece')
        ? !slots.includes('primary_top') && !slots.includes('bottom')
        : slots.includes('primary_top') && slots.includes('bottom');
      assert.ok(core, `${where}: the body core is ${slots.join(', ')}`);
      assert.ok(slots.includes('footwear'), `${where}: no footwear`);
      // The page names at most four pieces under a board, so the board holds at most that
      // many besides a one-piece's absent bottom.
      assert.ok(slots.length >= 2 && slots.length <= 4, `${where}: ${slots.length} pieces`);
      const drawings = board.pieces.map((piece) => piece.drawing);
      assert.equal(new Set(drawings).size, drawings.length, `${where}: two pieces share a drawing (${drawings.join(', ')})`);
    });
  }
});
