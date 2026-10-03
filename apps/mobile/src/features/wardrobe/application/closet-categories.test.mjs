import assert from 'node:assert/strict';
import test from 'node:test';

import {
  resolveDefaultClosetCategory,
  splitClosetByEntryState,
  summarizeClosetCategories,
} from './closet-categories.ts';
import { structuralCategories } from '../../catalog/domain/garment-taxonomy.ts';

const [first, second] = structuralCategories;
const item = (id, category, entryState, createdAt) => ({ id, category, entryState, createdAt });
const items = [
  item('a', first, 'owned', '2026-01-01T00:00:00.000Z'),
  item('b', first, 'wanted', '2026-03-01T00:00:00.000Z'),
  item('c', first, 'owned', '2026-02-01T00:00:00.000Z'),
  item('d', second, 'wanted', '2026-01-05T00:00:00.000Z'),
];

test('a summary counts owned plus wanted and draws the newest owned piece', () => {
  const summary = summarizeClosetCategories(items);
  assert.deepEqual(
    { count: summary[first].count, wanted: summary[first].wanted, newest: summary[first].newest.id },
    { count: 3, wanted: 1, newest: 'c' },
  );
});

test('a category holding only wanted pieces draws its newest wanted one', () => {
  const summary = summarizeClosetCategories(items);
  assert.deepEqual(
    { count: summary[second].count, wanted: summary[second].wanted, newest: summary[second].newest.id },
    { count: 1, wanted: 1, newest: 'd' },
  );
});

test('an empty category is zero with no drawing, and every category has a summary', () => {
  const summary = summarizeClosetCategories([]);
  for (const category of structuralCategories) {
    assert.deepEqual(summary[category], { count: 0, wanted: 0, newest: null });
  }
});

test('a cell count equals the Closet chip count of the same category for every category', () => {
  const summary = summarizeClosetCategories(items);
  for (const category of structuralCategories) {
    const chip = items.filter((entry) => entry.category === category).length;
    assert.equal(summary[category].count, chip);
  }
});

test('the split is owned then wanted, each newest first, without touching the input', () => {
  const before = items.map(({ id }) => id);
  const { owned, wanted } = splitClosetByEntryState(items);
  assert.deepEqual(owned.map(({ id }) => id), ['c', 'a']);
  assert.deepEqual(wanted.map(({ id }) => id), ['b', 'd']);
  assert.deepEqual(items.map(({ id }) => id), before);
});

test('the default category is the first holding a wanted piece when revealed, else the first holding anything', () => {
  assert.equal(resolveDefaultClosetCategory(items, true), first);
  assert.equal(resolveDefaultClosetCategory([items[3]], true), second);
  assert.equal(resolveDefaultClosetCategory([items[3]], false), second);
  assert.equal(resolveDefaultClosetCategory([items[0]], true), first);
  assert.equal(resolveDefaultClosetCategory([], true), structuralCategories[0]);
  assert.equal(resolveDefaultClosetCategory([items[3]], false, [first]), first);
});
