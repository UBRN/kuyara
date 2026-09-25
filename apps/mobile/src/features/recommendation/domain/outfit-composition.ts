import type {
  Breathability,
  Coverage,
  Formality,
  LayerRole,
  ThermalLevel,
  TractionSuitability,
  WaterProtection,
  WindProtection,
} from '@/features/catalog/domain/garment-taxonomy';
import { getGarmentType } from '@/features/catalog/domain/garment-catalog';
import type { WornOutfit } from '@/features/recommendation/domain/outfit-history';
import {
  compareGarmentEligibilityResults,
  type EffectiveGarmentCandidate,
  type EligibleGarmentResult,
  type GarmentEligibilityResult,
  type GarmentRequirementEvaluation,
} from '@/features/recommendation/domain/garment-eligibility';
import {
  bodyClothingRequirements,
  type BodyClothingRequirement,
  type BodyClothingRequirements,
  type ClothingRequirement,
  type ClothingRequirementReasonCode,
  type ClothingRequirements,
  type ExtremityCoverRequirement,
  type ThermalRequirement,
} from '@/features/recommendation/domain/weather-to-clothing-requirements';

export const outfitSlots = Object.freeze([
  'primary_top',
  'bottom',
  'one_piece',
  'mid_layer',
  'outer_layer',
  'footwear',
  'head',
  'neck',
  'hands',
  'handheld',
] as const);

export type OutfitSlot = (typeof outfitSlots)[number];

/**
 * The four slots an outfit may finish with. They are not composed: the six body slots are
 * arranged first, and one accessory per slot is attached to the finished outfit from the
 * weather requirements and that outfit's own formality. So they never make one option
 * different from another, and the garment board (ADR 0025) does not draw them.
 */
export const accessoryOutfitSlots = Object.freeze([
  'head',
  'neck',
  'hands',
  'handheld',
] as const);

export type AccessoryOutfitSlot = (typeof accessoryOutfitSlots)[number];

export type OutfitAccessories = Readonly<
  Record<AccessoryOutfitSlot, AssignedOutfitGarment | null>
>;

export const outfitCompositionReasonCodes = Object.freeze([
  'breathability_protection_tradeoff',
  'thermal_over_protection',
  'unnecessary_water_protection',
] as const);

export type OutfitCompositionReasonCode =
  (typeof outfitCompositionReasonCodes)[number];

export const outfitCompositionFailureCodes = Object.freeze([
  'conflicting_candidate_key',
  'no_complete_body_core',
  'no_eligible_footwear',
  'mandatory_thermal_unmet',
  'mandatory_breathability_unmet',
  'mandatory_arm_coverage_unmet',
  'mandatory_leg_coverage_unmet',
  'mandatory_body_water_unmet',
  'mandatory_feet_water_unmet',
  'mandatory_wind_unmet',
  'mandatory_traction_unmet',
  'mandatory_requirements_conflict',
  'no_valid_composition',
] as const);

export type OutfitCompositionFailureCode =
  (typeof outfitCompositionFailureCodes)[number];

export type AssignedOutfitGarment = Readonly<{
  slot: OutfitSlot;
  layerRole: LayerRole | null;
  garment: EffectiveGarmentCandidate;
  eligibilityScore: number;
  evaluations: readonly GarmentRequirementEvaluation[];
}>;

export type OutfitBody =
  | Readonly<{
      kind: 'separates';
      primaryTop: AssignedOutfitGarment;
      bottom: AssignedOutfitGarment;
    }>
  | Readonly<{
      kind: 'one_piece';
      onePiece: AssignedOutfitGarment;
    }>;

export type OutfitAggregateProperties = Readonly<{
  thermal: Readonly<{
    bodyStrength: number;
    effectiveBodyLevel: ThermalLevel;
    footwear: ThermalLevel | null;
  }>;
  breathability: Readonly<{
    body: Breathability | null;
    coreAndMid: Breathability | null;
    footwear: Breathability | null;
  }>;
  armCoverage: Coverage | null;
  legCoverage: Coverage | null;
  bodyWaterProtection: WaterProtection | null;
  footwearWaterProtection: WaterProtection | null;
  windProtection: WindProtection | null;
  tractionSuitability: TractionSuitability | null;
}>;

export type OutfitRequirementEvaluation = Readonly<{
  requirement: BodyClothingRequirement;
  status: 'met' | 'shortfall' | 'missing' | 'tradeoff';
  contribution: number;
  observedContribution: number;
  suppliedByCandidateKeys: readonly string[];
  tradeoffCandidateKeys: readonly string[];
  reasonCodes: readonly ClothingRequirementReasonCode[];
}>;

export type OutfitPenaltyBreakdown = Readonly<{
  thermalOverProtection: number;
  unnecessaryWaterProtection: number;
  breathabilityProtectionTradeoff: number;
}>;

export type OutfitCandidate = Readonly<{
  body: OutfitBody;
  midLayer: AssignedOutfitGarment | null;
  outerLayer: AssignedOutfitGarment | null;
  footwear: AssignedOutfitGarment;
  accessories: OutfitAccessories;
  aggregates: OutfitAggregateProperties;
  requirementEvaluations: readonly OutfitRequirementEvaluation[];
  score: number;
  scoreBeforePenalties: number;
  penaltyPoints: number;
  penaltyBreakdown: OutfitPenaltyBreakdown;
  reasonCodes: readonly OutfitCompositionReasonCode[];
  candidateKeys: readonly string[];
  compositionKey: string;
  formality: Formality;
}>;

export type OutfitRequirementBestEvidence = Readonly<{
  requirement: BodyClothingRequirement;
  bestContribution: number;
  bestObservedContribution: number;
  compositionKey: string | null;
  reasonCodes: readonly ClothingRequirementReasonCode[];
}>;

export type OutfitCompositionFailure = Readonly<{
  status: 'failure';
  reasonCodes: readonly OutfitCompositionFailureCode[];
  missingSlots: readonly OutfitSlot[];
  unmetRequirements: readonly BodyClothingRequirement[];
  bestObservedEvidence: readonly OutfitRequirementBestEvidence[];
  consideredCandidateKeys: readonly string[];
}>;

export type OutfitCompositionsSuccess = Readonly<{
  status: 'composed';
  // Best first: every valid arrangement from `collectValidOutfits`, at most 24 offered ones
  // from `composeOutfitOptions`.
  outfits: readonly OutfitCandidate[];
}>;

export type OutfitCompositionsResult =
  | OutfitCompositionsSuccess
  | OutfitCompositionFailure;

type BodyCore =
  | Readonly<{
      kind: 'separates';
      primaryTop: EligibleGarmentResult;
      bottom: EligibleGarmentResult;
    }>
  | Readonly<{
      kind: 'one_piece';
      onePiece: EligibleGarmentResult;
    }>;

type DraftComposition = Readonly<{
  body: BodyCore;
  midLayer: EligibleGarmentResult | null;
  outerLayer: EligibleGarmentResult | null;
  footwear: EligibleGarmentResult;
}>;

const thermalStrength: Readonly<Record<ThermalLevel, number>> = Object.freeze({
  none: 0,
  light: 1,
  moderate: 2,
  high: 3,
});
const breathabilityStrength: Readonly<Record<Breathability, number>> =
  Object.freeze({ low: 1, moderate: 2, high: 3 });
