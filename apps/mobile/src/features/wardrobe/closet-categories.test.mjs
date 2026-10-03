import assert from 'node:assert/strict';
import test from 'node:test';

import { structuralCategories } from '../catalog/domain/garment-taxonomy.ts';
import {
  resolveVisibleCategory,
  visibleClosetCategories,
} from './application/closet-categories.ts';

const piece = (category) => ({ category });
const withoutOnePiece = structuralCategories.filter((category) => category !== 'one_piece');

test('a mens profile with no one-piece record hides the One-piece category', () => {
  assert.deepEqual(visibleClosetCategories('mens', [piece('top')]), withoutOnePiece);
});

test('a recorded one-piece item keeps its category visible, in catalogue order', () => {
  assert.deepEqual(
    visibleClosetCategories('mens', [piece('one_piece')]),
    structuralCategories,
  );
});

test('womens and no preference show every category', () => {
  assert.deepEqual(visibleClosetCategories('womens', []), structuralCategories);
  assert.deepEqual(visibleClosetCategories(null, []), structuralCategories);
});

test('a hidden or missing category resolves to the first visible one', () => {
  assert.equal(resolveVisibleCategory(withoutOnePiece, 'one_piece'), 'top');
  assert.equal(resolveVisibleCategory(withoutOnePiece, 'outerwear'), 'outerwear');
  assert.equal(resolveVisibleCategory(withoutOnePiece, undefined), undefined);
});
