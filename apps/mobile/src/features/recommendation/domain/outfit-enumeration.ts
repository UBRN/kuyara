import {
  compareGarmentEligibilityResults,
  type EligibleGarmentResult,
  type GarmentEligibilityResult,
} from '@/features/recommendation/domain/garment-eligibility';
import {
  bodyPiecesOf,
  bodySideOf,
  compositionKeyOf,
  draftEvaluations,
  findEvaluation,
  formalityRankOf,
  formalitySpreadFits,
  judgeDraft,
  layeringOrderFits,
  meetsRequirement,
  optionalLayerCount,
  type BodyCore,
  type BodyPieces,
  type JudgedDraft,
} from '@/features/recommendation/domain/outfit-evaluation';
import {
  cloneRequirement,
  compareStrings,
  outfitCompositionFailureCodes,
  type OutfitCandidate,
  type OutfitCompositionFailure,
  type OutfitCompositionFailureCode,
  type OutfitRequirementBestEvidence,
} from '@/features/recommendation/domain/outfit-model';
import {
  outfitSlots,
  slotAccepts,
  type OutfitSlot,
} from '@/features/recommendation/domain/outfit-slots';
import {
  bodyClothingRequirements,
  requirementKey,
  type BodyClothingRequirement,
  type BodyClothingRequirements,
  type ClothingRequirements,
} from '@/features/recommendation/domain/weather-to-clothing-requirements';
import { uniqueInRankOrder } from '@/features/recommendation/domain/rank-order';

// The day's drafts: the eligible candidates by slot, every body, layer and shoe paired in
// enumeration order, the valid ones judged and sorted best first, and the failure of a day
// that composes nothing.

const failureOrder = new Map(
  outfitCompositionFailureCodes.map((code, index) => [code, index]),
);

const slotOrder = new Map(outfitSlots.map((slot, index) => [slot, index]));

/**
 * The comparator's own inputs, read once per draft instead of once per comparison. A mild
 * day composes tens of thousands of valid drafts, so the sort asks for these hundreds of
 * thousands of times.
 */
type DraftSortKey = {
  readonly draft: JudgedDraft;
  readonly layers: number;
  digest?: number;
};

/**
 * A stable 32-bit FNV-1a digest of a composition key. The comparator requests it only
 * when score, penalties, layer count and slot scores all tie.
 */
function compositionKeyDigest(key: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < key.length; index += 1) {
    hash = Math.imul(hash ^ key.charCodeAt(index), 0x01000193);
  }
  return hash >>> 0;
}

/** Each slot's eligibility score in slot order, the shoe last, compared only between drafts of one body kind. */
function compareSlotScores(left: JudgedDraft, right: JudgedDraft): number {
  for (let index = 0; index < left.side.slotScores.length; index += 1) {
    const groupOrder = right.side.slotScores[index]! - left.side.slotScores[index]!;
    if (groupOrder !== 0) {
      return groupOrder;
    }
  }
  return right.footwear.score - left.footwear.score;
}

function compareDraftSortKeys(left: DraftSortKey, right: DraftSortKey): number {
  const scoreOrder = right.draft.score.score - left.draft.score.score;
  if (scoreOrder !== 0) {
    return scoreOrder;
  }
  const penaltyOrder = left.draft.score.penaltyPoints - right.draft.score.penaltyPoints;
  if (penaltyOrder !== 0) {
    return penaltyOrder;
  }
  const layerOrder = left.layers - right.layers;
  if (layerOrder !== 0) {
    return layerOrder;
  }

  if (left.draft.side.body.kind === right.draft.side.body.kind) {
    const slotOrder = compareSlotScores(left.draft, right.draft);
    if (slotOrder !== 0) {
      return slotOrder;
    }
  }

  // Last resort, and the one place where nothing about the day separates two arrangements.
  // Comparing the keys themselves made the alphabet decide: `catalog:loafers` beat
  // `catalog:sneakers` in every arrangement they both fit, so one shoe led every body core
  // and sneakers reached 6 of the 1512 shown outfits the grid measures. The digest keeps the
  // order deterministic and total while taking the garment's name out of it, and the key
  // itself settles the rare collision so the comparator stays a strict weak ordering.
  const digestOrder = (left.digest ??= compositionKeyDigest(left.draft.compositionKey)) -
    (right.digest ??= compositionKeyDigest(right.draft.compositionKey));
  return digestOrder !== 0
    ? digestOrder
    : compareStrings(left.draft.compositionKey, right.draft.compositionKey);
}