const coverageStrength: Readonly<Record<Coverage, number>> = Object.freeze({
  none: 0,
  partial: 1,
  full: 2,
});
const failureOrder = new Map(
  outfitCompositionFailureCodes.map((code, index) => [code, index]),
);
const reasonOrder = new Map(
  outfitCompositionReasonCodes.map((code, index) => [code, index]),
);
const slotOrder = new Map(outfitSlots.map((slot, index) => [slot, index]));
const formalityOrder = Object.freeze(['casual', 'smart', 'formal'] as const);
// The body region an accessory has to cover to fill each slot. A carried piece covers no
// region at all, which is what makes the umbrella a `handheld` and nothing else.
const accessoryRegionBySlot: Readonly<
  Record<AccessoryOutfitSlot, ExtremityCoverRequirement['target'] | null>
> = Object.freeze({
  head: 'head',
  neck: 'neck',
  hands: 'hands',
  handheld: null,
});
const noAccessories: OutfitAccessories = Object.freeze({
  head: null,
  neck: null,
  hands: null,
  handheld: null,
});

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function orderedFailureCodes(
  values: Iterable<OutfitCompositionFailureCode>,
): readonly OutfitCompositionFailureCode[] {
  return Object.freeze(
    [...new Set(values)].sort(
      (left, right) =>
        (failureOrder.get(left) ?? Number.MAX_SAFE_INTEGER) -
        (failureOrder.get(right) ?? Number.MAX_SAFE_INTEGER),
    ),
  );
}

function orderedReasonCodes(
  values: Iterable<OutfitCompositionReasonCode>,
): readonly OutfitCompositionReasonCode[] {
  return Object.freeze(
    [...new Set(values)].sort(
      (left, right) =>
        (reasonOrder.get(left) ?? Number.MAX_SAFE_INTEGER) -
        (reasonOrder.get(right) ?? Number.MAX_SAFE_INTEGER),
    ),
  );
}

function orderedSlots(values: Iterable<OutfitSlot>): readonly OutfitSlot[] {
  return Object.freeze(
    [...new Set(values)].sort(
      (left, right) =>
        (slotOrder.get(left) ?? Number.MAX_SAFE_INTEGER) -
        (slotOrder.get(right) ?? Number.MAX_SAFE_INTEGER),
    ),
  );
}

function cloneRequirement<Requirement extends ClothingRequirement>(
  requirement: Requirement,
): Requirement {
  return Object.freeze({
    ...requirement,
    reasonCodes: Object.freeze([...requirement.reasonCodes]),
  }) as Requirement;
}

/**
 * A day derives a handful of requirements and then evaluates each of them against every
 * draft, so the copy each evaluation carries is cut once per requirement, not once per
 * draft. The copies are frozen and nothing mutates one.
 */
const requirementCopies = new WeakMap<
  BodyClothingRequirement,
  Readonly<{
    requirement: BodyClothingRequirement;
    reasonCodes: readonly ClothingRequirementReasonCode[];
  }>
>();

function copyOf(requirement: BodyClothingRequirement) {
  const cached = requirementCopies.get(requirement);
  if (cached) {
    return cached;
  }

  const copy = Object.freeze({
    requirement: cloneRequirement(requirement),
    reasonCodes: Object.freeze([...requirement.reasonCodes]),
  });
  requirementCopies.set(requirement, copy);
  return copy;
}

function cloneEvaluation(
  evaluation: GarmentRequirementEvaluation,
): GarmentRequirementEvaluation {
  return Object.freeze({
    ...evaluation,
    requirement: cloneRequirement(evaluation.requirement),
    reasonCodes: Object.freeze([...evaluation.reasonCodes]),
  });
}

function cloneGarment(
  garment: EffectiveGarmentCandidate,
): EffectiveGarmentCandidate {
  return Object.freeze({
    ...garment,
    properties: Object.freeze({
      ...garment.properties,
      supportedLayerRoles: Object.freeze([
        ...garment.properties.supportedLayerRoles,
      ]),
    }),
  });
}

/**
 * The frozen copies of a candidate's garment and evaluations, cut once per candidate rather
 * than once per draft. A mild day drafts tens of thousands of outfits from the same few
 * dozen candidates, and cloning each candidate's garment and its evaluations again for every
 * draft was the composer's largest single cost. Every copy is deeply frozen and nothing
 * mutates one, so the drafts share them.
 */
const assignedParts = new WeakMap<
  EligibleGarmentResult,
  Readonly<{
    garment: EffectiveGarmentCandidate;
    evaluations: readonly GarmentRequirementEvaluation[];
  }>
>();

function partsFor(result: EligibleGarmentResult) {
  const cached = assignedParts.get(result);
  if (cached) {
    return cached;
  }

  const parts = Object.freeze({
    garment: cloneGarment(result.garment),
    evaluations: Object.freeze(result.evaluations.map(cloneEvaluation)),
  });
  assignedParts.set(result, parts);
  return parts;
}

function assignedGarment(
  result: EligibleGarmentResult,
  slot: OutfitSlot,
  layerRole: LayerRole | null,
): AssignedOutfitGarment {
  const { garment, evaluations } = partsFor(result);
  return Object.freeze({
    slot,
    layerRole,
    garment,
    eligibilityScore: result.score,
    evaluations,
  });
}

function requirementKey(requirement: ClothingRequirement): string {
  return requirement.kind === 'water_protection' ||
      requirement.kind === 'extremity_cover'
    ? `${requirement.kind}:${requirement.target}`
    : requirement.kind;
}

function findEvaluation(
  result: EligibleGarmentResult | null,
  requirement: BodyClothingRequirement,
): GarmentRequirementEvaluation | null {
  if (!result) {
    return null;
  }

  const key = requirementKey(requirement);
  return result.evaluations.find(
    ({ requirement: candidate }) => requirementKey(candidate) === key,
  ) ?? null;
}

/**
 * Everything a draft wears above the shoes, shared by the drafts that differ only in them.
 * `aggregateProperties`, `candidateKeys`, `compositionKey` and every requirement evaluation
 * ask for this list, and the enumeration pairs one body, mid and outer with every eligible
 * shoe, so `collectValidOutfits` builds it once per body-and-layers triple and hands the
 * same frozen list to each of that triple's drafts.
 */
const bodyResultsByDraft = new WeakMap<
  DraftComposition,
  readonly EligibleGarmentResult[]
>();

function bodySideResults(
  body: BodyCore,
  midLayer: EligibleGarmentResult | null,
  outerLayer: EligibleGarmentResult | null,
): readonly EligibleGarmentResult[] {
  const core = body.kind === 'separates'
    ? [body.primaryTop, body.bottom]
    : [body.onePiece];

  return Object.freeze([
    ...core,
    ...(midLayer ? [midLayer] : []),
    ...(outerLayer ? [outerLayer] : []),
  ]);
}

function bodyResults(draft: DraftComposition): readonly EligibleGarmentResult[] {
  const cached = bodyResultsByDraft.get(draft);
  if (cached) {
    return cached;
  }

  const results = bodySideResults(draft.body, draft.midLayer, draft.outerLayer);
  bodyResultsByDraft.set(draft, results);
  return results;
}

