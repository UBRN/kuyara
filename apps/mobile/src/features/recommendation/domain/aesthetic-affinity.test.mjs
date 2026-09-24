import assert from 'node:assert/strict';
import test from 'node:test';

import { outfitArchetypeIds } from '@kuyara/contracts';
import { archetypeAesthetics, sortByAestheticAffinity } from './aesthetic-affinity.ts';

test('affinity covers all twelve archetypes and stable sorting never excludes options', () => {
  assert.deepEqual(Object.keys(archetypeAesthetics).sort(), [...outfitArchetypeIds].sort());
  const options = [
    { id: 'first', archetype: 'everyday_easy' },
    { id: 'second', archetype: 'office_ready' },
    { id: 'third', archetype: 'smart_casual' },
    { id: 'fourth', archetype: 'on_the_move' },
  ];
  const matches = (option, id) => option.archetype === id;
  assert.equal(sortByAestheticAffinity(options, [], matches), options);
  const sorted = sortByAestheticAffinity(options, ['classic'], matches);
  assert.deepEqual(sorted.map(({ id }) => id), ['second', 'third', 'first', 'fourth']);
  assert.equal(new Set(sorted.map(({ id }) => id)).size, options.length);
});