function sortedDrafts(drafts: readonly JudgedDraft[]): readonly JudgedDraft[] {
  return drafts
    .map((draft) => ({ draft, layers: optionalLayerCount(draft) }))
    .sort(compareDraftSortKeys)
    .map(({ draft }) => draft);
}

function failureCodeForRequirement(
  requirement: BodyClothingRequirement,
): OutfitCompositionFailureCode {
  switch (requirement.kind) {
    case 'thermal':
      return 'mandatory_thermal_unmet';
    case 'breathability':
      return 'mandatory_breathability_unmet';
    case 'arm_coverage':
      return 'mandatory_arm_coverage_unmet';
    case 'leg_coverage':
      return 'mandatory_leg_coverage_unmet';
    case 'water_protection':
      return requirement.target === 'body'
        ? 'mandatory_body_water_unmet'
        : 'mandatory_feet_water_unmet';
    case 'wind_protection':
      return 'mandatory_wind_unmet';
    case 'traction':
      return 'mandatory_traction_unmet';
  }
}

function bestEvidence(
  requirements: readonly BodyClothingRequirement[],
  candidates: readonly Pick<OutfitCandidate, 'requirementEvaluations' | 'compositionKey'>[],
): readonly OutfitRequirementBestEvidence[] {
  return Object.freeze(requirements.map((requirement) => {
    let bestContribution = 0;
    let bestObservedContribution = 0;
    let bestCompositionKey: string | null = null;
    const key = requirementKey(requirement);

    for (const candidate of candidates) {
      const evaluation = candidate.requirementEvaluations.find(
        ({ requirement: evaluated }) => requirementKey(evaluated) === key,
      );
      if (!evaluation) {
        continue;
      }

      const isBetter = evaluation.contribution > bestContribution ||
        (evaluation.contribution === bestContribution &&
          evaluation.observedContribution > bestObservedContribution) ||
        (evaluation.contribution === bestContribution &&
          evaluation.observedContribution === bestObservedContribution &&
          (bestCompositionKey === null ||
            compareStrings(candidate.compositionKey, bestCompositionKey) < 0));
      if (isBetter) {
        bestContribution = evaluation.contribution;
        bestObservedContribution = evaluation.observedContribution;
        bestCompositionKey = candidate.compositionKey;
      }
    }

    return Object.freeze({
      requirement: cloneRequirement(requirement),
      bestContribution,
      bestObservedContribution,
      compositionKey: bestCompositionKey,
      reasonCodes: Object.freeze([...requirement.reasonCodes]),
    });
  }));
}

function failureResult(
  reasonCodes: Iterable<OutfitCompositionFailureCode>,
  missingSlots: Iterable<OutfitSlot>,
  unmetRequirements: readonly BodyClothingRequirement[],
  evidence: readonly OutfitRequirementBestEvidence[],
  consideredCandidateKeys: readonly string[],
): OutfitCompositionFailure {
  return Object.freeze({
    status: 'failure',
    reasonCodes: uniqueInRankOrder<OutfitCompositionFailureCode>([
      ...reasonCodes,
      'no_valid_composition',
    ], failureOrder),
    missingSlots: uniqueInRankOrder(missingSlots, slotOrder),
    unmetRequirements: Object.freeze(unmetRequirements.map(cloneRequirement)),
    bestObservedEvidence: Object.freeze([...evidence]),
    consideredCandidateKeys: Object.freeze([...consideredCandidateKeys]),
  });
}

/** The day's eligible candidates by the slots they can fill, best first, once the day can dress a body and feet at all. */
export type ComposerDay = Readonly<{
  status: 'ready';
  requirements: BodyClothingRequirements;
  mandatoryRequirements: readonly BodyClothingRequirement[];
  consideredCandidateKeys: readonly string[];
  eligible: readonly EligibleGarmentResult[];
  bodyCores: readonly BodyCore[];
  midLayers: readonly EligibleGarmentResult[];
  outerLayers: readonly EligibleGarmentResult[];
  footwear: readonly EligibleGarmentResult[];
  /** Whether a mid layer must go over the primary top in order: false only to rebuild a saved outfit. */
  ordersLayers: boolean;
}>;