// Only the breathability branch names the body's candidate keys, so the sorted list is cut
// lazily and once per triple, not for every requirement of every draft.
const bodyKeysByResults = new WeakMap<
  readonly EligibleGarmentResult[],
  readonly string[]
>();

function bodyCandidateKeys(draft: DraftComposition): readonly string[] {
  const results = bodyResults(draft);
  const cached = bodyKeysByResults.get(results);
  if (cached) {
    return cached;
  }

  const keys = Object.freeze(
    results.map(({ candidateKey }) => candidateKey).sort(compareStrings),
  );
  bodyKeysByResults.set(results, keys);
  return keys;
}

function coreAndMidResults(
  draft: DraftComposition,
): readonly EligibleGarmentResult[] {
  const core = draft.body.kind === 'separates'
    ? [draft.body.primaryTop, draft.body.bottom]
    : [draft.body.onePiece];

  return Object.freeze([
    ...core,
    ...(draft.midLayer ? [draft.midLayer] : []),
  ]);
}

function minimumBreathability(
  results: readonly EligibleGarmentResult[],
): Breathability | null {
  const values = results.map(({ garment }) => garment.properties.breathability);
  if (values.length === 0 || values.some((value) => value === null)) {
    return null;
  }

  return values.reduce<Breathability>((minimum, value) =>
    breathabilityStrength[value as Breathability] <
      breathabilityStrength[minimum]
      ? value as Breathability
      : minimum,
  values[0] as Breathability);
}

function maximumCoverage(
  values: readonly (Coverage | null)[],
): Coverage | null {
  const applicable = values.filter((value): value is Coverage => value !== null);
  if (applicable.length === 0) {
    return null;
  }

  return applicable.reduce((maximum, value) =>
    coverageStrength[value] > coverageStrength[maximum] ? value : maximum,
  applicable[0]);
}

function effectiveThermalLevel(strength: number): ThermalLevel {
  return strength <= 0
    ? 'none'
    : strength === 1
      ? 'light'
      : strength === 2
        ? 'moderate'
        : 'high';
}

function thermalStrengthOf(result: EligibleGarmentResult | null): number {
  const level = result?.garment.properties.thermalLevel ?? null;
  return level === null ? 0 : thermalStrength[level];
}

/**
 * The ladder the day's thermal requirement is read against: the layer against the skin, the
 * mid layer and the outer layer. The bottom is warmth the outfit carries, which is why the
 * over-protection penalty still counts it, but it is not a rung of the stack that keeps the
 * day out. Reading the plain sum let a cardigan over jeans reach "high", so the grid of
 * 2026-09-17 answered -5 C without a coat in all 1512 of its outfits and gave the same
 * answer at -10 C as at +3 C (A2/B1 and A2/B2).
 */
function thermalLadderStrength(draft: DraftComposition): number {
  const core = draft.body.kind === 'separates'
    ? draft.body.primaryTop
    : draft.body.onePiece;
  return thermalStrengthOf(core) +
    thermalStrengthOf(draft.midLayer) +
    thermalStrengthOf(draft.outerLayer);
}

function aggregateProperties(
  draft: DraftComposition,
): OutfitAggregateProperties {
  const body = bodyResults(draft);
  const coreAndMid = coreAndMidResults(draft);
  const bodyStrength = body.reduce(
    (sum, result) => sum + thermalStrengthOf(result),
    0,
  );

  return Object.freeze({
    thermal: Object.freeze({
      bodyStrength,
      effectiveBodyLevel: effectiveThermalLevel(bodyStrength),
      footwear: draft.footwear.garment.properties.thermalLevel,
    }),
    breathability: Object.freeze({
      body: minimumBreathability(body),
      coreAndMid: minimumBreathability(coreAndMid),
      footwear: draft.footwear.garment.properties.breathability,
    }),
    armCoverage: maximumCoverage(
      body.map(({ garment }) => garment.properties.armCoverage),
    ),
    legCoverage: maximumCoverage(
      body.map(({ garment }) => garment.properties.legCoverage),
    ),
    bodyWaterProtection:
      draft.outerLayer?.garment.properties.waterProtection ?? null,
    footwearWaterProtection:
      draft.footwear.garment.properties.waterProtection,
    windProtection:
      draft.outerLayer?.garment.properties.windProtection ?? null,
    tractionSuitability:
      draft.footwear.garment.properties.tractionSuitability,
  });
}

function percentage(actual: number, required: number): number {
  return Math.round(Math.min(actual / required, 1) * 100);
}

/**
 * The top rung of the ladder names a garment, not an amount. "High" is what the outside
 * guidance calls a winter coat (A3 section 3: raksul writes a coat from 0 C down, Fit The
 * Forecast three mandatory layers from -6 C down), and a stack of knitwear under nothing is
 * not that coat, however much warmth it adds up to. The two lower rungs are answered by any
 * arrangement, so this reads 100 for them.
 */
function shellPercentage(
  minimum: ThermalRequirement['minimum'],
  outerLayer: EligibleGarmentResult | null,
): number {
  return minimum === 'high'
    ? percentage(thermalStrengthOf(outerLayer), thermalStrength.high)
    : 100;
}

/**
 * One garment covers the feet and nothing layers over it, so a shoe with no warmth in it is
 * a hole in the day's insulation that no coat closes: A2's fifth-worst outfit is a sandal on
 * an 8 C day. The feet are asked for one rung less than the body, which leaves a sneaker
 * answering a 10 C day and a boot answering a freezing one.
 */
function footwearThermalPercentage(
  required: number,
  footwear: ThermalLevel | null,
): number {
  const target = required - 1;
  return target <= 0
    ? 100
    : percentage(footwear === null ? 0 : thermalStrength[footwear], target);
}

function evaluationStatus(
  contribution: number,
  missing: boolean,
): OutfitRequirementEvaluation['status'] {
  return contribution >= 100 ? 'met' : missing ? 'missing' : 'shortfall';
}

function mandatoryProtectiveOuter(
  draft: DraftComposition,
  requirements: BodyClothingRequirements,
): boolean {
  if (!draft.outerLayer) {
    return false;
  }

  return requirements.requirements.some((requirement) => {
    const targetsOuter =
      (requirement.kind === 'water_protection' &&
        requirement.target === 'body') ||
      requirement.kind === 'wind_protection';
    return targetsOuter &&
      requirement.priority === 'mandatory' &&
      findEvaluation(draft.outerLayer, requirement)?.status === 'met';
  });
}

