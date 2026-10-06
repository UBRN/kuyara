import assert from 'node:assert/strict';
import test from 'node:test';

import { garmentFillRoles } from './garment-palette.ts';
import { paintGarment } from './garment-paint.ts';
import { silhouettes } from './silhouettes.ts';

const ink = '#142F3B';
const nodes = (tree) => [tree, ...(tree.children ?? []).flatMap(nodes)];
const paint = (silhouette, extra = {}) => paintGarment({
  silhouette, roles: garmentFillRoles(silhouette.id, '#5A7DA7', 'light'), ink, scale: 2, lod: 'full', uid: 'u', ...extra,
});

// The Closet grid draws many tiles and the swap strip many thumbnails: every drawing keeps a
// bounded element count, so the illustration never makes a scroll heavy. The modelled
// drawings average about 61 elements (the flatter set averaged 31); the leather jacket, with
// its diagonal zip, studded lapels, zipped pockets and belt, is the heaviest at 97.
const NODE_BUDGET = 100;

test('every drawing stays within its element budget, and a caption draws fewer', () => {
  for (const silhouette of Object.values(silhouettes)) {
    const full = nodes(paint(silhouette)).length;
    const caption = nodes(paint(silhouette, { lod: 'caption' })).length;
    assert.ok(full <= NODE_BUDGET, `${silhouette.id} ${full}`);
    assert.ok(caption <= full, silhouette.id);
  }
});

// Light and shade come from the piece's own colour: every paint is one of its roles, the ink,
// or a gradient or clip of the drawing's own.
test('a drawing paints only its own roles, the ink and its own gradients', () => {
  for (const silhouette of Object.values(silhouettes)) {
    const roles = garmentFillRoles(silhouette.id, '#C26A46', 'dark');
    const allowed = new Set([...Object.values(roles), ink, 'none']);
    for (const node of nodes(paint(silhouette, { roles }))) {
      for (const key of ['fill', 'stroke', 'stopColor']) {
        const value = node.attrs[key];
        if (value === undefined) continue;
        assert.ok(allowed.has(value) || /^url\(#u-/.test(value), `${silhouette.id} ${key} ${value}`);
      }
    }
  }
});

test('plain surfaces are lit and woven, a pattern keeps its own paint, and a caption drops the weave', () => {
  const jeans = silhouettes['g-jeans'];
  const lit = (tree) => nodes(tree).filter((node) => node.tag === 'Rect' && /-lit-/.test(node.attrs.fill));
  const woven = (tree) => nodes(tree).filter((node) => node.tag === 'Path' && node.attrs.strokeWidth === 0.45 / 2);
  assert.equal(lit(paint(jeans)).length, 1);
  assert.equal(woven(paint(jeans)).length, 1);
  assert.equal(woven(paint(jeans, { lod: 'caption' })).length, 0);
  assert.equal(lit(paint(jeans, { mainPaint: 'url(#pattern)' })).length, 0);
  assert.equal(nodes(paint(jeans, { layer: 'outline' })).filter((node) => node.tag === 'Rect').length, 0);
});

// Every surface is modelled in its own deepest tone: stepped bands inside the outline turn
// the form at its edge, and a caption keeps one band so a 16-point drawing still reads round.
test('every main surface turns at its edge in its own deep tone, and a caption keeps one band', () => {
  for (const silhouette of Object.values(silhouettes)) {
    const roles = garmentFillRoles(silhouette.id, '#C26A46', 'light');
    const bands = (tree) => nodes(tree).filter((node) => node.tag === 'Path' && node.attrs.stroke === roles.deep
      && silhouette.groups.some((group) => group.fill === 'main' && group.outline === node.attrs.d));
    assert.ok(bands(paint(silhouette, { roles })).length >= 2, silhouette.id);
    assert.equal(bands(paint(silhouette, { roles, lod: 'caption' })).length,
      silhouette.groups.filter((group) => group.fill === 'main').length, silhouette.id);
  }
});

// The modelling sizes each part from its outline's absolute coordinates; an outline it cannot
// measure takes the drawing's bounds, so its edge bands and every stroke width stay finite.
test('an outline the size reader cannot measure is modelled at the size of its drawing', () => {
  const silhouette = {
    id: 'unmeasurable', viewBox: 64,
    groups: [{ outline: 'M10 10 L40 10 L40 40 L10 40 Z', fill: 'main', parts: [] }, { outline: 'Z', fill: 'main', parts: [] }],
    bounds: { x: 10, y: 10, width: 30, height: 30 },
  };
  const roles = garmentFillRoles('g-tee', '#5A7DA7', 'light');
  const tree = paint(silhouette, { roles });
  const bands = (d) => nodes(tree).filter((node) => node.attrs.d === d && node.attrs.stroke === roles.deep).length;
  assert.equal(bands('Z'), bands('M10 10 L40 10 L40 40 L10 40 Z'));
  for (const node of nodes(tree)) {
    const width = node.attrs.strokeWidth;
    if (width !== undefined) assert.ok(Number.isFinite(width), `${node.tag} ${width}`);
  }
});
