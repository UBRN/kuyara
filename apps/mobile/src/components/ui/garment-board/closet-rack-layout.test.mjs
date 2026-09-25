import assert from 'node:assert/strict';
import test from 'node:test';

import {
  layoutClosetRack,
  RACK_LOWER_RAIL_Y,
  RACK_SHELF_Y,
  RACK_WIDTH,
} from './closet-rack-layout.ts';

// O9's fill rule, checked without a renderer: every piece is drawn once, the newest owned
// pieces face out, wanted pieces hang last, a zone that overflows says so, and no zone runs
// into the next one.
const typeOf = { top: 't_shirt', bottom: 'jeans', one_piece: 'dress', outerwear: 'coat', footwear: 'sneakers', accessory: 'beanie' };

let serial = 0;
function piece(category, overrides = {}) {
  serial += 1;
  return {
    id: `${category}-${serial}`,
    garmentTypeId: typeOf[category],
    category,
    colorFamily: null,
    wanted: false,
    addedAt: serial,
    lightness: (serial % 10) / 10,
    ...overrides,
  };
}
const many = (category, count, overrides) => Array.from({ length: count }, () => piece(category, overrides));

const garments = (layout) => layout.marks.filter((mark) => mark.kind === 'garment');
const slices = (layout) => layout.marks.filter((mark) => mark.kind === 'slice');
const hangers = (layout) => layout.marks.filter((mark) => mark.kind === 'hanger');
const drawnIds = (layout) => [...garments(layout), ...slices(layout)].map((mark) => mark.piece.id);
const bottomOf = (mark) => mark.y + (mark.silhouette.bounds.y + mark.silhouette.bounds.height) * mark.scale;

test('the bare rack has no hangers, and the empty Closet has bare hangers on both rails', () => {
  assert.deepEqual(layoutClosetRack(null), { marks: [], tags: [] });

  const empty = layoutClosetRack([]);
  assert.equal(garments(empty).length, 0);
  assert.equal(hangers(empty).length, 5);
  assert.ok(hangers(empty).every((mark) => mark.empty));
  assert.deepEqual(empty.tags, []);
});

test('a sparse Closet hangs every piece face-out with empty hangers waiting after it', () => {
  const layout = layoutClosetRack([piece('top'), piece('bottom'), piece('footwear')]);
  assert.equal(garments(layout).length, 3);
  assert.equal(slices(layout).length, 0);
  // One carrying hanger per rail piece, two waiting after each.
  assert.equal(hangers(layout).filter((mark) => !mark.empty).length, 2);
  assert.equal(hangers(layout).filter((mark) => mark.empty).length, 4);
});

test('at 60 pieces every piece is drawn once, at most three face out per rail, with no "+N"', () => {
  const pieces = [
    ...many('outerwear', 8), ...many('one_piece', 5), ...many('top', 19), piece('top', { wanted: true }),
    ...many('bottom', 11), ...many('footwear', 9), ...many('accessory', 7),
  ];
  assert.equal(pieces.length, 60);
  const layout = layoutClosetRack(pieces);

  assert.deepEqual([...drawnIds(layout)].sort(), pieces.map((p) => p.id).sort());
  assert.deepEqual(layout.tags, []);
  const upperFaces = garments(layout).filter((mark) => ['outerwear', 'one_piece', 'top'].includes(mark.piece.category));
  const lowerFaces = garments(layout).filter((mark) => mark.piece.category === 'bottom');
  assert.ok(upperFaces.length >= 1 && upperFaces.length <= 3);
  assert.ok(lowerFaces.length >= 1 && lowerFaces.length <= 3);
  for (const mark of layout.marks) {
    if (mark.kind === 'garment') {
      assert.ok(mark.x >= 0 && mark.x + 64 * mark.scale <= RACK_WIDTH + 1, `${mark.piece.id} stays inside the frame`);
    }
  }
});

test('the newest owned pieces face out and wanted pieces hang last as slices', () => {
  const older = many('top', 20);
  const wanted = piece('top', { wanted: true, addedAt: 1000 });
  const newest = [piece('top', { addedAt: 500 }), piece('top', { addedAt: 501 })];
  const layout = layoutClosetRack([...older, wanted, ...newest]);

  const faceIds = garments(layout).map((mark) => mark.piece.id);
  // The newest owned piece faces out; a wanted piece never does, however new.
  assert.ok(faceIds.includes(newest[1].id));
  assert.ok(!faceIds.includes(wanted.id));
  const sliceIds = slices(layout).map((mark) => mark.piece.id);
  assert.equal(sliceIds.at(-1), wanted.id);
});

test('a rail past its slice minimum hangs a "+N" tag, and drawn plus hidden is the whole zone', () => {
  const layout = layoutClosetRack(many('top', 90));
  const [tag] = layout.tags;
  assert.ok(tag && tag.count > 0);
  assert.equal(drawnIds(layout).length + tag.count, 90);
});

test('accessories take one hook each and the last hook carries the overflow', () => {
  const layout = layoutClosetRack(many('accessory', 10));
  assert.equal(garments(layout).length, 7);
  assert.equal(layout.tags.length, 1);
  assert.equal(layout.tags[0].count, 3);
});

test('zones never touch: coats end above the lower rail and bottoms above the shelf', () => {
  const layout = layoutClosetRack([piece('outerwear'), piece('one_piece'), piece('bottom', { garmentTypeId: 'long_skirt' })]);
  for (const mark of garments(layout)) {
    const limit = mark.piece.category === 'bottom' ? RACK_SHELF_Y : RACK_LOWER_RAIL_Y;
    assert.ok(bottomOf(mark) < limit, `${mark.piece.id} ends at ${bottomOf(mark)}, above ${limit}`);
  }
});

test('a legacy piece with no type draws as its category glyph', () => {
  const layout = layoutClosetRack([piece('top', { garmentTypeId: null })]);
  assert.equal(garments(layout)[0].silhouette.id, 'g-cat-top');
});