function evaluateRequirement(
  requirement: BodyClothingRequirement,
  draft: DraftComposition,
  aggregates: OutfitAggregateProperties,
  requirements: BodyClothingRequirements,
): OutfitRequirementEvaluation {
  const body = bodyResults(draft);
  let contribution = 0;
  let observedContribution = 0;
  let missing = false;
  let status: OutfitRequirementEvaluation['status'];
  let suppliedByCandidateKeys: readonly string[] = Object.freeze([]);
  let tradeoffCandidateKeys: readonly string[] = Object.freeze([]);

  switch (requirement.kind) {
    case 'thermal': {
      const required = thermalStrength[requirement.minimum];
      contribution = Math.min(
        percentage(thermalLadderStrength(draft), required),
        shellPercentage(requirement.minimum, draft.outerLayer),
        footwearThermalPercentage(required, aggregates.thermal.footwear),
      );
      observedContribution = contribution;
      suppliedByCandidateKeys = Object.freeze(
        body
          .filter(({ garment }) =>
            garment.properties.thermalLevel !== null &&
            garment.properties.thermalLevel !== 'none')
          .map(({ candidateKey }) => candidateKey)
          .sort(compareStrings),
      );
      break;
    }
    case 'breathability': {
      const required = breathabilityStrength[requirement.minimum];
      const bodyValue = aggregates.breathability.body;
      const coreValue = aggregates.breathability.coreAndMid;
      observedContribution = bodyValue === null
        ? 0
        : percentage(breathabilityStrength[bodyValue], required);
      contribution = observedContribution;
      missing = bodyValue === null;
      suppliedByCandidateKeys = bodyCandidateKeys(draft);

      if (
        requirement.priority === 'mandatory' &&
        observedContribution < 100 &&
        coreValue !== null &&
        breathabilityStrength[coreValue] >= required &&
        mandatoryProtectiveOuter(draft, requirements)
      ) {
        contribution = 100;
        status = 'tradeoff';
        tradeoffCandidateKeys = Object.freeze([
          draft.outerLayer!.candidateKey,
        ]);
        return Object.freeze({
          requirement: cloneRequirement(requirement),
          status,
          contribution,
          observedContribution,
          suppliedByCandidateKeys,
          tradeoffCandidateKeys,
          reasonCodes: Object.freeze([...requirement.reasonCodes]),
        });
      }
      break;
    }
    case 'arm_coverage': {
      const actual = aggregates.armCoverage;
      contribution = actual === null
        ? 0
        : percentage(
            coverageStrength[actual],
            coverageStrength[requirement.minimum],
          );
      observedContribution = contribution;
      missing = actual === null;
      suppliedByCandidateKeys = Object.freeze(
        body
          .filter(({ garment }) => garment.properties.armCoverage !== null)
          .map(({ candidateKey }) => candidateKey)
          .sort(compareStrings),
      );
      break;
    }
    case 'leg_coverage': {
      const actual = aggregates.legCoverage;
      contribution = actual === null
        ? 0
        : percentage(
            coverageStrength[actual],
            coverageStrength[requirement.minimum],
          );
      observedContribution = contribution;
      missing = actual === null;
      suppliedByCandidateKeys = Object.freeze(
        body
          .filter(({ garment }) => garment.properties.legCoverage !== null)
          .map(({ candidateKey }) => candidateKey)
          .sort(compareStrings),
      );
      break;
    }
    case 'water_protection': {
      const supplier = requirement.target === 'body'
        ? draft.outerLayer
        : draft.footwear;
      const evaluation = findEvaluation(supplier, requirement);
      contribution = evaluation?.contribution ?? 0;
      observedContribution = contribution;
      missing = !evaluation ||
        evaluation.status === 'missing' ||
        evaluation.status === 'not_applicable';
      suppliedByCandidateKeys = supplier && !missing
        ? Object.freeze([supplier.candidateKey])
        : Object.freeze([]);
      break;
    }
    case 'wind_protection': {
      const evaluation = findEvaluation(draft.outerLayer, requirement);
      contribution = evaluation?.contribution ?? 0;
      observedContribution = contribution;
      missing = !evaluation ||
        evaluation.status === 'missing' ||
        evaluation.status === 'not_applicable';
      suppliedByCandidateKeys = draft.outerLayer && !missing
        ? Object.freeze([draft.outerLayer.candidateKey])
        : Object.freeze([]);
      break;
    }
    case 'traction': {
      const evaluation = findEvaluation(draft.footwear, requirement);
      contribution = evaluation?.contribution ?? 0;
      observedContribution = contribution;
      missing = !evaluation ||
        evaluation.status === 'missing' ||
        evaluation.status === 'not_applicable';
      suppliedByCandidateKeys = !missing
        ? Object.freeze([draft.footwear.candidateKey])
        : Object.freeze([]);
      break;
    }
  }

  status = evaluationStatus(contribution, missing);
  const copy = copyOf(requirement);
  return Object.freeze({
    requirement: copy.requirement,
    status,
    contribution,
    observedContribution,
    suppliedByCandidateKeys,
    tradeoffCandidateKeys,
    reasonCodes: copy.reasonCodes,
  });
}

function thermalOverProtectionPenalty(
  requirements: BodyClothingRequirements,
  draft: DraftComposition,
  bodyStrength: number,
): number {
  const requirement = requirements.requirements.find(
    (candidate) => candidate.kind === 'thermal',
  );

  if (!requirement) {
    return bodyStrength <= 1 ? 0 : bodyStrength === 2 ? 10 : 20;
  }

  // Warmth the day did not ask for, counted in the two places it can sit. The stack over the
  // torso is what the day's rung names, and the top rung charges nothing for it: a day cold
  // enough to name a coat is dressed by layering, and charging that overshoot is what kept
  // the coat out of the offer, where at -5 C a parka took 15 points for being a parka and
  // finished behind the same outfit without one (A2/K2). The bottom is named by no rung, so
  // it keeps the one layer legs are dressed in whatever the day, and thermal legwear on top
  // of that is charged at every rung.
  const ladder = thermalLadderStrength(draft);
  const stack = requirement.minimum === 'high'
    ? 0
    : Math.max(ladder - thermalStrength[requirement.minimum], 0);
  const bottom = Math.max(bodyStrength - ladder - thermalStrength.light, 0);
  return (stack + bottom) * 5;
}

/**
 * Water protection the day never asked for costs a little, on every day. The penalty used to
 * apply only once the day was warm enough to ask for breathability, so a 12 °C dry day, which
 * asks for neither, offered three outfits in rain jackets.
 */
function unnecessaryWaterProtectionPenalty(
  requirements: BodyClothingRequirements,
  aggregates: OutfitAggregateProperties,
): number {
  const hasBodyWater = requirements.requirements.some(
    (requirement) =>
      requirement.kind === 'water_protection' && requirement.target === 'body',
  );
  const hasFeetWater = requirements.requirements.some(
    (requirement) =>
      requirement.kind === 'water_protection' && requirement.target === 'feet',
  );
  const penaltyFor = (value: WaterProtection | null): number =>
    value === 'waterproof' ? 10 : value === 'water_resistant' ? 5 : 0;

  return (hasBodyWater ? 0 : penaltyFor(aggregates.bodyWaterProtection)) +
    (hasFeetWater ? 0 : penaltyFor(aggregates.footwearWaterProtection));
}

