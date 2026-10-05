import { aiV1OptionLimit } from '@kuyara/contracts';
import type {
  Breathability,
  Coverage,
  Formality,
  GarmentTypeId,
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
  requirementKey,
  type ArmCoverageRequirement,
  type BodyClothingRequirement,
  type BodyClothingRequirements,
  type BreathabilityRequirement,
  type ClothingRequirement,
  type ClothingRequirementReasonCode,
  type ClothingRequirements,
  type ExtremityCoverRequirement,
  type LegCoverageRequirement,
  type ThermalRequirement,
  type WaterProtectionRequirement,
} from '@/features/recommendation/domain/weather-to-clothing-requirements';
import { uniqueInRankOrder } from '@/features/recommendation/domain/rank-order';

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

/** A one-piece is the whole body: it never stands with a top or a bottom. */
export function onePieceExcludes(left: OutfitSlot, right: OutfitSlot): boolean {
  const separate = (slot: OutfitSlot) => slot === 'primary_top' || slot === 'bottom';
  return (left === 'one_piece' && separate(right)) || (right === 'one_piece' && separate(left));
}

/** Whether a catalog garment type can dress one outfit slot: the rule the composer, the manual mix and the worn record share. */
export function garmentFitsSlot(slot: OutfitSlot, id: string): boolean {
  const type = getGarmentType(id);
  if (!type) return false;
  switch (slot) {
    case 'primary_top': return type.structuralCategory === 'top'
      && (type.supportedLayerRoles.includes('base') || type.supportedLayerRoles.includes('standalone'));
    case 'bottom': return type.structuralCategory === 'bottom'
      && type.supportedLayerRoles.includes('standalone');
    case 'one_piece': return type.structuralCategory === 'one_piece'
      && type.supportedLayerRoles.includes('standalone');
    case 'mid_layer': return type.structuralCategory === 'top'
      && type.supportedLayerRoles.includes('mid');
    case 'outer_layer': return (type.structuralCategory === 'top' || type.structuralCategory === 'outerwear')
      && type.supportedLayerRoles.includes('outer');
    case 'footwear': return type.structuralCategory === 'footwear';
    case 'head': case 'neck': case 'hands': return type.structuralCategory === 'accessory'
      && type.bodyRegion === slot;
    case 'handheld': return type.structuralCategory === 'accessory'
      && type.bodyRegion === null;
    default: return false;
  }
}

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

/**
 * The six body slots an outfit fills, in `outfitSlots` order: the body pieces, then the mid
 * layer, the outer layer and the footwear; an empty layer is left out. The one place that
 * flattens an outfit into its assigned garments.
 */
export function assignedOutfitGarments(
  outfit: OutfitCandidate,
): readonly AssignedOutfitGarment[] {
  return [
    ...(outfit.body.kind === 'separates'
      ? [outfit.body.primaryTop, outfit.body.bottom]
      : [outfit.body.onePiece]),
    outfit.midLayer,
    outfit.outerLayer,
    outfit.footwear,
  ].filter((garment): garment is AssignedOutfitGarment => garment !== null);
}

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

/** One body core with its layers: a triple the enumeration pairs with every shoe. */
type BodyPieces = Readonly<{
  body: BodyCore;
  midLayer: EligibleGarmentResult | null;
  outerLayer: EligibleGarmentResult | null;
  /** The body pieces, then the mid and the outer layer. */
  results: readonly EligibleGarmentResult[];
  candidateKeys: ReadonlySet<string>;
  /** Whether one candidate fills two of the triple's slots, which no outfit may do. */
  repeatsCandidate: boolean;
  /** The least and most formal piece, -1 for a piece that has no formality. */
  formalityRange: Readonly<{ lowest: number; highest: number }>;
}>;

function bodyPiecesOf(
  body: BodyCore,
  midLayer: EligibleGarmentResult | null,
  outerLayer: EligibleGarmentResult | null,
): BodyPieces {
  const results = Object.freeze([
    ...(body.kind === 'separates' ? [body.primaryTop, body.bottom] : [body.onePiece]),
    ...(midLayer ? [midLayer] : []),
    ...(outerLayer ? [outerLayer] : []),
  ]);
  const candidateKeys = new Set(results.map(({ candidateKey }) => candidateKey));
  const ranks = results.map(formalityRankOf);
  return Object.freeze({
    body,
    midLayer,
    outerLayer,
    results,
    candidateKeys,
    repeatsCandidate: candidateKeys.size !== results.length,
    formalityRange: Object.freeze({ lowest: Math.min(...ranks), highest: Math.max(...ranks) }),
  });
}

/**
 * Everything a draft wears above the shoes and what the day makes of it, read once per triple
 * and shared by every shoe the triple is paired with, since none of it depends on the shoe.
 * `evaluations` holds the requirements the body side answers on its own, in the day's order,
 * with null where the shoe decides; `penalties` the penalties it earns on its own.
 */
type BodySide = BodyPieces & Readonly<{
  /** `results` without the outer layer. */
  coreAndMid: readonly EligibleGarmentResult[];
  sortedCandidateKeys: readonly string[];
  bodyStrength: number;
  ladderStrength: number;
  breathability: Readonly<{ body: Breathability | null; coreAndMid: Breathability | null }>;
  armCoverage: Coverage | null;
  legCoverage: Coverage | null;
  /** The pieces that carry any warmth, which the thermal evaluation names. */
  thermalCandidateKeys: readonly string[];
  /** The least formal piece that has a formality, -1 when none has. */
  leastFormalRank: number;
  /** Each slot's eligibility score in slot order, -1 for an empty layer. */
  slotScores: readonly number[];
  /** The composition key up to the shoe. */
  compositionKeyPrefix: string;
  /** The body core and the layers, the keys the offer groups and spreads drafts by. */
  bodyCoreKey: string;
  layerKey: string;
  evaluations: readonly (OutfitRequirementEvaluation | null)[];
  penalties: BodySidePenalties;
}>;