/**
 * Reads the day the composer arranges: its body requirements and its eligible candidates by
 * slot, or the failure no arrangement gets past (a conflicting key, no body, no shoe). It
 * assigns no roles and does not mutate garment data or re-evaluate garment-level requirement
 * applicability.
 */
export function readComposerDay(
  allRequirements: ClothingRequirements,
  candidates: readonly GarmentEligibilityResult[],
  ordersLayers: boolean,
): ComposerDay | OutfitCompositionFailure {
  // The extremity requirements are left out here on purpose: no top, bottom, layer or shoe
  // covers a head, so counting them would lower every outfit's score by the same amount and
  // say nothing. They decide the accessories attached at the end instead.
  const requirements = bodyClothingRequirements(allRequirements);
  const consideredCandidateKeys = Object.freeze(
    candidates.map(({ candidateKey }) => candidateKey).sort(compareStrings),
  );
  if (new Set(consideredCandidateKeys).size !== consideredCandidateKeys.length) {
    return failureResult(
      ['conflicting_candidate_key'],
      [],
      [],
      [],
      consideredCandidateKeys,
    );
  }

  const eligible = candidates
    .filter((candidate): candidate is EligibleGarmentResult =>
      candidate.status === 'eligible')
    .sort(compareGarmentEligibilityResults);
  const inSlot = (slot: OutfitSlot) =>
    eligible.filter(({ garment }) => slotAccepts(slot, garment.properties));
  const primaryTops = inSlot('primary_top');
  const bottoms = inSlot('bottom');
  const onePieces = inSlot('one_piece');
  const midLayers = inSlot('mid_layer');
  const outerLayers = inSlot('outer_layer');
  const footwear = inSlot('footwear');

  const bodyCores: BodyCore[] = [];
  for (const primaryTop of primaryTops) {
    for (const bottom of bottoms) {
      bodyCores.push(Object.freeze({
        kind: 'separates',
        primaryTop,
        bottom,
      }));
    }
  }
  for (const onePiece of onePieces) {
    bodyCores.push(Object.freeze({ kind: 'one_piece', onePiece }));
  }

  const mandatoryRequirements = requirements.requirements.filter(
    ({ priority }) => priority === 'mandatory',
  );
  const initialMissingSlots: OutfitSlot[] = [];
  const initialFailureCodes: OutfitCompositionFailureCode[] = [];
  if (bodyCores.length === 0) {
    initialFailureCodes.push('no_complete_body_core');
    if (onePieces.length === 0) {
      if (primaryTops.length === 0) {
        initialMissingSlots.push('primary_top');
      }
      if (bottoms.length === 0) {
        initialMissingSlots.push('bottom');
      }
    }
  }
  if (footwear.length === 0) {
    initialFailureCodes.push('no_eligible_footwear');
    initialMissingSlots.push('footwear');
  }

  if (bodyCores.length === 0 || footwear.length === 0) {
    const evidence = bestEvidence(mandatoryRequirements, []);
    return failureResult(
      initialFailureCodes,
      initialMissingSlots,
      mandatoryRequirements,
      evidence,
      consideredCandidateKeys,
    );
  }

  return Object.freeze({
    status: 'ready',
    requirements,
    mandatoryRequirements,
    consideredCandidateKeys,
    eligible,
    bodyCores,
    midLayers,
    outerLayers,
    footwear,
    ordersLayers,
  });
}

/**
 * Every body-and-layers triple the enumeration pairs with the shoes, in enumeration order. A
 * mid layer that does not go over the primary top in order is never paired, so the drafts and
 * the failure evidence read the same triples.
 */
function* bodyTriples(day: ComposerDay): Generator<BodyPieces> {
  const midOptions = [null, ...day.midLayers];
  const outerOptions = [null, ...day.outerLayers];
  for (const body of day.bodyCores) {
    for (const midLayer of midOptions) {
      if (
        day.ordersLayers && midLayer !== null && body.kind === 'separates' &&
        !layeringOrderFits(body.primaryTop, midLayer)
      ) {
        continue;
      }
      for (const outerLayer of outerOptions) {
        yield bodyPiecesOf(body, midLayer, outerLayer);
      }
    }
  }
}