function breathabilityTradeoffPenalty(
  requirements: BodyClothingRequirements,
  draft: DraftComposition,
  evaluations: readonly OutfitRequirementEvaluation[],
): number {
  const tradeoff = evaluations.find(
    (evaluation) =>
      evaluation.requirement.kind === 'breathability' &&
      evaluation.status === 'tradeoff',
  );
  if (!tradeoff || !draft.outerLayer) {
    return 0;
  }

  const requirement = requirements.requirements.find(
    (candidate) => candidate.kind === 'breathability',
  );
  const actual = draft.outerLayer.garment.properties.breathability;
  if (!requirement) {
    return 0;
  }

  const deficit = breathabilityStrength[requirement.minimum] -
    (actual === null ? 0 : breathabilityStrength[actual]);
  return Math.min(Math.max(deficit, 0) * 10, 20);
}

function primaryRole(
  primaryTop: EligibleGarmentResult,
  hasMidLayer: boolean,
): Extract<LayerRole, 'base' | 'standalone'> {
  const roles = primaryTop.garment.properties.supportedLayerRoles;
  if (hasMidLayer && roles.includes('base')) {
    return 'base';
  }
  if (roles.includes('standalone')) {
    return 'standalone';
  }
  return 'base';
}

function compositionKey(draft: DraftComposition): string {
  const mid = draft.midLayer?.candidateKey ?? '-';
  const outer = draft.outerLayer?.candidateKey ?? '-';
  const foot = draft.footwear.candidateKey;

  return draft.body.kind === 'separates'
    ? [
        'separates',
        draft.body.primaryTop.candidateKey,
        draft.body.bottom.candidateKey,
        mid,
        outer,
        foot,
      ].join('|')
    : [
        'one_piece',
        draft.body.onePiece.candidateKey,
        mid,
        outer,
        foot,
      ].join('|');
}

function candidateKeys(draft: DraftComposition): readonly string[] {
  return Object.freeze(
    bodyResults(draft)
      .map(({ candidateKey }) => candidateKey)
      .concat(draft.footwear.candidateKey)
      .sort(compareStrings),
  );
}

function evaluateDraft(
  draft: DraftComposition,
  requirements: BodyClothingRequirements,
): OutfitCandidate {
  const aggregates = aggregateProperties(draft);
  const requirementEvaluations = Object.freeze(
    requirements.requirements.map((requirement) =>
      evaluateRequirement(requirement, draft, aggregates, requirements),
    ),
  );
  const weightedTotal = requirementEvaluations.reduce(
    (sum, evaluation) =>
      sum + evaluation.contribution *
        (evaluation.requirement.priority === 'mandatory' ? 2 : 1),
    0,
  );
  const totalWeight = requirementEvaluations.reduce(
    (sum, evaluation) =>
      sum + (evaluation.requirement.priority === 'mandatory' ? 2 : 1),
    0,
  );
  const scoreBeforePenalties = totalWeight === 0
    ? 50
    : Math.round(weightedTotal / totalWeight);
  const thermalOverProtection = thermalOverProtectionPenalty(
    requirements,
    draft,
    aggregates.thermal.bodyStrength,
  );
  const unnecessaryWaterProtection = unnecessaryWaterProtectionPenalty(
    requirements,
    aggregates,
  );
  const breathabilityProtectionTradeoff = breathabilityTradeoffPenalty(
    requirements,
    draft,
    requirementEvaluations,
  );
  const penaltyBreakdown = Object.freeze({
    thermalOverProtection,
    unnecessaryWaterProtection,
    breathabilityProtectionTradeoff,
  });
  const penaltyPoints = Math.min(
    thermalOverProtection +
      unnecessaryWaterProtection +
      breathabilityProtectionTradeoff,
    30,
  );
  const reasons: OutfitCompositionReasonCode[] = [];
  if (breathabilityProtectionTradeoff > 0) {
    reasons.push('breathability_protection_tradeoff');
  }
  if (thermalOverProtection > 0) {
    reasons.push('thermal_over_protection');
  }
  if (unnecessaryWaterProtection > 0) {
    reasons.push('unnecessary_water_protection');
  }

  const midLayer = draft.midLayer
    ? assignedGarment(draft.midLayer, 'mid_layer', 'mid')
    : null;
  const outerLayer = draft.outerLayer
    ? assignedGarment(draft.outerLayer, 'outer_layer', 'outer')
    : null;
  const body: OutfitBody = draft.body.kind === 'separates'
    ? Object.freeze({
        kind: 'separates',
        primaryTop: assignedGarment(
          draft.body.primaryTop,
          'primary_top',
          primaryRole(draft.body.primaryTop, draft.midLayer !== null),
        ),
        bottom: assignedGarment(draft.body.bottom, 'bottom', 'standalone'),
      })
    : Object.freeze({
        kind: 'one_piece',
        onePiece: assignedGarment(
          draft.body.onePiece,
          'one_piece',
          'standalone',
        ),
      });
  const formalities = [
    ...(body.kind === 'separates'
      ? [body.primaryTop, body.bottom]
      : [body.onePiece]),
    midLayer,
    outerLayer,
    assignedGarment(draft.footwear, 'footwear', null),
  ].flatMap((assigned) => {
    const formality = assigned && getGarmentType(assigned.garment.garmentTypeId)?.formality;
    return formality ? [formality] : [];
  });
  const formality = formalities.reduce<Formality>((leastFormal, candidate) =>
    formalityOrder.indexOf(candidate) < formalityOrder.indexOf(leastFormal)
      ? candidate
      : leastFormal,
  formalities[0] ?? 'casual');

  return Object.freeze({
    body,
    midLayer,
    outerLayer,
    footwear: assignedGarment(draft.footwear, 'footwear', null),
    accessories: noAccessories,
    aggregates,
    requirementEvaluations,
    score: Math.max(scoreBeforePenalties - penaltyPoints, 0),
    scoreBeforePenalties,
    penaltyPoints,
    penaltyBreakdown,
    reasonCodes: orderedReasonCodes(reasons),
    candidateKeys: candidateKeys(draft),
    compositionKey: compositionKey(draft),
    formality,
  });
}

/**
 * Half of validity, and the half that reads only the draft: every garment's formality has
 * to sit inside one step of the ladder. It is checked before the draft is scored, because a
 * catalogue that spans three formality levels drafts far more mixed outfits than consistent
 * ones and scoring one costs orders of magnitude more than this. `collectValidOutfits`
 * keeps the rejected drafts so a day that composes nothing still reports the same evidence.
 */
function hasConsistentFormality(draft: DraftComposition): boolean {
  let lowest = Number.MAX_SAFE_INTEGER;
  let highest = -1;
  for (const result of bodyResults(draft)) {
    const rank = formalityRankOf(result);
    if (rank < 0) {
      return false;
    }
    lowest = Math.min(lowest, rank);
    highest = Math.max(highest, rank);
  }

  const footwearRank = formalityRankOf(draft.footwear);
  if (footwearRank < 0) {
    return false;
  }

  return Math.max(highest, footwearRank) - Math.min(lowest, footwearRank) <= 1;
}

function formalityRankOf(result: EligibleGarmentResult): number {
  const formality = getGarmentType(result.garment.garmentTypeId)?.formality;
  return formality ? formalityOrder.indexOf(formality) : -1;
}

function isValid(candidate: OutfitCandidate): boolean {
  return candidate.requirementEvaluations.every(
    ({ requirement, status }) =>
      requirement.priority === 'optional' ||
      status === 'met' ||
      status === 'tradeoff',
  );
}