type BodySideReadings = Omit<BodySide, 'evaluations' | 'penalties'>;

function bodySideOf(
  pieces: BodyPieces,
  requirements: BodyClothingRequirements,
): BodySide {
  const { body, midLayer, outerLayer, results } = pieces;
  const core = body.kind === 'separates'
    ? [body.primaryTop, body.bottom]
    : [body.onePiece];
  const coreAndMid = Object.freeze([...core, ...(midLayer ? [midLayer] : [])]);
  const formalityRanks = results.map(formalityRankOf).filter((rank) => rank >= 0);
  const readings: BodySideReadings = {
    ...pieces,
    coreAndMid,
    sortedCandidateKeys: Object.freeze(results.map(({ candidateKey }) => candidateKey).sort(compareStrings)),
    bodyStrength: results.reduce((sum, result) => sum + thermalStrengthOf(result), 0),
    ladderStrength: thermalLadderStrength(core[0]!, midLayer, outerLayer),
    breathability: Object.freeze({
      body: minimumBreathability(results),
      coreAndMid: minimumBreathability(coreAndMid),
    }),
    armCoverage: maximumCoverage(results.map(({ garment }) => garment.properties.armCoverage)),
    legCoverage: maximumCoverage(results.map(({ garment }) => garment.properties.legCoverage)),
    thermalCandidateKeys: Object.freeze(
      results
        .filter(({ garment }) =>
          garment.properties.thermalLevel !== null &&
          garment.properties.thermalLevel !== 'none')
        .map(({ candidateKey }) => candidateKey)
        .sort(compareStrings),
    ),
    leastFormalRank: formalityRanks.length === 0 ? -1 : Math.min(...formalityRanks),
    slotScores: Object.freeze([
      ...core.map(({ score }) => score),
      midLayer?.score ?? -1,
      outerLayer?.score ?? -1,
    ]),
    compositionKeyPrefix: [
      body.kind,
      ...core.map(({ candidateKey }) => candidateKey),
      midLayer?.candidateKey ?? '-',
      outerLayer?.candidateKey ?? '-',
    ].join('|'),
    bodyCoreKey: [body.kind, ...core.map(({ garment }) => garment.candidateKey)].join('|'),
    layerKey: `${midLayer?.garment.candidateKey ?? '-'}` +
      `|${outerLayer?.garment.candidateKey ?? '-'}`,
  };
  const evaluations = Object.freeze(requirements.requirements.map((requirement) =>
    readsFootwear(requirement) ? null : evaluateBodyRequirement(requirement, readings, requirements)));
  return Object.freeze({
    ...readings,
    evaluations,
    penalties: bodySidePenalties(requirements, readings, evaluations),
  });
}

