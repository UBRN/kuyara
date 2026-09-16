import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { silhouettes } from './silhouettes.ts';

// The public site's landing layout inlines garment boards whose path data is copied from
// silhouettes.ts. Nothing generates them, so this suite is what notices when the
// vocabulary changes under the copy. Each `<g>` is identified by its ordered `d` list,
// which is unique per silhouette, so the HTML needs no garment marker.
const landingUrl = new URL('../../../../../../docs/_layouts/landing.html', import.meta.url);
const regenerate = 'regenerate the board in docs/_layouts/landing.html from silhouettes.ts';

// docs/design/garment-board.md section 8: stroke 1.9, round joins and caps, filled paths
// take the stage fill and open paths take none (garment-board.tsx does the same).
const strokeAttributes = {
  stroke: 'var(--ku-board-ink)',
  'stroke-width': '1.9',
  'stroke-linejoin': 'round',
  'stroke-linecap': 'round',
};
const fillFor = (filled) => (filled ? 'var(--ku-board-fill)' : 'none');

const attributesOf = (tag) => Object.fromEntries(
  [...tag.matchAll(/([A-Za-z-]+)="([^"]*)"/g)].map(([, name, value]) => [name, value]),
);

function readBoards() {
  const html = readFileSync(landingUrl, 'utf8');
  return [...html.matchAll(/<svg class="board"([^>]*)>([\s\S]*?)<\/svg>/g)].map((svg) => {
    const line = html.slice(0, svg.index).split('\n').length;
    const viewBox = attributesOf(svg[1]).viewBox.split(/\s+/).map(Number);
    const pieces = [...svg[2].matchAll(/<g transform="translate\(([^)]*)\)">([\s\S]*?)<\/g>/g)]
      .map((group, column) => {
        const [tx, ty = 0] = group[1].split(/[\s,]+/).map(Number);
        const paths = [...group[2].matchAll(/<path\b[^>]*\/>/g)].map(([tag]) => attributesOf(tag));
        return { column: column + 1, tx, ty, paths };
      });
    return { line, viewBox, pieces };
  });
}

const vocabulary = new Map(Object.values(silhouettes)
  .map((silhouette) => [silhouette.paths.map(({ d }) => d).join('\n'), silhouette]));

function identify(paths) {
  const key = paths.map(({ d }) => d).join('\n');
  const exact = vocabulary.get(key);
  if (exact) return { silhouette: exact, exact: true };
  const drawn = new Set(paths.map(({ d }) => d));
  const nearest = Object.values(silhouettes)
    .map((silhouette) => ({
      silhouette,
      shared: silhouette.paths.filter(({ d }) => drawn.has(d)).length,
    }))
    .sort((a, b) => b.shared - a.shared)[0];
  return { silhouette: nearest.silhouette, exact: false, shared: nearest.shared };
}

const boards = readBoards();

test('the landing layout inlines seven three-piece boards', () => {
  assert.equal(boards.length, 7);
  for (const board of boards) assert.equal(board.pieces.length, 3, `line ${board.line}`);
});

test('every landing board piece is a silhouette copied verbatim, with the spec fill and stroke', () => {
  for (const board of boards) {
    for (const piece of board.pieces) {
      const where = `landing.html line ${board.line}, column ${piece.column}`;
      const match = identify(piece.paths);
      assert.ok(match.exact,
        `${where} no longer matches any silhouette; its nearest is ${match.silhouette.id} `
        + `(${match.shared} of ${match.silhouette.paths.length} paths still equal). `
        + `Either that drawing changed in silhouettes.ts or the copy was edited: ${regenerate}.`);
      piece.paths.forEach((attributes, index) => {
        const source = match.silhouette.paths[index];
        assert.equal(attributes.fill, fillFor(source.filled),
          `${where} (${match.silhouette.id}) path ${index + 1} fill`);
        for (const [name, value] of Object.entries(strokeAttributes)) {
          assert.equal(attributes[name], value, `${where} (${match.silhouette.id}) path ${index + 1} ${name}`);
        }
      });
    }
  }
});

// The row offsets place each piece by its drawn bounds: the bounds centre of column one,
// two and three lands on the same x in every board, so a redrawn silhouette whose bounds
// moved shows up here even when its paths were recopied. The columns are read from the
// first board rather than fixed, and clip and overlap use the board's own viewBox.
test('every landing board places its pieces on the shared columns without clipping or overlap', () => {
  const drawnBox = (piece) => {
    const { bounds } = identify(piece.paths).silhouette;
    return {
      left: piece.tx + bounds.x,
      right: piece.tx + bounds.x + bounds.width,
      top: piece.ty + bounds.y,
      bottom: piece.ty + bounds.y + bounds.height,
      centre: piece.tx + bounds.x + bounds.width / 2,
    };
  };
  const columns = boards[0].pieces.map((piece) => drawnBox(piece).centre);

  for (const board of boards) {
    const [minX, minY, width, height] = board.viewBox;
    const boxes = board.pieces.map(drawnBox);
    boxes.forEach((box, index) => {
      const piece = board.pieces[index];
      const where = `landing.html line ${board.line}, column ${piece.column} (${identify(piece.paths).silhouette.id})`;
      assert.equal(box.centre, columns[index],
        `${where} is centred at ${box.centre}, the column sits at ${columns[index]}; ${regenerate}`);
      assert.ok(box.left >= minX && box.right <= minX + width && box.top >= minY && box.bottom <= minY + height,
        `${where} leaves the board's viewBox; ${regenerate}`);
      if (index > 0) {
        assert.ok(boxes[index - 1].right < box.left,
          `${where} overlaps the piece to its left; ${regenerate}`);
      }
    });
  }
});