function optionalLayerCount(candidate: OutfitCandidate): number {
  return Number(candidate.midLayer !== null) + Number(candidate.outerLayer !== null);
}

function slotScoreVector(candidate: OutfitCandidate): readonly number[] {
  const optionalScore = (value: AssignedOutfitGarment | null): number =>
    value?.eligibilityScore ?? -1;

  return candidate.body.kind === 'separates'
    ? Object.freeze([
        candidate.body.primaryTop.eligibilityScore,
        candidate.body.bottom.eligibilityScore,
        optionalScore(candidate.midLayer),
        optionalScore(candidate.outerLayer),
        candidate.footwear.eligibilityScore,
      ])
    : Object.freeze([
        candidate.body.onePiece.eligibilityScore,
        optionalScore(candidate.midLayer),
        optionalScore(candidate.outerLayer),
        candidate.footwear.eligibilityScore,
      ]);
}

/**
 * The comparator's own inputs, read once per outfit instead of once per comparison. A mild
 * day composes tens of thousands of valid outfits, so the sort asks for these hundreds of
 * thousands of times; `slotScoreVector` allocated and froze an array on every one of them.
 */
type OutfitSortKey = Readonly<{
  outfit: OutfitCandidate;
  layers: number;
  slotScores: readonly number[];
  digest: number;
}>;

/**
 * A stable 32-bit FNV-1a digest of a composition key, read once per outfit like the rest of
 * the sort key rather than once per comparison.
 */
function compositionKeyDigest(key: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < key.length; index += 1) {
    hash = Math.imul(hash ^ key.charCodeAt(index), 0x01000193);
  }
  return hash >>> 0;
}

function outfitSortKey(outfit: OutfitCandidate): OutfitSortKey {
  return {
    outfit,
    layers: optionalLayerCount(outfit),
    slotScores: slotScoreVector(outfit),
    digest: compositionKeyDigest(outfit.compositionKey),
  };
}

function compareOutfitSortKeys(left: OutfitSortKey, right: OutfitSortKey): number {
  const scoreOrder = right.outfit.score - left.outfit.score;
  if (scoreOrder !== 0) {
    return scoreOrder;
  }
  const penaltyOrder = left.outfit.penaltyPoints - right.outfit.penaltyPoints;
  if (penaltyOrder !== 0) {
    return penaltyOrder;
  }
  const layerOrder = left.layers - right.layers;
  if (layerOrder !== 0) {
    return layerOrder;
  }

  if (left.outfit.body.kind === right.outfit.body.kind) {
    for (let index = 0; index < left.slotScores.length; index += 1) {
      const groupOrder = right.slotScores[index]! - left.slotScores[index]!;
      if (groupOrder !== 0) {
        return groupOrder;
      }
    }
  }

  // Last resort, and the one place where nothing about the day separates two arrangements.
  // Comparing the keys themselves made the alphabet decide: `catalog:loafers` beat
  // `catalog:sneakers` in every arrangement they both fit, so one shoe led every body core
  // and sneakers reached 6 of the 1512 shown outfits the grid measures. The digest keeps the
  // order deterministic and total while taking the garment's name out of it, and the key
  // itself settles the rare collision so the comparator stays a strict weak ordering.
  const digestOrder = left.digest - right.digest;
  return digestOrder !== 0
    ? digestOrder
    : compareStrings(left.outfit.compositionKey, right.outfit.compositionKey);
}

function sortedOutfits(outfits: readonly OutfitCandidate[]): OutfitCandidate[] {
  return outfits
    .map(outfitSortKey)
    .sort(compareOutfitSortKeys)
    .map(({ outfit }) => outfit);
}

function hasDuplicateCandidate(draft: DraftComposition): boolean {
  const keys = [
    ...bodyResults(draft).map(({ candidateKey }) => candidateKey),
    draft.footwear.candidateKey,
  ];
  return new Set(keys).size !== keys.length;
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
  candidates: readonly OutfitCandidate[],
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
    reasonCodes: orderedFailureCodes([
      ...reasonCodes,
      'no_valid_composition',
    ]),
    missingSlots: orderedSlots(missingSlots),
    unmetRequirements: Object.freeze(unmetRequirements.map(cloneRequirement)),
    bestObservedEvidence: Object.freeze([...evidence]),
    consideredCandidateKeys: Object.freeze([...consideredCandidateKeys]),
  });
}

function supportsRole(
  result: EligibleGarmentResult,
  role: LayerRole,
): boolean {
  return result.garment.properties.supportedLayerRoles.includes(role);
}

/**
 * The accessories a day offers at all: eligible, structurally an accessory, and answering
 * at least one requirement the day actually derived. On a day that asks nothing of the head,
 * the neck, the hands or the rain this is empty and no outfit finishes with anything.
 */
function offeredAccessories(
  candidates: readonly EligibleGarmentResult[],
): readonly EligibleGarmentResult[] {
  return candidates.filter(
    (candidate) =>
      candidate.garment.properties.category === 'accessory' &&
      candidate.evaluations.some(({ status }) => status !== 'not_applicable'),
  );
}

function formalityDistance(
  result: EligibleGarmentResult,
  outfitRank: number,
): number {
  const rank = formalityRankOf(result);
  return rank < 0 ? Number.MAX_SAFE_INTEGER : Math.abs(rank - outfitRank);
}

/**
 * One accessory for one slot, or none. The slot's own region decides who may fill it, the
 * formality closest to the outfit's decides which of them does, and the eligibility order
 * breaks the tie, so the strongest answer to what the day asked wins. Where a region offers
 * a single garment the formality step never excludes it: gloves and the umbrella belong to
 * a casual outfit exactly as much as to a formal one.
 */
function accessoryForSlot(
  accessories: readonly EligibleGarmentResult[],
  slot: AccessoryOutfitSlot,
  formality: Formality,
): AssignedOutfitGarment | null {
  const region = accessoryRegionBySlot[slot];
  const offered = accessories.filter(
    ({ garment }) => garment.properties.bodyRegion === region,
  );
  if (offered.length === 0) {
    return null;
  }

  const outfitRank = formalityOrder.indexOf(formality);
  const chosen = offered.reduce((best, candidate) => {
    const order = formalityDistance(candidate, outfitRank) -
      formalityDistance(best, outfitRank);
    return order < 0 ||
        (order === 0 && compareGarmentEligibilityResults(candidate, best) < 0)
      ? candidate
      : best;
  });

  return assignedGarment(chosen, slot, null);
}

/**
 * Nothing but its formality distinguishes one composed outfit's accessories from another's,
 * so the day's answer is decided once for each of the three formalities instead of once for
 * each of the tens of thousands of outfits a mild day composes.
 */
function accessorySetsByFormality(
  candidates: readonly EligibleGarmentResult[],
): ReadonlyMap<Formality, OutfitAccessories> {
  const sets = new Map<Formality, OutfitAccessories>();
  const accessories = offeredAccessories(candidates);
  if (accessories.length === 0) {
    return sets;
  }

  for (const formality of formalityOrder) {
    const chosen = Object.freeze(
      Object.fromEntries(
        accessoryOutfitSlots.map((slot) => [
          slot,
          accessoryForSlot(accessories, slot, formality),
        ]),
      ),
    ) as OutfitAccessories;
    if (accessoryOutfitSlots.some((slot) => chosen[slot] !== null)) {
      sets.set(formality, chosen);
    }
  }

  return sets;
}