/**
 * Every valid draft of the day, best first. A draft is valid when it wears no candidate twice,
 * keeps its formalities within one step and meets every mandatory requirement, so a triple
 * whose body side already repeats a candidate, mixes formalities or misses a mandatory
 * requirement is dropped before any shoe is tried. Only the valid drafts are scored, and none
 * becomes an outfit here.
 *
 * The drafts are judged in enumeration order and that order is kept into the sort: the
 * comparator settles ties between a separates and a one-piece draft by digest while it settles
 * ties within one body kind by slot scores, which is not transitive across the two, so the
 * sorted order depends on the order it is given.
 */
export function validDrafts(day: ComposerDay): readonly JudgedDraft[] {
  const footwear = day.footwear.map((candidate) => ({ candidate, rank: formalityRankOf(candidate) }));
  const valid: JudgedDraft[] = [];
  for (const pieces of bodyTriples(day)) {
    const { lowest, highest } = pieces.formalityRange;
    if (pieces.repeatsCandidate || !formalitySpreadFits(lowest, highest)) {
      continue;
    }
    const side = bodySideOf(pieces, day.requirements);
    if (!side.evaluations.every((evaluation) => evaluation === null || meetsRequirement(evaluation))) {
      continue;
    }
    for (const { candidate, rank } of footwear) {
      if (
        side.candidateKeys.has(candidate.candidateKey) ||
        !formalitySpreadFits(Math.min(lowest, rank), Math.max(highest, rank))
      ) {
        continue;
      }
      const evaluations = draftEvaluations(side, candidate, day.requirements);
      if (evaluations.every(meetsRequirement)) {
        valid.push(judgeDraft(side, candidate, day.requirements, evaluations));
      }
    }
  }
  return sortedDrafts(valid);
}

/**
 * The failure of a day that composes nothing. Its evidence reads every draft that wears no
 * candidate twice, mixed formalities included, so it says how close the day came.
 */
export function noValidCompositionFailure(day: ComposerDay): OutfitCompositionFailure {
  const { requirements, mandatoryRequirements } = day;
  const drafts: Pick<OutfitCandidate, 'requirementEvaluations' | 'compositionKey'>[] = [];
  for (const pieces of bodyTriples(day)) {
    if (pieces.repeatsCandidate) {
      continue;
    }
    const side = bodySideOf(pieces, requirements);
    for (const footwear of day.footwear) {
      if (!side.candidateKeys.has(footwear.candidateKey)) {
        drafts.push({
          requirementEvaluations: draftEvaluations(side, footwear, requirements),
          compositionKey: compositionKeyOf(side, footwear),
        });
      }
    }
  }

  const evidence = bestEvidence(mandatoryRequirements, drafts);
  const unmet = mandatoryRequirements.filter((requirement) => {
    const best = evidence.find(
      ({ requirement: candidate }) =>
        requirementKey(candidate) === requirementKey(requirement),
    );
    return !best || best.bestContribution < 100;
  });
  const failureCodes = unmet.length === 0 && mandatoryRequirements.length > 0
    ? ['mandatory_requirements_conflict'] as OutfitCompositionFailureCode[]
    : unmet.map(failureCodeForRequirement);
  const missingSlots: OutfitSlot[] = [];
  const mandatoryOuter = mandatoryRequirements.filter(
    (requirement) =>
      (requirement.kind === 'water_protection' &&
        requirement.target === 'body') ||
      requirement.kind === 'wind_protection',
  );
  if (
    mandatoryOuter.length > 0 &&
    !day.outerLayers.some((candidate) =>
      mandatoryOuter.every(
        (requirement) => findEvaluation(candidate, requirement)?.status === 'met',
      ))
  ) {
    missingSlots.push('outer_layer');
  }

  return failureResult(
    failureCodes.length > 0 ? failureCodes : ['no_valid_composition'],
    missingSlots,
    unmet,
    evidence,
    day.consideredCandidateKeys,
  );
}
