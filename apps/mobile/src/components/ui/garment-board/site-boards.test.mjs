import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { garmentBoardDressingOrder, todayPreset } from './compose-garment-board.ts';
import { garmentSilhouetteIds } from './garment-silhouette-map.ts';
import { generateSiteBoards, STAGE_UNITS } from '../../../../scripts/site-boards.mjs';

// The public site draws the app's own boards from data that apps/mobile/scripts/site-boards.mjs
// generates and the repository commits, because GitHub Pages runs no build step beyond
// Jekyll. This suite holds the committed files to the generator and every generated board
// to the board composition rule (docs/design/garment-board.md, ADR 0025).
const { data, files } = generateSiteBoards();
const root = new URL('../../../../../../', import.meta.url);
const regenerate = 'run apps/mobile/scripts/site-boards.mjs and commit what it writes';
const W = STAGE_UNITS;
const epsilon = 0.05;

test('the committed site board files are exactly what the generator writes', () => {
  for (const [path, content] of Object.entries(files)) {
    let committed = null;
    try { committed = readFileSync(new URL(path, root), 'utf8'); } catch { /* missing */ }
    assert.ok(committed === content, `${path} is stale or missing: ${regenerate}`);
  }
});

function boards() {
  const list = [];
  for (const [key, state] of Object.entries(data.states)) {
    list.push({ where: `${key} hero`, board: state.hero });
    state.options.forEach((board, index) => list.push({ where: `${key} option ${index + 1}`, board }));
  }
  for (const [preference, moments] of Object.entries(data.storyBoards)) {
    for (const moment of moments) list.push({ where: `story ${preference} ${moment.id}`, board: moment.board });
  }
  return list;
}

test('every site board draws a body core and footwear, two to five pieces, each from the drawing set', () => {
  for (const { where, board } of boards()) {
    const slots = board.pieces.map((piece) => piece.slot);
    const core = slots.includes('one_piece')
      ? !slots.includes('primary_top') && !slots.includes('bottom')
      : slots.includes('primary_top') && slots.includes('bottom');
    assert.ok(core, `${where}: the body core is ${slots.join(', ')}`);
    assert.ok(slots.includes('footwear'), `${where}: no footwear`);
    assert.ok(slots.length >= 2 && slots.length <= 5, `${where}: ${slots.length} pieces`);
    for (const piece of [...board.pieces, ...board.touches]) {
      assert.ok(garmentSilhouetteIds[piece.type] !== undefined, `${where}: ${piece.type} has no drawing`);
      for (const key of piece.art) assert.ok(data.art[key], `${where}: ${piece.type} art ${key} is missing`);
    }
  }
});

test('every site board is a worn board: dressing order, no piece touching another, nothing clipped', () => {
  for (const { where, board } of boards()) {
    const order = board.pieces.map((piece) => garmentBoardDressingOrder.indexOf(piece.slot));
    assert.deepEqual(order, [...order].sort((a, b) => a - b), `${where}: pieces out of dressing order`);
    const boxes = board.pieces.map((piece) => {
      const [x, y, w, h] = piece.box;
      return { slot: piece.slot, x, y, w, h };
    });
    for (const box of boxes) {
      assert.ok(box.x >= todayPreset.sideMin * W - epsilon && box.x + box.w <= W - todayPreset.sideMin * W + epsilon,
        `${where}: ${box.slot} comes inside the side minimum`);
      assert.ok(box.y >= -epsilon && box.y + box.h <= board.h + epsilon, `${where}: ${box.slot} leaves the stage`);
    }
    boxes.forEach((a, index) => boxes.slice(index + 1).forEach((b) => {
      const apart = a.x + a.w <= b.x + epsilon || b.x + b.w <= a.x + epsilon
        || a.y + a.h <= b.y + epsilon || b.y + b.h <= a.y + epsilon;
      assert.ok(apart, `${where}: ${a.slot} touches ${b.slot}`);
    }));
  }
});

test('every site board stage is 0.66 to 1.14 of its width and lands its ink centroid at 0.47 unless a side holds it', () => {
  for (const { where, board } of boards()) {
    assert.ok(board.h >= todayPreset.stageMin * W - epsilon && board.h <= todayPreset.stageMax * W + epsilon,
      `${where}: stage height ${board.h}`);
    const boxes = board.pieces.map(({ box: [x, y, w, h] }) => ({ x, w, h }));
    const area = boxes.reduce((sum, box) => sum + box.w * box.h, 0);
    const centroid = boxes.reduce((sum, box) => sum + box.w * box.h * (box.x + box.w / 2), 0) / area / W;
    const left = Math.min(...boxes.map((box) => box.x)) / W;
    const right = Math.max(...boxes.map((box) => box.x + box.w)) / W;
    const held = Math.abs(left - todayPreset.sideMin) < 0.002 || Math.abs(1 - right - todayPreset.sideMin) < 0.002;
    assert.ok(held || Math.abs(centroid - todayPreset.centroid) < 0.002, `${where}: centroid ${centroid}`);
  }
});

test('the site covers both catalogues and every sky the hero offers, at every temperature step', () => {
  for (const preference of ['womens', 'mens']) {
    for (const [sky, { range }] of Object.entries(data.skies)) {
      for (let t = range[0]; t <= range[1]; t += data.step) {
        const state = data.states[`${preference}|${sky}|${t}`];
        assert.ok(state, `${preference} ${sky} ${t} has no board`);
        assert.equal(state.options.length, state.archetypes.length);
        assert.ok(state.options.length >= 1 && state.options.length <= 3);
      }
    }
  }
});