function accessoryCompositionKey(accessories: OutfitAccessories): string {
  return accessoryOutfitSlots
    .map((slot) => accessories[slot]?.garment.candidateKey ?? '-')
    .join('|');
}

/**
 * Attachment, once per composed outfit and after the sort, so the order the six body slots
 * earned is the order the offer sees. A day that offers no accessory hands its outfits back
 * untouched, and only then does the composition key stay what it was.
 */
function withAccessories(
  outfits: readonly OutfitCandidate[],
  sets: ReadonlyMap<Formality, OutfitAccessories>,
): readonly OutfitCandidate[] {
  if (sets.size === 0) {
    return outfits;
  }

  return outfits.map((outfit) => {
    const accessories = sets.get(outfit.formality);
    return accessories
      ? Object.freeze({
          ...outfit,
          accessories,
          compositionKey:
            `${outfit.compositionKey}|${accessoryCompositionKey(accessories)}`,
        })
      : outfit;
  });
}

type ComposedDrafts =
  | OutfitCompositionFailure
  | Readonly<{
      status: 'composed';
      outfits: readonly OutfitCandidate[];
      accessorySets: ReadonlyMap<Formality, OutfitAccessories>;
    }>;

/**
 * Every valid composition of the six body slots, sorted best first, or the shared failure,
 * with the day's accessory answer beside it but not yet attached. It assigns runtime roles
 * but does not mutate garment data or re-evaluate garment-level requirement applicability.
 */
function composeValidOutfits(
  allRequirements: ClothingRequirements,
  candidates: readonly GarmentEligibilityResult[],
): ComposedDrafts {
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
  const primaryTops = eligible.filter(
    (candidate) =>
      candidate.garment.properties.category === 'top' &&
      (supportsRole(candidate, 'base') || supportsRole(candidate, 'standalone')),
  );
  const bottoms = eligible.filter(
    ({ garment }) =>
      garment.properties.category === 'bottom' &&
      garment.properties.supportedLayerRoles.includes('standalone'),
  );
  const onePieces = eligible.filter(
    ({ garment }) =>
      garment.properties.category === 'one_piece' &&
      garment.properties.supportedLayerRoles.includes('standalone'),
  );
  const midLayers = eligible.filter(
    (candidate) =>
      candidate.garment.properties.category === 'top' &&
      supportsRole(candidate, 'mid'),
  );
  const outerLayers = eligible.filter(
    (candidate) =>
      (candidate.garment.properties.category === 'top' ||
        candidate.garment.properties.category === 'outerwear') &&
      supportsRole(candidate, 'outer'),
  );
  const footwear = eligible.filter(
    ({ garment }) => garment.properties.category === 'footwear',
  );

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

  const evaluated: OutfitCandidate[] = [];
  // Scored only when nothing composes, so the failure evidence covers every draft.
  const mixedFormality: DraftComposition[] = [];
  const midOptions: readonly (EligibleGarmentResult | null)[] = [
    null,
    ...midLayers,
  ];
  const outerOptions: readonly (EligibleGarmentResult | null)[] = [
    null,
    ...outerLayers,
  ];

  for (const body of bodyCores) {
    for (const midLayer of midOptions) {
      for (const outerLayer of outerOptions) {
        const bodySide = bodySideResults(body, midLayer, outerLayer);
        for (const footwearCandidate of footwear) {
          const draft = Object.freeze({
            body,
            midLayer,
            outerLayer,
            footwear: footwearCandidate,
          });
          bodyResultsByDraft.set(draft, bodySide);
          if (hasDuplicateCandidate(draft)) {
            continue;
          }
          if (hasConsistentFormality(draft)) {
            evaluated.push(evaluateDraft(draft, requirements));
          } else {
            mixedFormality.push(draft);
          }
        }
      }
    }
  }

  const valid = sortedOutfits(evaluated.filter(isValid));
  if (valid.length > 0) {
    return Object.freeze({
      status: 'composed',
      outfits: Object.freeze(valid),
      accessorySets: accessorySetsByFormality(eligible),
    });
  }

  const evidence = bestEvidence(mandatoryRequirements, [
    ...evaluated,
    ...mixedFormality.map((draft) => evaluateDraft(draft, requirements)),
  ]);
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
    !outerLayers.some((candidate) =>
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
    consideredCandidateKeys,
  );
}

function hasDifferentBodyCore(
  left: OutfitCandidate,
  right: OutfitCandidate,
): boolean {
  if (left.body.kind !== right.body.kind) {
    return true;
  }
  if (left.body.kind === 'one_piece' && right.body.kind === 'one_piece') {
    return left.body.onePiece.garment.candidateKey !==
      right.body.onePiece.garment.candidateKey;
  }
  if (left.body.kind === 'separates' && right.body.kind === 'separates') {
    return left.body.primaryTop.garment.candidateKey !==
        right.body.primaryTop.garment.candidateKey ||
      left.body.bottom.garment.candidateKey !==
        right.body.bottom.garment.candidateKey;
  }
  return false;
}

function hasTwoCandidateKeysAbsentFrom(
  left: OutfitCandidate,
  right: OutfitCandidate,
): boolean {
  const rightKeys = new Set(right.candidateKeys);
  let absent = 0;
  for (const key of left.candidateKeys) {
    if (!rightKeys.has(key) && (absent += 1) >= 2) {
      return true;
    }
  }
  return false;
}

function meaningfullyDifferent(
  left: OutfitCandidate,
  right: OutfitCandidate,
): boolean {
  return hasDifferentBodyCore(left, right) ||
    hasTwoCandidateKeysAbsentFrom(left, right) ||
    hasTwoCandidateKeysAbsentFrom(right, left);
}

function bodyCoreKey(outfit: OutfitCandidate): string {
  return outfit.body.kind === 'one_piece'
    ? `one_piece|${outfit.body.onePiece.garment.candidateKey}`
    : `separates|${outfit.body.primaryTop.garment.candidateKey}` +
      `|${outfit.body.bottom.garment.candidateKey}`;
}

function rotated<Value>(
  values: readonly Value[],
  startOffset: number,
): readonly Value[] {
  if (values.length === 0) {
    return values;
  }

  const offset = ((startOffset % values.length) + values.length) % values.length;
  return offset === 0
    ? values
    : [...values.slice(offset), ...values.slice(0, offset)];
}

/** One entry from each group in turn, groups keeping their own order. */
function interleaved<Value>(
  groups: readonly (readonly Value[])[],
): readonly Value[] {
  const merged: Value[] = [];
  const longest = groups.reduce((length, group) => Math.max(length, group.length), 0);
  for (let index = 0; index < longest; index += 1) {
    for (const group of groups) {
      const entry = group[index];
      if (entry !== undefined) {
        merged.push(entry);
      }
    }
  }

  return merged;
}

