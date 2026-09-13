// The roads to the deterministic "Standard suggestions" fallback, locked against real
// engine output rather than hand-written option sets.
//
// Three of them are checked here:
//   1. a candidate pool too small for the AI tier to be offered at all;
//   2. the mobile validation gate refusing an answer the Worker's own gate would accept,
//      or accepting one it would refuse;
//   3. the archetype rule drifting between the mobile domain and the shared contract.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  meetsArchetypePrecondition,
  outfitArchetypeIds,
  picksAreMeaningfullyDifferent,
  aiRecommendV1SuccessSchema,
} from '@kuyara/contracts';

import { outfitMatchesArchetype, outfitOptionId } from './application/recommend-outfits.ts';
import {
  aiRequestFromContext,
  createAiRecommendationRequest,
  mapStoredRecommendation,
  mapWorkerAiRecommendation,
  toStoredRecommendationOutfits,
  WorkerAiRecommendationMappingError,
} from './data/worker-ai-recommendation-mapper.ts';
import {
  gridOutfitCells,
  gridRecommendationInput,
  gridRequestCells,
  sampleIndexTriples,
} from '../../../test/recommendation-grid.mjs';

// Enough triples per cell to cross body cores, layer counts and formality levels without
// enumerating C(24,3); the sample is a fixed stride, so every run walks the same triples.
const triplesPerCell = 150;

/**
 * The answer a compliant model gives for one triple: three distinct archetype labels, each
 * one its own option qualifies for. Null when no such labelling exists, which no model can
 * repair: whatever it answers for that triple, both gates refuse it.
 */
function wellFormedPicks(options) {
  const eligible = options.map((option) =>
    outfitArchetypeIds.filter((archetypeId) =>
      meetsArchetypePrecondition(archetypeId, option)));
  for (const first of eligible[0]) {
    for (const second of eligible[1]) {
      if (second === first) continue;
      for (const third of eligible[2]) {
        if (third === first || third === second) continue;
        return [first, second, third].map((archetypeId, index) => ({
          optionId: options[index].optionId,
          archetypeId,
        }));
      }
    }
  }
  return null;
}

test('T1a every grid cell offers the AI tier a pool of at least three options', () => {
  for (const cell of gridRequestCells()) {
    assert.ok(
      cell.context.requirements.length > 0,
      `${cell.name} derived no clothing requirement`,
    );
    assert.ok(
      cell.context.options.length >= 3,
      `${cell.name} composed ${cell.context.options.length} options`,
    );
    assert.notEqual(cell.request, null, `${cell.name} built no AI request`);
    assert.equal(cell.request.options.length, cell.context.options.length);
    assert.equal(cell.request.clothingPreference, cell.clothingPreference);
    assert.equal(cell.request.dressStyle, cell.dressStyle);
  }
});

test('T1a the hot-weather pool is exactly three, so the AI tier has no margin left', () => {
  // Measured on 2026-09-13: hot weather composes exactly three options for either clothing
  // preference. One garment fewer in the catalog, or one requirement stricter, closes the
  // AI tier for hot days entirely and every hot day answers "Standard suggestions".
  for (const cell of gridRequestCells().filter(({ weatherKey }) => weatherKey === 'hot')) {
    assert.equal(cell.context.options.length, 3, cell.name);
  }
});

test('T1a createAiRecommendationRequest agrees with the controller\'s two-step build', () => {
  const cell = gridRequestCells()[0];
  assert.deepEqual(
    createAiRecommendationRequest(
      gridRecommendationInput(cell.weatherKey, cell.clothingPreference, cell.dressStyle),
    ),
    cell.request,
  );
});

test('T1b a pool below three options offers no AI request at all', () => {
  const { context } = gridRequestCells().find(({ weatherKey }) => weatherKey === 'mild');
  for (const count of [0, 1, 2]) {
    assert.equal(
      aiRequestFromContext({ ...context, options: context.options.slice(0, count) }),
      null,
      `${count} options`,
    );
  }
  assert.notEqual(aiRequestFromContext({ ...context, options: context.options.slice(0, 3) }), null);
  assert.equal(aiRequestFromContext({ ...context, requirements: [] }), null);
});

test('T2 every pair of offered options is meaningfully different, so the shared distinctness rule never splits the two gates', () => {
  for (const cell of gridRequestCells()) {
    const { options } = cell.request;
    for (let left = 0; left < options.length; left += 1) {
      for (let right = left + 1; right < options.length; right += 1) {
        assert.ok(
          picksAreMeaningfullyDifferent([options[left], options[right]]),
          `${cell.name} offers the near-duplicate pair ${options[left].optionId} / ${options[right].optionId}`,
        );
      }
    }
  }
});

