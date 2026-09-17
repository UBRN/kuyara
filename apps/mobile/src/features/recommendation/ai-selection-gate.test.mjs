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
  archetypeDayFromRequirements,
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
 * repair: whatever it answers for that triple, both gates refuse it. The day comes from the
 * request's own requirements, the same way the prompt's eligibility lists are projected, so
 * these are the labels the model is actually offered.
 */
function wellFormedPicks(options, dayKind, day) {
  const eligible = options.map((option) =>
    outfitArchetypeIds.filter((archetypeId) =>
      meetsArchetypePrecondition(archetypeId, option, dayKind, day)));
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

test('T1a the hot-weather pool is the narrowest one, with a single option of margin', () => {
  // Measured on 2026-09-16 at catalog version 5: hot weather composes exactly four options
  // for either clothing preference, one above the three `aiRequestFromContext` needs. Two
  // options fewer in the pool, or one requirement stricter, closes the AI tier for hot days
  // entirely and every hot day answers "Standard suggestions".
  for (const cell of gridRequestCells().filter(({ weatherKey }) => weatherKey === 'hot')) {
    assert.equal(cell.context.options.length, 4, cell.name);
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
  // A day that derives no requirement at all is still an AI day: the pool decides, the
  // weather does not.
  assert.notEqual(aiRequestFromContext({ ...context, requirements: [] }), null);
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
  let unlabelable = 0;
  for (const cell of gridRequestCells()) {
    const { request, context } = cell;
    for (const indices of sampleIndexTriples(request.options.length, triplesPerCell)) {
      const options = indices.map((index) => request.options[index]);
      // A triple whose three options share fewer than three archetype labels has no valid
      // answer at all: whatever the model replies, both gates refuse it and the day falls
      // back to "Standard suggestions".
      const picks = wellFormedPicks(
        options, request.dayKind, archetypeDayFromRequirements(request.requirements),
      );
      // The archetype vocabulary is closed by the shipped response enum, and a plain casual
      // outfit without sneakers or layers holds only two labels, so a triple of those has no
      // three-label answer. The prompt directs the model to three different labels from the
      // eligible lists, so it steers away from such triples; one it still picks is refused
      // and the day falls back. Such triples must stay rare in the offered pools.
      if (!picks) {
        unlabelable += 1;
        continue;
      }

      // The Worker handler's four checks (apps/worker/src/ai/ai-handler.ts): the shared
      // success schema, the closed set of offered option ids, the shared distinctness rule
      // and the shared archetype precondition. The schema and the two rules live in
      // packages/contracts and are called here directly; the option ids are offered by
      // construction. The handler reads the day out of the request's requirements before it
      // checks the precondition, exactly as this does, so the labels checked here are the
      // ones the prompt's eligibility lists offer and the two gates refuse the same answers.
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
  assert.ok(
    unlabelable <= (accepted + unlabelable) * 0.01,
    `${unlabelable} of ${accepted + unlabelable} sampled triples have no three distinct labels`,
  );
});

test('T2 the mobile gate refuses every answer shape the Worker gate refuses', () => {
  for (const cell of gridRequestCells()) {
    const { request } = cell;
    const options = request.options.slice(0, 3);
    const picks = wellFormedPicks(
      options, request.dayKind, archetypeDayFromRequirements(request.requirements),
    );
    const refused = [
      ['an option id that was never offered',
        [{ ...picks[0], optionId: 'not-offered' }, picks[1], picks[2]]],
      ['the same option picked twice', [picks[0], { ...picks[1], optionId: picks[0].optionId }, picks[2]]],
      ['the same archetype used twice', [picks[0], { ...picks[1], archetypeId: picks[0].archetypeId }, picks[2]]],
      ['two picks instead of three', [picks[0], picks[1]]],
    ];
    const failingArchetype = outfitArchetypeIds.find((candidate) =>
      !meetsArchetypePrecondition(candidate, options[0], request.dayKind) &&
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
            request.dayKind,
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

test('T3 outfitMatchesArchetype (application/recommend-outfits.ts) equals meetsArchetypePrecondition (contracts ai-model-input.ts), day-blind and day-aware', () => {
  // A4/B5: the two twins used to be compared without a day, so the `office_ready` and
  // `on_the_move` branches that only differ when a `dayKind` is present, and the three
  // weather branches that only differ when the day is, could drift unseen. Every caller
  // shape is compared here instead: the day-blind one builds 8 and 9 are, a caller that
  // sends only the day kind, and the day-aware one this app is on both day kinds.
  const smartCells = new Map(gridRequestCells()
    .filter(({ dressStyle }) => dressStyle === 'smart')
    .map((cell) => [`${cell.clothingPreference}/${cell.weatherKey}`, cell]));
  let comparisons = 0;
  for (const cell of gridOutfitCells()) {
    const day = archetypeDayFromRequirements(smartCells.get(cell.name).context.requirements);
    const callers = [
      ['day-blind', undefined, undefined],
      ['weekday without the weather', 'weekday', undefined],
      ['weekday', 'weekday', day],
      ['weekend', 'weekend', day],
    ];
    const options = new Map(cell.options.map((option) => [option.optionId, option]));
    assert.equal(cell.outfits.length, cell.options.length, cell.name);
    for (const outfit of cell.outfits) {
      const option = options.get(outfitOptionId(outfit));
      assert.ok(option, `${cell.name} composed an outfit the request does not offer`);
      for (const archetypeId of outfitArchetypeIds) {
        for (const [caller, dayKind, dayFacts] of callers) {
          assert.equal(
            outfitMatchesArchetype(outfit, archetypeId, dayKind, dayFacts),
            meetsArchetypePrecondition(archetypeId, option, dayKind, dayFacts),
            `${cell.name} ${option.optionId} ${archetypeId} ${caller}`,
          );
          comparisons += 1;
        }
        // The subset rule the deploy order rests on: at one day kind, knowing the day only
        // ever withdraws a label. An installed build validates the Worker's picks with the
        // day-blind predicate, so a narrower offer never hands it a pick it refuses.
        for (const dayKind of [undefined, 'weekday', 'weekend']) {
          assert.ok(
            !meetsArchetypePrecondition(archetypeId, option, dayKind, day)
            || meetsArchetypePrecondition(archetypeId, option, dayKind),
            `${cell.name} ${option.optionId} ${archetypeId} widened when the day was read`,
          );
        }
      }
    }
  }
  assert.ok(comparisons > 1000, `only ${comparisons} archetype decisions were compared`);
});