function groupedInOrder<Value>(
  values: readonly Value[],
  keyOf: (value: Value) => string,
): readonly (readonly Value[])[] {
  const groups = new Map<string, Value[]>();
  for (const value of values) {
    const key = keyOf(value);
    const group = groups.get(key);
    if (group) {
      group.push(value);
    } else {
      groups.set(key, [value]);
    }
  }

  return [...groups.values()];
}

/** The layers an arrangement wears, so two body cores can be told to lead with different ones. */
function layerKey(outfit: OutfitCandidate): string {
  return `${outfit.midLayer?.garment.candidateKey ?? '-'}` +
    `|${outfit.outerLayer?.garment.candidateKey ?? '-'}`;
}

/**
 * Every second body core leads with its best layered arrangement. A group that composed none
 * is left alone, and the rest of a group keeps its order.
 *
 * Which of the best-scoring layered arrangements leads is a tie-break. The rule used to take
 * the first one in score order, so body core after body core led with the same jacket and the
 * 2026-09-17 grid showed three identical outer layers in 380 of its 396 layered trios. An
 * arrangement wearing a layer no earlier group led with is taken instead, but only from among
 * those that share the group's best layered score: promoting a lower-scoring one pulled a
 * water-resistant coat onto dry days and cost more in wrong archetype labels than it bought
 * in variety, so the day's own judgement of the layer still decides what is offered.
 */
function layeredHeadOnAlternateGroups(
  groups: readonly (readonly OutfitCandidate[])[],
): readonly (readonly OutfitCandidate[])[] {
  const led = new Set<string>();
  return groups.map((group, index) => {
    const best = group.findIndex((outfit) => optionalLayerCount(outfit) > 0);
    if (best < 0) return group;
    if (index % 2 === 0) {
      if (best === 0) led.add(layerKey(group[0]!));
      return group;
    }

    const unseen = group.findIndex((outfit) =>
      optionalLayerCount(outfit) > 0 &&
      outfit.score === group[best]!.score &&
      !led.has(layerKey(outfit)));
    const head = unseen >= 0 ? unseen : best;
    led.add(layerKey(group[head]!));
    return head === 0
      ? group
      : [group[head]!, ...group.slice(0, head), ...group.slice(head + 1)];
  });
}

/**
 * The order the 24 offered options are taken in. Score order alone lets one garment sweep
 * the pool: two shoes in the same thermal band both fit, the better-scoring one wins every
 * arrangement, and the formality levels and body cores behind it never reach the offer. So
 * the score-sorted list is read as two nested round-robins. The outer one takes one outfit
 * from each formality in turn, along the ladder, so every formality that composed anything
 * keeps a share of the 24 and a dress style that prefers one of them always has something
 * to prefer. The inner one takes one outfit per distinct body core in turn, so an outfit
 * that only swaps a shoe or a layer waits behind every different body. The ladder is fixed
 * rather than the request's own preference, because dress style reorders what is offered
 * and excludes nothing (ADR 0031): the offered set stays the same for all three styles, and
 * the preference is applied afterwards, when the three shown outfits are chosen.
 * `startOffset` still seeds the choice, rotating each formality's own list rather than the
 * flat one, so a day variant cannot spend a whole formality's share.
 *
 * Inside the inner round-robin every second body core is offered with its best layered
 * arrangement in front. A day that requires no layer scores every arrangement alike and the
 * comparator then reads layer count ascending, so each body core led with its bare variant
 * and the pool, being one outfit per core, carried no layer at all. Alternating keeps both
 * readings of the day: half the offer wears what the weather demands, half wears a layer it
 * merely allows, and the group's own score order decides which layer that is, so a light
 * cardigan comes forward where a parka does not.
 */
function orderForOffer(
  outfits: readonly OutfitCandidate[],
  startOffset: number,
): readonly OutfitCandidate[] {
  return interleaved(
    formalityOrder.map((formality) =>
      interleaved(
        layeredHeadOnAlternateGroups(
          groupedInOrder(
            rotated(
              outfits.filter((outfit) => outfit.formality === formality),
              startOffset,
            ),
            bodyCoreKey,
          ),
        ),
      ),
    ),
  );
}

function selectDiverseOutfits(
  outfits: readonly OutfitCandidate[],
  count: number,
): readonly OutfitCandidate[] {
  const selected: OutfitCandidate[] = [];
  for (const outfit of outfits) {
    if (selected.every((candidate) => meaningfullyDifferent(outfit, candidate))) {
      selected.push(outfit);
    }
    if (selected.length === count) {
      break;
    }
  }
  return Object.freeze(selected);
}

/**
 * Every valid composition, sorted best first, each finished with the day's accessories.
 * The mapper rebuilds one stored or AI-chosen option through here, so what it hands back
 * has to carry the accessories that option was written with.
 */
export function collectValidOutfits(
  requirements: ClothingRequirements,
  candidates: readonly GarmentEligibilityResult[],
): OutfitCompositionsResult {
  const result = composeValidOutfits(requirements, candidates);
  return result.status === 'failure'
    ? result
    : Object.freeze({
        status: 'composed',
        outfits: Object.freeze(
          withAccessories(result.outfits, result.accessorySets),
        ),
      });
}

export function composeOutfitOptions(
  requirements: ClothingRequirements,
  candidates: readonly GarmentEligibilityResult[],
  startOffset: number,
  recentWorn: readonly WornOutfit[] = [],
): OutfitCompositionsResult {
  const result = composeValidOutfits(requirements, candidates);
  // Accessories are attached to the offered outfits and to nothing else. The order above
  // them reads score, formality, body core and candidate keys, none of which an accessory
  // touches, so a cold day pays for 24 attachments rather than for its tens of thousands
  // of valid arrangements.
  return result.status === 'failure'
    ? result
    : Object.freeze({
        status: 'composed',
        outfits: excludeRecentlyWornOutfits(withAccessories(
          selectDiverseOutfits(orderForOffer(result.outfits, startOffset), 24),
          result.accessorySets,
        ), recentWorn),
      });
}

function garmentIdSet(outfit: OutfitCandidate): string {
  const body = outfit.body.kind === 'separates'
    ? [outfit.body.primaryTop, outfit.body.bottom] : [outfit.body.onePiece];
  const assigned = [...body, outfit.midLayer, outfit.outerLayer, outfit.footwear,
    ...accessoryOutfitSlots.map((slot) => outfit.accessories[slot])];
  return [...new Set(assigned.filter((item) => item !== null)
    .map((item) => item.garment.garmentTypeId))].sort().join('|');
}

/** The first history row is newest. Relax the oldest exclusion until three remain. */
export function excludeRecentlyWornOutfits(
  outfits: readonly OutfitCandidate[],
  recentWorn: readonly WornOutfit[],
): readonly OutfitCandidate[] {
  const keys = recentWorn.slice(0, 7).map((entry) =>
    [...new Set(Object.values(entry.garments).filter((id) => id !== undefined))].sort().join('|'));
  for (let active = keys.length; active >= 0; active -= 1) {
    const excluded = new Set(keys.slice(0, active));
    const remaining = outfits.filter((outfit) => !excluded.has(garmentIdSet(outfit)));
    if (remaining.length >= 3 || active === 0) return Object.freeze(remaining);
  }
  return outfits;
}