function minimumBreathability(
  results: readonly EligibleGarmentResult[],
  allowLightModerate = false,
): Breathability | null {
  const values = results.map(({ garment }) => {
    const properties = garment.properties;
    // Mandatory high heat accepts moderate airflow when the garment is light and unsealed.
    return allowLightModerate && properties.breathability === 'moderate' &&
      (properties.thermalLevel === 'none' || properties.thermalLevel === 'light') &&
      (properties.waterProtection === null || properties.waterProtection === 'none') &&
      (properties.windProtection === null || properties.windProtection === 'none')
      ? 'high' : properties.breathability;
  });
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
function thermalLadderStrength(
  core: EligibleGarmentResult,
  midLayer: EligibleGarmentResult | null,
  outerLayer: EligibleGarmentResult | null,
): number {
  return thermalStrengthOf(core) +
    thermalStrengthOf(midLayer) +
    thermalStrengthOf(outerLayer);
}

function aggregateProperties(
  side: BodySideReadings,
  footwear: EligibleGarmentResult,
): OutfitAggregateProperties {
  return Object.freeze({
    thermal: Object.freeze({
      bodyStrength: side.bodyStrength,
      effectiveBodyLevel: effectiveThermalLevel(side.bodyStrength),
      footwear: footwear.garment.properties.thermalLevel,
    }),
    breathability: Object.freeze({
      body: side.breathability.body,
      coreAndMid: side.breathability.coreAndMid,
      footwear: footwear.garment.properties.breathability,
    }),
    armCoverage: side.armCoverage,
    legCoverage: side.legCoverage,
    bodyWaterProtection:
      side.outerLayer?.garment.properties.waterProtection ?? null,
    footwearWaterProtection:
      footwear.garment.properties.waterProtection,
    windProtection:
      side.outerLayer?.garment.properties.windProtection ?? null,
    tractionSuitability:
      footwear.garment.properties.tractionSuitability,
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
  outerLayer: EligibleGarmentResult,
  requirements: BodyClothingRequirements,
): boolean {
  return requirements.requirements.some((requirement) => {
    const targetsOuter =
      (requirement.kind === 'water_protection' &&
        requirement.target === 'body') ||
      requirement.kind === 'wind_protection';
    return targetsOuter &&
      requirement.priority === 'mandatory' &&
      findEvaluation(outerLayer, requirement)?.status === 'met';
  });
}

/** Whether the shoe decides a requirement: the day's warmth reaches the feet, and the feet's own water and grip. */
function readsFootwear(requirement: BodyClothingRequirement): boolean {
  return requirement.kind === 'thermal' ||
    requirement.kind === 'traction' ||
    (requirement.kind === 'water_protection' && requirement.target === 'feet');
}

function outfitEvaluation(
  requirement: BodyClothingRequirement,
  status: OutfitRequirementEvaluation['status'],
  contribution: number,
  observedContribution: number,
  suppliedByCandidateKeys: readonly string[],
  tradeoffCandidateKeys: readonly string[] = Object.freeze([]),
): OutfitRequirementEvaluation {
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

/**
 * A requirement one garment answers on its own, read from that garment's own evaluation: the
 * outer layer for the body's water and the wind, the shoe for the feet's water and grip.
 */
function suppliedEvaluation(
  requirement: BodyClothingRequirement,
  supplier: EligibleGarmentResult | null,
): OutfitRequirementEvaluation {
  const evaluation = findEvaluation(supplier, requirement);
  const contribution = evaluation?.contribution ?? 0;
  const missing = !evaluation ||
    evaluation.status === 'missing' ||
    evaluation.status === 'not_applicable';
  return outfitEvaluation(
    requirement,
    evaluationStatus(contribution, missing),
    contribution,
    contribution,
    Object.freeze(supplier && !missing ? [supplier.candidateKey] : []),
  );
}

function coverageEvaluation(
  requirement: ArmCoverageRequirement | LegCoverageRequirement,
  side: BodySideReadings,
): OutfitRequirementEvaluation {
  const coverageOf = ({ garment }: EligibleGarmentResult) =>
    requirement.kind === 'arm_coverage'
      ? garment.properties.armCoverage
      : garment.properties.legCoverage;
  const actual = requirement.kind === 'arm_coverage' ? side.armCoverage : side.legCoverage;
  const contribution = actual === null
    ? 0
    : percentage(coverageStrength[actual], coverageStrength[requirement.minimum]);
  return outfitEvaluation(
    requirement,
    evaluationStatus(contribution, actual === null),
    contribution,
    contribution,
    Object.freeze(
      side.results
        .filter((result) => coverageOf(result) !== null)
        .map(({ candidateKey }) => candidateKey)
        .sort(compareStrings),
    ),
  );
}

function breathabilityEvaluation(
  requirement: BreathabilityRequirement,
  side: BodySideReadings,
  requirements: BodyClothingRequirements,
): OutfitRequirementEvaluation {
  const required = breathabilityStrength[requirement.minimum];
  const allowLightModerate = requirement.priority === 'mandatory' &&
    requirement.minimum === 'high';
  const bodyValue = allowLightModerate
    ? minimumBreathability(side.results, true)
    : side.breathability.body;
  const coreValue = allowLightModerate
    ? minimumBreathability(side.coreAndMid, true)
    : side.breathability.coreAndMid;
  const observedContribution = bodyValue === null
    ? 0
    : percentage(breathabilityStrength[bodyValue], required);

  if (
    requirement.priority === 'mandatory' &&
    observedContribution < 100 &&
    coreValue !== null &&
    breathabilityStrength[coreValue] >= required &&
    side.outerLayer &&
    mandatoryProtectiveOuter(side.outerLayer, requirements)
  ) {
    return outfitEvaluation(
      requirement,
      'tradeoff',
      100,
      observedContribution,
      side.sortedCandidateKeys,
      Object.freeze([side.outerLayer.candidateKey]),
    );
  }

  return outfitEvaluation(
    requirement,
    evaluationStatus(observedContribution, bodyValue === null),
    observedContribution,
    observedContribution,
    side.sortedCandidateKeys,
  );
}

function thermalEvaluation(
  requirement: ThermalRequirement,
  side: BodySideReadings,
  footwear: EligibleGarmentResult,
): OutfitRequirementEvaluation {
  const required = thermalStrength[requirement.minimum];
  const contribution = Math.min(
    percentage(side.ladderStrength, required),
    shellPercentage(requirement.minimum, side.outerLayer),
    footwearThermalPercentage(required, footwear.garment.properties.thermalLevel),
  );
  return outfitEvaluation(
    requirement,
    evaluationStatus(contribution, false),
    contribution,
    contribution,
    side.thermalCandidateKeys,
  );
}

/** A requirement the body side answers whatever the shoe: see `readsFootwear`. */
function evaluateBodyRequirement(
  requirement: BodyClothingRequirement,
  side: BodySideReadings,
  requirements: BodyClothingRequirements,
): OutfitRequirementEvaluation {
  switch (requirement.kind) {
    case 'breathability':
      return breathabilityEvaluation(requirement, side, requirements);
    case 'arm_coverage':
    case 'leg_coverage':
      return coverageEvaluation(requirement, side);
    case 'water_protection':
    case 'wind_protection':
      return suppliedEvaluation(requirement, side.outerLayer);
    default:
      throw new Error(`The shoe decides the ${requirement.kind} requirement.`);
  }
}

/** A requirement the shoe decides: see `readsFootwear`. */
function evaluateFootwearRequirement(
  requirement: BodyClothingRequirement,
  side: BodySideReadings,
  footwear: EligibleGarmentResult,
): OutfitRequirementEvaluation {
  switch (requirement.kind) {
    case 'thermal':
      return thermalEvaluation(requirement, side, footwear);
    case 'water_protection':
    case 'traction':
      return suppliedEvaluation(requirement, footwear);
    default:
      throw new Error(`The body side decides the ${requirement.kind} requirement.`);
  }
}

/** Every requirement of the day against one draft, in the day's order. */
function draftEvaluations(
  side: BodySide,
  footwear: EligibleGarmentResult,
  requirements: BodyClothingRequirements,
): readonly OutfitRequirementEvaluation[] {
  return Object.freeze(requirements.requirements.map((requirement, index) =>
    side.evaluations[index] ?? evaluateFootwearRequirement(requirement, side, footwear)));
}

function thermalOverProtectionPenalty(
  requirements: BodyClothingRequirements,
  side: BodySideReadings,
): number {
  const requirement = requirements.requirements.find(
    (candidate) => candidate.kind === 'thermal',
  );
  const bodyStrength = side.bodyStrength;

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
  const ladder = side.ladderStrength;
  const stack = requirement.minimum === 'high'
    ? 0
    : Math.max(ladder - thermalStrength[requirement.minimum], 0);
  const bottom = Math.max(bodyStrength - ladder - thermalStrength.light, 0);
  return (stack + bottom) * 5;
}

/**
 * Water protection the day never asked for costs a little, on every day, for the body's outer
 * layer and for the shoe alike. The penalty used to apply only once the day was warm enough
 * to ask for breathability, so a 12 °C dry day, which asks for neither, offered three outfits
 * in rain jackets.
 */
function unnecessaryWaterProtectionPenalty(
  requirements: BodyClothingRequirements,
  target: WaterProtectionRequirement['target'],
  supplier: EligibleGarmentResult | null,
): number {
  const asked = requirements.requirements.some(
    (requirement) =>
      requirement.kind === 'water_protection' && requirement.target === target,
  );
  const value = supplier?.garment.properties.waterProtection ?? null;
  return asked ? 0 : value === 'waterproof' ? 10 : value === 'water_resistant' ? 5 : 0;
}

function breathabilityTradeoffPenalty(
  requirements: BodyClothingRequirements,
  outerLayer: EligibleGarmentResult | null,
  evaluations: readonly (OutfitRequirementEvaluation | null)[],
): number {
  const tradeoff = evaluations.find(
    (evaluation) =>
      evaluation?.requirement.kind === 'breathability' &&
      evaluation.status === 'tradeoff',
  );
  if (!tradeoff || !outerLayer) {
    return 0;
  }

  const requirement = requirements.requirements.find(
    (candidate) => candidate.kind === 'breathability',
  );
  const actual = outerLayer.garment.properties.breathability;
  if (!requirement) {
    return 0;
  }

  const deficit = breathabilityStrength[requirement.minimum] -
    (actual === null ? 0 : breathabilityStrength[actual]);
  return Math.min(Math.max(deficit, 0) * 10, 20);
}

/** The penalties a body side earns whatever the shoe; the shoe adds only its own water protection. */
type BodySidePenalties = Readonly<{
  thermalOverProtection: number;
  bodyWaterProtection: number;
  breathabilityProtectionTradeoff: number;
}>;

function bodySidePenalties(
  requirements: BodyClothingRequirements,
  side: BodySideReadings,
  evaluations: readonly (OutfitRequirementEvaluation | null)[],
): BodySidePenalties {
  return Object.freeze({
    thermalOverProtection: thermalOverProtectionPenalty(requirements, side),
    bodyWaterProtection: unnecessaryWaterProtectionPenalty(requirements, 'body', side.outerLayer),
    breathabilityProtectionTradeoff: breathabilityTradeoffPenalty(
      requirements,
      side.outerLayer,
      evaluations,
    ),
  });
}

type DraftScore = Readonly<{
  score: number;
  scoreBeforePenalties: number;
  penaltyPoints: number;
  penaltyBreakdown: OutfitPenaltyBreakdown;
}>;

/** Mandatory requirements weigh twice; the penalties come off the weighted mean, at most 30. */
function scoreDraft(
  side: BodySide,
  footwear: EligibleGarmentResult,
  evaluations: readonly OutfitRequirementEvaluation[],
  requirements: BodyClothingRequirements,
): DraftScore {
  const weightOf = (evaluation: OutfitRequirementEvaluation) =>
    evaluation.requirement.priority === 'mandatory' ? 2 : 1;
  const weightedTotal = evaluations.reduce(
    (sum, evaluation) => sum + evaluation.contribution * weightOf(evaluation),
    0,
  );
  const totalWeight = evaluations.reduce((sum, evaluation) => sum + weightOf(evaluation), 0);
  const scoreBeforePenalties = totalWeight === 0
    ? 50
    : Math.round(weightedTotal / totalWeight);
  const penaltyBreakdown = Object.freeze({
    thermalOverProtection: side.penalties.thermalOverProtection,
    unnecessaryWaterProtection: side.penalties.bodyWaterProtection +
      unnecessaryWaterProtectionPenalty(requirements, 'feet', footwear),
    breathabilityProtectionTradeoff: side.penalties.breathabilityProtectionTradeoff,
  });
  const penaltyPoints = Math.min(
    penaltyBreakdown.thermalOverProtection +
      penaltyBreakdown.unnecessaryWaterProtection +
      penaltyBreakdown.breathabilityProtectionTradeoff,
    30,
  );
  return Object.freeze({
    score: Math.max(scoreBeforePenalties - penaltyPoints, 0),
    scoreBeforePenalties,
    penaltyPoints,
    penaltyBreakdown,
  });
}

function penaltyReasonCodes(
  penalties: OutfitPenaltyBreakdown,
): readonly OutfitCompositionReasonCode[] {
  const reasons: OutfitCompositionReasonCode[] = [];
  if (penalties.breathabilityProtectionTradeoff > 0) {
    reasons.push('breathability_protection_tradeoff');
  }
  if (penalties.thermalOverProtection > 0) {
    reasons.push('thermal_over_protection');
  }
  if (penalties.unnecessaryWaterProtection > 0) {
    reasons.push('unnecessary_water_protection');
  }
  return uniqueInRankOrder(reasons, reasonOrder);
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

function compositionKeyOf(side: BodySideReadings, footwear: EligibleGarmentResult): string {
  return `${side.compositionKeyPrefix}|${footwear.candidateKey}`;
}

type WornPiece = Readonly<{ garment: Readonly<{ garmentTypeId: string }> }>;

export function isFormalSuit(
  outfit: Readonly<{
    body:
      | Readonly<{ kind: 'separates'; primaryTop: WornPiece; bottom: WornPiece }>
      | Readonly<{ kind: 'one_piece'; onePiece: WornPiece }>;
    midLayer: WornPiece | null;
    outerLayer: WornPiece | null;
    footwear: WornPiece;
  }>,
): boolean {
  return outfit.body.kind === 'separates' &&
    outfit.body.primaryTop.garment.garmentTypeId === 'shirt' &&
    outfit.body.bottom.garment.garmentTypeId === 'trousers' &&
    outfit.midLayer === null &&
    outfit.outerLayer?.garment.garmentTypeId === 'blazer' &&
    outfit.footwear.garment.garmentTypeId === 'closed_shoes';
}

function formalityRankOf(result: EligibleGarmentResult): number {
  const formality = getGarmentType(result.garment.garmentTypeId)?.formality;
  return formality ? formalityOrder.indexOf(formality) : -1;
}

/** A formal suit reads formal; anything else reads as its least formal piece, casual when none says. */
function draftFormality(side: BodySide, footwear: EligibleGarmentResult): Formality {
  if (isFormalSuit({ body: side.body, midLayer: side.midLayer, outerLayer: side.outerLayer, footwear })) {
    return 'formal';
  }
  const ranks = [side.leastFormalRank, formalityRankOf(footwear)].filter((rank) => rank >= 0);
  return ranks.length === 0 ? 'casual' : formalityOrder[Math.min(...ranks)]!;
}

/** A draft whose pieces sit more than one formality apart, or carry none, is never composed. */
function formalitySpreadFits(lowest: number, highest: number): boolean {
  return lowest >= 0 && highest - lowest <= 1;
}

function meetsRequirement({ requirement, status }: OutfitRequirementEvaluation): boolean {
  return requirement.priority === 'optional' ||
    status === 'met' ||
    status === 'tradeoff';
}

/**
 * A draft judged against the day: its evaluations, score, formality and key. The order and the
 * offer read only these, so a composed outfit is built from one only once it is shown.
 */
type JudgedDraft = Readonly<{
  side: BodySide;
  footwear: EligibleGarmentResult;
  evaluations: readonly OutfitRequirementEvaluation[];
  score: DraftScore;
  formality: Formality;
  compositionKey: string;
}>;

function judgeDraft(
  side: BodySide,
  footwear: EligibleGarmentResult,
  requirements: BodyClothingRequirements,
  evaluations = draftEvaluations(side, footwear, requirements),
): JudgedDraft {
  return Object.freeze({
    side,
    footwear,
    evaluations,
    score: scoreDraft(side, footwear, evaluations, requirements),
    formality: draftFormality(side, footwear),
    compositionKey: compositionKeyOf(side, footwear),
  });
}

/** The outfit a judged draft stands for, with runtime roles assigned and no accessories yet. */
function outfitOf(judged: JudgedDraft): OutfitCandidate {
  const { side, footwear, score } = judged;
  const midLayer = side.midLayer
    ? assignedGarment(side.midLayer, 'mid_layer', 'mid')
    : null;
  const outerLayer = side.outerLayer
    ? assignedGarment(side.outerLayer, 'outer_layer', 'outer')
    : null;
  const body: OutfitBody = side.body.kind === 'separates'
    ? Object.freeze({
        kind: 'separates',
        primaryTop: assignedGarment(
          side.body.primaryTop,
          'primary_top',
          primaryRole(side.body.primaryTop, side.midLayer !== null),
        ),
        bottom: assignedGarment(side.body.bottom, 'bottom', 'standalone'),
      })
    : Object.freeze({
        kind: 'one_piece',
        onePiece: assignedGarment(
          side.body.onePiece,
          'one_piece',
          'standalone',
        ),
      });

  return Object.freeze({
    body,
    midLayer,
    outerLayer,
    footwear: assignedGarment(footwear, 'footwear', null),
    accessories: noAccessories,
    aggregates: aggregateProperties(side, footwear),
    requirementEvaluations: judged.evaluations,
    score: score.score,
    scoreBeforePenalties: score.scoreBeforePenalties,
    penaltyPoints: score.penaltyPoints,
    penaltyBreakdown: score.penaltyBreakdown,
    reasonCodes: penaltyReasonCodes(score.penaltyBreakdown),
    candidateKeys: Object.freeze(
      side.results
        .map(({ candidateKey }) => candidateKey)
        .concat(footwear.candidateKey)
        .sort(compareStrings),
    ),
    compositionKey: judged.compositionKey,
    formality: judged.formality,
  });
}

function optionalLayerCount(draft: JudgedDraft): number {
  return Number(draft.side.midLayer !== null) + Number(draft.side.outerLayer !== null);
}

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

function accessoriesOfSlot(
  accessories: readonly EligibleGarmentResult[],
  slot: AccessoryOutfitSlot,
): readonly EligibleGarmentResult[] {
  const region = accessoryRegionBySlot[slot];
  return accessories.filter(({ garment }) => garment.properties.bodyRegion === region);
}

/**
 * The accessories that answer a requirement today, by the slot each one fills: the ones the
 * composer would offer for that slot on this day, best first. Detail's accessory picker lists
 * them first. Candidates that are not eligible, or that answer nothing the day asked, are
 * left out; on a day that asks nothing of the head, neck, hands or rain, every slot is empty.
 */
export function offeredAccessoriesBySlot(
  candidates: readonly GarmentEligibilityResult[],
): Readonly<Record<AccessoryOutfitSlot, readonly EligibleGarmentResult[]>> {
  const offered = offeredAccessories(
    candidates
      .filter((candidate): candidate is EligibleGarmentResult => candidate.status === 'eligible')
      .sort(compareGarmentEligibilityResults),
  );
  return Object.freeze(Object.fromEntries(
    accessoryOutfitSlots.map((slot) => [slot, accessoriesOfSlot(offered, slot)]),
  ) as Record<AccessoryOutfitSlot, readonly EligibleGarmentResult[]>);
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
 * closest formality decides which one fills the slot, except that cold head protection
 * takes priority over formality. Where a region offers
 * a single garment the formality step never excludes it: gloves and the umbrella belong to
 * a casual outfit exactly as much as to a formal one.
 */
function accessoryForSlot(
  accessories: readonly EligibleGarmentResult[],
  slot: AccessoryOutfitSlot,
  formality: Formality,
): AssignedOutfitGarment | null {
  const offered = accessoriesOfSlot(accessories, slot);
  if (offered.length === 0) {
    return null;
  }

  const outfitRank = formalityOrder.indexOf(formality);
  const chosen = offered.reduce((best, candidate) => {
    const suitability = best.score - candidate.score;
    const order = formalityDistance(candidate, outfitRank) -
      formalityDistance(best, outfitRank);
    const better = slot === 'head'
      ? suitability < 0 || (suitability === 0 && (order < 0 ||
        (order === 0 && compareGarmentEligibilityResults(candidate, best) < 0)))
      : order < 0 || (order === 0 && compareGarmentEligibilityResults(candidate, best) < 0);
    return better ? candidate : best;
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

/** The day's eligible candidates by the slots they can fill, best first, once the day can dress a body and feet at all. */
type ComposerDay = Readonly<{
  status: 'ready';
  requirements: BodyClothingRequirements;
  mandatoryRequirements: readonly BodyClothingRequirement[];
  consideredCandidateKeys: readonly string[];
  eligible: readonly EligibleGarmentResult[];
  bodyCores: readonly BodyCore[];
  midLayers: readonly EligibleGarmentResult[];
  outerLayers: readonly EligibleGarmentResult[];
  footwear: readonly EligibleGarmentResult[];
}>;

/**
 * Reads the day the composer arranges: its body requirements and its eligible candidates by
 * slot, or the failure no arrangement gets past (a conflicting key, no body, no shoe). It
 * assigns no roles and does not mutate garment data or re-evaluate garment-level requirement
 * applicability.
 */
function readComposerDay(
  allRequirements: ClothingRequirements,
  candidates: readonly GarmentEligibilityResult[],
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
  });
}

/** Every body-and-layers triple the enumeration pairs with the shoes, in enumeration order. */
function* bodyTriples(day: ComposerDay): Generator<BodyPieces> {
  const midOptions = [null, ...day.midLayers];
  const outerOptions = [null, ...day.outerLayers];
  for (const body of day.bodyCores) {
    for (const midLayer of midOptions) {
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
function validDrafts(day: ComposerDay): readonly JudgedDraft[] {
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
function noValidCompositionFailure(day: ComposerDay): OutfitCompositionFailure {
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

function hasDifferentBodyCore(
  left: JudgedDraft,
  right: JudgedDraft,
): boolean {
  const leftBody = left.side.body;
  const rightBody = right.side.body;
  if (leftBody.kind !== rightBody.kind) {
    return true;
  }
  if (leftBody.kind === 'one_piece' && rightBody.kind === 'one_piece') {
    return leftBody.onePiece.garment.candidateKey !==
      rightBody.onePiece.garment.candidateKey;
  }
  if (leftBody.kind === 'separates' && rightBody.kind === 'separates') {
    return leftBody.primaryTop.garment.candidateKey !==
        rightBody.primaryTop.garment.candidateKey ||
      leftBody.bottom.garment.candidateKey !==
        rightBody.bottom.garment.candidateKey;
  }
  return false;
}

function wearsCandidate(draft: JudgedDraft, key: string): boolean {
  return draft.side.candidateKeys.has(key) || draft.footwear.candidateKey === key;
}

function hasTwoCandidateKeysAbsentFrom(
  left: JudgedDraft,
  right: JudgedDraft,
): boolean {
  let absent = 0;
  for (const key of [...left.side.candidateKeys, left.footwear.candidateKey]) {
    if (!wearsCandidate(right, key) && (absent += 1) >= 2) {
      return true;
    }
  }
  return false;
}

function meaningfullyDifferent(
  left: JudgedDraft,
  right: JudgedDraft,
): boolean {
  return hasDifferentBodyCore(left, right) ||
    hasTwoCandidateKeysAbsentFrom(left, right) ||
    hasTwoCandidateKeysAbsentFrom(right, left);
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
  groups: readonly (readonly JudgedDraft[])[],
): readonly (readonly JudgedDraft[])[] {
  const led = new Set<string>();
  return groups.map((group, index) => {
    const best = group.findIndex((outfit) => optionalLayerCount(outfit) > 0);
    if (best < 0) return group;
    if (index % 2 === 0) {
      if (best === 0) led.add(group[0]!.side.layerKey);
      return group;
    }

    const unseen = group.findIndex((outfit) =>
      optionalLayerCount(outfit) > 0 &&
      outfit.score.score === group[best]!.score.score &&
      !led.has(outfit.side.layerKey));
    const head = unseen >= 0 ? unseen : best;
    led.add(group[head]!.side.layerKey);
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
  outfits: readonly JudgedDraft[],
  startOffset: number,
): readonly JudgedDraft[] {
  return interleaved(
    formalityOrder.map((formality) =>
      interleaved(
        layeredHeadOnAlternateGroups(
          groupedInOrder(
            rotated(
              outfits.filter((outfit) => outfit.formality === formality),
              startOffset,
            ),
            ({ side }) => side.bodyCoreKey,
          ),
        ),
      ),
    ),
  );
}

/**
 * Takes outfits in order while each is meaningfully different from every one already taken,
 * the `reserved` ones counting as taken from the start. The result keeps the order given.
 */
function selectDiverseOutfits(
  outfits: readonly JudgedDraft[],
  count: number,
  reserved: readonly JudgedDraft[] = [],
): readonly JudgedDraft[] {
  const selected = [...reserved];
  for (const outfit of outfits) {
    if (selected.length === count) {
      break;
    }
    if (!selected.includes(outfit) &&
      selected.every((candidate) => meaningfullyDifferent(outfit, candidate))) {
      selected.push(outfit);
    }
  }
  return Object.freeze(outfits.filter((outfit) => selected.includes(outfit)));
}

/**
 * The offered outfits, keeping the share every formality is promised. The diversity rule alone
 * can drop a formality: a day's only formal outfit, a suit, is not meaningfully different from
 * a smart look in the same shirt and trousers that the order offered first. A formality that
 * composed something but reached none of the offer has its first outfit reserved, and the
 * selection runs again around it, so the offer stays meaningfully different throughout. A day
 * that loses no formality is offered exactly what the diversity rule takes.
 */
function selectOfferedOutfits(
  outfits: readonly JudgedDraft[],
  count: number,
): readonly JudgedDraft[] {
  const reserved: JudgedDraft[] = [];
  for (;;) {
    const selected = selectDiverseOutfits(outfits, count, reserved);
    const reserve = outfits.find((outfit) =>
      !selected.some(({ formality }) => formality === outfit.formality) &&
      reserved.every((candidate) => meaningfullyDifferent(outfit, candidate)));
    if (!reserve) return selected;
    reserved.push(reserve);
  }
}

/** One arrangement a person put together on detail (Phase 7 manual mix), slot by slot. */
export type OutfitArrangement = Readonly<{
  body:
    | Readonly<{ kind: 'separates'; primaryTop: GarmentEligibilityResult; bottom: GarmentEligibilityResult }>
    | Readonly<{ kind: 'one_piece'; onePiece: GarmentEligibilityResult }>;
  midLayer: GarmentEligibilityResult | null;
  outerLayer: GarmentEligibilityResult | null;
  footwear: GarmentEligibilityResult;
}>;

/**
 * A piece a person chose reads as eligible even when it fails a hard requirement: its
 * evaluations and a zero score still describe what they chose.
 */
function asEligibleDraftPart(result: GarmentEligibilityResult): EligibleGarmentResult {
  if (result.status === 'eligible') return result;
  if (result.garment === null) throw new Error('An arrangement piece has no catalog garment.');
  return Object.freeze({ ...result, status: 'eligible', garment: result.garment, score: 0,
    scoreBeforePenalties: 0, penaltyPoints: 0 });
}

/**
 * One accessory a person put on in detail, built as the composer builds one it attached. An
 * accessory that does not answer today's weather is still wearable and never changes the
 * outfit's verdict: accessories are not part of the arrangement.
 */
export function assignAccessory(
  slot: AccessoryOutfitSlot,
  result: GarmentEligibilityResult,
): AssignedOutfitGarment {
  return assignedGarment(asEligibleDraftPart(result), slot, null);
}

/**
 * Evaluates an arrangement with the composer's own rules, without composing anything. The
 * arrangement is never rejected: `suitable` is the domain's weather verdict, true only when
 * every piece passes its own hard requirements and the set meets every mandatory
 * requirement, exactly what a composed outfit must satisfy. Formality consistency is not
 * part of it, because the verdict speaks only of the weather. A piece that fails a hard
 * requirement still counts with its evaluations, so the reasoning and the score describe
 * what the person actually chose. The result carries no accessories.
 */
export function evaluateArrangement(
  requirements: ClothingRequirements,
  arrangement: OutfitArrangement,
): Readonly<{ outfit: OutfitCandidate; suitable: boolean }> {
  const results = [
    ...(arrangement.body.kind === 'separates'
      ? [arrangement.body.primaryTop, arrangement.body.bottom]
      : [arrangement.body.onePiece]),
    arrangement.midLayer,
    arrangement.outerLayer,
    arrangement.footwear,
  ].filter((result) => result !== null);
  const bodyRequirements = bodyClothingRequirements(requirements);
  const side = bodySideOf(bodyPiecesOf(
    arrangement.body.kind === 'separates'
      ? Object.freeze({ kind: 'separates', primaryTop: asEligibleDraftPart(arrangement.body.primaryTop),
        bottom: asEligibleDraftPart(arrangement.body.bottom) })
      : Object.freeze({ kind: 'one_piece', onePiece: asEligibleDraftPart(arrangement.body.onePiece) }),
    arrangement.midLayer ? asEligibleDraftPart(arrangement.midLayer) : null,
    arrangement.outerLayer ? asEligibleDraftPart(arrangement.outerLayer) : null,
  ), bodyRequirements);
  const outfit = outfitOf(judgeDraft(side, asEligibleDraftPart(arrangement.footwear), bodyRequirements));
  return Object.freeze({
    outfit,
    suitable: results.every(({ status }) => status === 'eligible') &&
      outfit.requirementEvaluations.every(meetsRequirement),
  });
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
  const day = readComposerDay(requirements, candidates);
  if (day.status === 'failure') return day;
  const valid = validDrafts(day);
  if (valid.length === 0) return noValidCompositionFailure(day);
  return Object.freeze({
    status: 'composed',
    outfits: Object.freeze(
      withAccessories(valid.map(outfitOf), accessorySetsByFormality(day.eligible)),
    ),
  });
}

/**
 * A piece a person chose to wear around: one catalog garment type held to one of the six body
 * slots. Slot-bound, because a sweater is either a top or a mid layer and the two are
 * different outfits.
 */
export type OutfitPin = Readonly<{
  slot: Exclude<OutfitSlot, AccessoryOutfitSlot>;
  garmentTypeId: GarmentTypeId;
}>;

/** How many outfits Today offers: as many as one AI request carries. */
export const offeredOutfitLimit = aiV1OptionLimit;

/** How many outfits compose around chosen pieces offers: at most three, one or two when that is all there are. */
export const composedOutfitLimit = 3;

function pinnedGarmentId(outfit: OutfitCandidate, slot: OutfitPin['slot']): string | undefined {
  switch (slot) {
    case 'primary_top':
      return outfit.body.kind === 'separates' ? outfit.body.primaryTop.garment.garmentTypeId : undefined;
    case 'bottom':
      return outfit.body.kind === 'separates' ? outfit.body.bottom.garment.garmentTypeId : undefined;
    case 'one_piece':
      return outfit.body.kind === 'one_piece' ? outfit.body.onePiece.garment.garmentTypeId : undefined;
    case 'mid_layer':
      return outfit.midLayer?.garment.garmentTypeId;
    case 'outer_layer':
      return outfit.outerLayer?.garment.garmentTypeId;
    case 'footwear':
      return outfit.footwear.garment.garmentTypeId;
  }
}

/** Whether an outfit wears every pin in the slot the pin names. */
export function outfitWearsPins(outfit: OutfitCandidate, pins: readonly OutfitPin[]): boolean {
  return pins.every(({ slot, garmentTypeId }) => pinnedGarmentId(outfit, slot) === garmentTypeId);
}

/** Whether a slot wears what every pin naming that slot names; an empty slot wears no pin. */
function slotWearsPins(
  slot: OutfitPin['slot'],
  result: EligibleGarmentResult | null,
  pins: readonly OutfitPin[],
): boolean {
  return pins.every((pin) => pin.slot !== slot || pin.garmentTypeId === result?.garment.garmentTypeId);
}

function bodyCoreWearsPins(body: BodyCore, pins: readonly OutfitPin[]): boolean {
  return body.kind === 'separates'
    ? slotWearsPins('primary_top', body.primaryTop, pins) &&
      slotWearsPins('bottom', body.bottom, pins) &&
      slotWearsPins('one_piece', null, pins)
    : slotWearsPins('one_piece', body.onePiece, pins) &&
      slotWearsPins('primary_top', null, pins) &&
      slotWearsPins('bottom', null, pins);
}

/** Whether a draft wears every pin in the slot the pin names. */
function draftWearsPins({ side, footwear }: JudgedDraft, pins: readonly OutfitPin[]): boolean {
  return bodyCoreWearsPins(side.body, pins) &&
    slotWearsPins('mid_layer', side.midLayer, pins) &&
    slotWearsPins('outer_layer', side.outerLayer, pins) &&
    slotWearsPins('footwear', footwear, pins);
}

/**
 * The offer around pins. The pin is a predicate on every valid draft, taken after the sort and
 * before the order, the diversity rule and the accessories, because the 24 Today offers hold
 * the pin in none of their outfits more often than not. The reader's own pieces always show,
 * so the recently worn exclusion does not apply, and the three picks are the most that can
 * differ.
 */
function offerAroundPins(
  day: ComposerDay,
  pinned: readonly JudgedDraft[],
  startOffset: number,
): readonly OutfitCandidate[] {
  return withAccessories(
    selectDiverseOutfits(orderForOffer(pinned, startOffset), composedOutfitLimit).map(outfitOf),
    accessorySetsByFormality(day.eligible),
  );
}

export function composeOutfitOptions(
  requirements: ClothingRequirements,
  candidates: readonly GarmentEligibilityResult[],
  startOffset: number,
  recentWorn: readonly WornOutfit[] = [],
): OutfitCompositionsResult {
  const day = readComposerDay(requirements, candidates);
  if (day.status === 'failure') return day;
  const valid = validDrafts(day);
  if (valid.length === 0) return noValidCompositionFailure(day);
  // Only the offered drafts become outfits, and only they take accessories. The order and the
  // diversity rule read score, formality, body core and candidate keys, none of which an
  // accessory touches, so a mild day builds 24 outfits rather than its tens of thousands of
  // valid arrangements.
  return Object.freeze({
    status: 'composed',
    outfits: excludeRecentlyWornOutfits(withAccessories(
      selectOfferedOutfits(orderForOffer(valid, startOffset), offeredOutfitLimit).map(outfitOf),
      accessorySetsByFormality(day.eligible),
    ), recentWorn),
  });
}

export type OutfitsAroundPins = Readonly<{
  status: 'composed';
  /** At most three. Empty only when no outfit at all is valid for the day, which is a failure instead. */
  outfits: readonly OutfitCandidate[];
  /** The largest set of pins one valid outfit wears, earlier pins winning a tie. */
  satisfiedPins: readonly OutfitPin[];
  /** The rest: no valid outfit wears them together with the satisfied ones. */
  unsatisfiedPins: readonly OutfitPin[];
}>;

function pinSubsets(pins: readonly OutfitPin[]): readonly (readonly OutfitPin[])[] {
  const subsets: OutfitPin[][] = [[]];
  for (const pin of pins) subsets.push(...subsets.map((subset) => [...subset, pin]));
  return subsets.sort((left, right) => right.length - left.length);
}

/**
 * Compose around the pins, keeping as many as any valid outfit can wear together. The valid
 * drafts are judged and sorted once; the subsets are only filters over them, and only the
 * three picks become outfits. Whatever pins fit no valid outfit are reported back for the
 * caller to put into the best pick, which the weather then calls unusual, exactly as a manual
 * change does.
 */
export function composeOutfitsAroundPins(
  requirements: ClothingRequirements,
  candidates: readonly GarmentEligibilityResult[],
  startOffset: number,
  pins: readonly OutfitPin[],
): OutfitCompositionFailure | OutfitsAroundPins {
  const day = readComposerDay(requirements, candidates);
  if (day.status === 'failure') return day;
  const valid = validDrafts(day);
  if (valid.length === 0) return noValidCompositionFailure(day);
  for (const subset of pinSubsets(pins)) {
    const pinned = valid.filter((draft) => draftWearsPins(draft, subset));
    if (pinned.length === 0) continue;
    return Object.freeze({
      status: 'composed',
      outfits: Object.freeze(offerAroundPins(day, pinned, startOffset)),
      satisfiedPins: Object.freeze(subset),
      unsatisfiedPins: Object.freeze(pins.filter((pin) => !subset.includes(pin))),
    });
  }
  // The empty subset wears every valid draft, and there is at least one.
  throw new Error('A valid composition set is never empty.');
}

/**
 * The body garments an outfit wears, as History reads a worn day: the same pieces are the same
 * outfit whatever accessories the day attached to them.
 */
export function garmentIdSet(outfit: OutfitCandidate): string {
  return [...new Set(assignedOutfitGarments(outfit)
    .map((item) => item.garment.garmentTypeId))].sort().join('|');
}

/** The first history row is newest. Relax the oldest exclusion until three remain. */
export function excludeRecentlyWornOutfits(
  outfits: readonly OutfitCandidate[],
  recentWorn: readonly WornOutfit[],
): readonly OutfitCandidate[] {
  const keys = recentWorn.slice(0, 7).map((entry) =>
    [...new Set(outfitSlots.slice(0, 6).map((slot) => entry.garments[slot])
      .filter((id) => id !== undefined))].sort().join('|'));
  for (let active = keys.length; active >= 0; active -= 1) {
    const excluded = new Set(keys.slice(0, active));
    const remaining = outfits.filter((outfit) => !excluded.has(garmentIdSet(outfit)));
    if (remaining.length >= 3 || active === 0) return Object.freeze(remaining);
  }
  return outfits;
}