test('T2 the mobile gate accepts every answer the Worker gate accepts, and the accepted answer survives persistence', () => {
  let accepted = 0;
  for (const cell of gridRequestCells()) {
    const { request, context } = cell;
    for (const indices of sampleIndexTriples(request.options.length, triplesPerCell)) {
      const options = indices.map((index) => request.options[index]);
      // A triple whose three options share fewer than three archetype labels has no valid
      // answer at all: whatever the model replies, both gates refuse it and the day falls
      // back to "Standard suggestions".
      const picks = wellFormedPicks(options);
      assert.ok(picks, `${cell.name} ${indices} has no three distinct archetype labels`);

      // The Worker handler's four checks (apps/worker/src/ai/ai-handler.ts): the shared
      // success schema, the closed set of offered option ids, the shared distinctness rule
      // and the shared archetype precondition. The schema and the two rules live in
      // packages/contracts and are called here directly; the option ids are offered by
      // construction.
      assert.equal(aiRecommendV1SuccessSchema.safeParse({ data: { picks } }).success, true);
      assert.equal(picksAreMeaningfullyDifferent(options), true);

      accepted += 1;
      const recommendation = mapWorkerAiRecommendation(request, { picks });
      assert.deepEqual(
        recommendation.outfits.map(({ optionId, archetypeId }) => ({ optionId, archetypeId })),
        picks,
        `${cell.name} ${indices}`,
      );
      assert.equal(recommendation.generationMode, 'ai-assisted');

      // The second gate: `saveSnapshot` stores the outfits and reads them back through the
      // same rebuild, so an answer the first gate accepted must not be lost on the way to
      // or from the database.
      const restored = mapStoredRecommendation(
        context,
        toStoredRecommendationOutfits(recommendation),
        'ai-assisted',
      );
      assert.deepEqual(
        restored.outfits.map(({ optionId, archetypeId }) => ({ optionId, archetypeId })),
        picks,
        `${cell.name} ${indices} did not survive the persistence round trip`,
      );
    }
  }
  assert.ok(accepted > 1000, `only ${accepted} answers were checked`);
});

test('T2 the mobile gate refuses every answer shape the Worker gate refuses', () => {
  for (const cell of gridRequestCells()) {
    const { request } = cell;
    const options = request.options.slice(0, 3);
    const picks = wellFormedPicks(options);
    const refused = [
      ['an option id that was never offered',
        [{ ...picks[0], optionId: 'not-offered' }, picks[1], picks[2]]],
      ['the same option picked twice', [picks[0], { ...picks[1], optionId: picks[0].optionId }, picks[2]]],
      ['the same archetype used twice', [picks[0], { ...picks[1], archetypeId: picks[0].archetypeId }, picks[2]]],
      ['two picks instead of three', [picks[0], picks[1]]],
    ];
    const failingArchetype = outfitArchetypeIds.find((candidate) =>
      !meetsArchetypePrecondition(candidate, options[0]) &&
      !picks.some(({ archetypeId }) => archetypeId === candidate));
    if (failingArchetype) {
      refused.push(['an archetype its own option does not qualify for',
        [{ ...picks[0], archetypeId: failingArchetype }, picks[1], picks[2]]]);
    }
    for (const [reason, invalid] of refused) {
      assert.equal(
        aiRecommendV1SuccessSchema.safeParse({ data: { picks: invalid } }).success &&
          invalid.every(({ optionId }) => request.options.some((option) => option.optionId === optionId)) &&
          invalid.every(({ optionId, archetypeId }) => meetsArchetypePrecondition(
            archetypeId,
            request.options.find((option) => option.optionId === optionId),
          )),
        false,
        `${cell.name}: the Worker would accept ${reason}`,
      );
      assert.throws(
        () => mapWorkerAiRecommendation(request, { picks: invalid }),
        WorkerAiRecommendationMappingError,
        `${cell.name}: the mobile gate accepted ${reason}`,
      );
    }
  }
});

test('T3 outfitMatchesArchetype (application/recommend-outfits.ts) equals meetsArchetypePrecondition (contracts ai-model-input.ts)', () => {
  let comparisons = 0;
  for (const cell of gridOutfitCells()) {
    const options = new Map(cell.options.map((option) => [option.optionId, option]));
    assert.equal(cell.outfits.length, cell.options.length, cell.name);
    for (const outfit of cell.outfits) {
      const option = options.get(outfitOptionId(outfit));
      assert.ok(option, `${cell.name} composed an outfit the request does not offer`);
      for (const archetypeId of outfitArchetypeIds) {
        assert.equal(
          outfitMatchesArchetype(outfit, archetypeId),
          meetsArchetypePrecondition(archetypeId, option),
          `${cell.name} ${option.optionId} ${archetypeId}`,
        );
        comparisons += 1;
      }
    }
  }
  assert.ok(comparisons > 1000, `only ${comparisons} archetype decisions were compared`);
});
