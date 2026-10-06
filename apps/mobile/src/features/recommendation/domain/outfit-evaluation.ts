import type {
  Breathability,
  Coverage,
  Formality,
  LayerRole,
  ThermalLevel,
} from '@/features/catalog/domain/garment-taxonomy';
import { getGarmentType } from '@/features/catalog/domain/garment-catalog';
import type {
  EligibleGarmentResult,
  GarmentEligibilityResult,
  GarmentRequirementEvaluation,
} from '@/features/recommendation/domain/garment-eligibility';
import {
  assignedGarment,
  compareStrings,
  corePieces,
  formalityOrder,
  noAccessories,
  outfitCompositionReasonCodes,
  piecesInSlotOrder,
  requirementCopyOf,
  type ArrangedBody,
  type BodyArrangement,
  type OutfitAggregateProperties,
  type OutfitBody,
  type OutfitCandidate,
  type OutfitCompositionReasonCode,
  type OutfitPenaltyBreakdown,
  type OutfitRequirementEvaluation,
  type WornPiece,
} from '@/features/recommendation/domain/outfit-model';
import {
  bodyClothingRequirements,
  requirementKey,
  type ArmCoverageRequirement,
  type BodyClothingRequirement,
  type BodyClothingRequirements,
  type BreathabilityRequirement,
  type ClothingRequirements,
  type LegCoverageRequirement,
  type ThermalRequirement,
  type WaterProtectionRequirement,
} from '@/features/recommendation/domain/weather-to-clothing-requirements';
import { uniqueInRankOrder } from '@/features/recommendation/domain/rank-order';

// How a draft answers the day: the body side read once per triple, every requirement's
// evaluation, the penalties, the score and the formality, and the outfit a judged draft
// becomes. A person's own arrangement is judged by the same rules.

/** A body of eligible candidates, as the enumeration pairs it with layers and shoes. */
export type BodyCore = ArrangedBody<EligibleGarmentResult>;

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

const reasonOrder = new Map(
  outfitCompositionReasonCodes.map((code, index) => [code, index]),
);

export function findEvaluation(
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
export type BodyPieces = Readonly<{
  body: BodyCore;
  midLayer: EligibleGarmentResult | null;
  outerLayer: EligibleGarmentResult | null;
  /** The body pieces, then the mid and the outer layer. */
  results: readonly EligibleGarmentResult[];
  candidateKeys: ReadonlySet<string>;
  /** Whether one candidate fills two of the triple's slots, which no outfit may do. */
  repeatsCandidate: boolean;
  /** Each piece's place on the formality ladder, -1 for a piece that has no formality. */
  formalityRanks: readonly number[];
  /** The least and most formal piece, by `formalityRanks`. */
  formalityRange: Readonly<{ lowest: number; highest: number }>;
}>;

export function bodyPiecesOf(
  body: BodyCore,
  midLayer: EligibleGarmentResult | null,
  outerLayer: EligibleGarmentResult | null,
): BodyPieces {
  const results = Object.freeze(piecesInSlotOrder(body, midLayer, outerLayer));
  const candidateKeys = new Set(results.map(({ candidateKey }) => candidateKey));
  const formalityRanks = Object.freeze(results.map(formalityRankOf));
  return Object.freeze({
    body,
    midLayer,
    outerLayer,
    results,
    candidateKeys,
    repeatsCandidate: candidateKeys.size !== results.length,
    formalityRanks,
    formalityRange: Object.freeze({
      lowest: Math.min(...formalityRanks),
      highest: Math.max(...formalityRanks),
    }),
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

export function bodySideOf(
  pieces: BodyPieces,
  requirements: BodyClothingRequirements,
): BodySide {
  const { body, midLayer, outerLayer, results } = pieces;
  const core = corePieces(body);
  const coreAndMid = Object.freeze(piecesInSlotOrder(body, midLayer));
  const formalityRanks = pieces.formalityRanks.filter((rank) => rank >= 0);
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
  const copy = requirementCopyOf(requirement);
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
export function draftEvaluations(
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

export function compositionKeyOf(side: BodySideReadings, footwear: EligibleGarmentResult): string {
  return `${side.compositionKeyPrefix}|${footwear.candidateKey}`;
}

export function isFormalSuit(
  outfit: BodyArrangement<WornPiece>,
): boolean {
  return outfit.body.kind === 'separates' &&
    outfit.body.primaryTop.garment.garmentTypeId === 'shirt' &&
    outfit.body.bottom.garment.garmentTypeId === 'trousers' &&
    outfit.midLayer === null &&
    outfit.outerLayer?.garment.garmentTypeId === 'blazer' &&
    outfit.footwear.garment.garmentTypeId === 'closed_shoes';
}

export function formalityRankOf(result: EligibleGarmentResult): number {
  const formality = getGarmentType(result.garment.garmentTypeId)?.formality;
  return formality ? formalityOrder.indexOf(formality) : -1;
}

/** A draft as an arrangement of its candidates, slot by slot. */
export function draftArrangement(
  side: BodyPieces,
  footwear: EligibleGarmentResult,
): BodyArrangement<EligibleGarmentResult> {
  return { body: side.body, midLayer: side.midLayer, outerLayer: side.outerLayer, footwear };
}

/** A formal suit reads formal; anything else reads as its least formal piece, casual when none says. */
function draftFormality(side: BodySide, footwear: EligibleGarmentResult): Formality {
  if (isFormalSuit(draftArrangement(side, footwear))) {
    return 'formal';
  }
  const ranks = [side.leastFormalRank, formalityRankOf(footwear)].filter((rank) => rank >= 0);
  return ranks.length === 0 ? 'casual' : formalityOrder[Math.min(...ranks)]!;
}

/** A draft whose pieces sit more than one formality apart, or carry none, is never composed. */
export function formalitySpreadFits(lowest: number, highest: number): boolean {
  return lowest >= 0 && highest - lowest <= 1;
}

/**
 * Whether a mid layer goes over the primary top in the right order. It is worn over a top that
 * can be worn underneath, unless it is jacket-like itself (an overshirt or a hoodie over a
 * sweater), and a top that can be worn underneath is never pulled over another top.
 */
export function layeringOrderFits(
  primaryTop: EligibleGarmentResult,
  midLayer: EligibleGarmentResult,
): boolean {
  const topRoles = primaryTop.garment.properties.supportedLayerRoles;
  const midRoles = midLayer.garment.properties.supportedLayerRoles;
  return !midRoles.includes('base') && (topRoles.includes('base') || midRoles.includes('outer'));
}

export function meetsRequirement({ requirement, status }: OutfitRequirementEvaluation): boolean {
  return requirement.priority === 'optional' ||
    status === 'met' ||
    status === 'tradeoff';
}

/**
 * A draft judged against the day: its evaluations, score, formality and key. The order and the
 * offer read only these, so a composed outfit is built from one only once it is shown.
 */
export type JudgedDraft = Readonly<{
  side: BodySide;
  footwear: EligibleGarmentResult;
  evaluations: readonly OutfitRequirementEvaluation[];
  score: DraftScore;
  formality: Formality;
  compositionKey: string;
}>;

export function judgeDraft(
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
export function outfitOf(judged: JudgedDraft): OutfitCandidate {
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

export function optionalLayerCount(draft: JudgedDraft): number {
  return Number(draft.side.midLayer !== null) + Number(draft.side.outerLayer !== null);
}

/** One arrangement a person put together on detail (Phase 7 manual mix), slot by slot. */
export type OutfitArrangement = BodyArrangement<GarmentEligibilityResult>;

/**
 * A piece a person chose reads as eligible even when it fails a hard requirement: its
 * evaluations and a zero score still describe what they chose.
 */
export function asEligibleDraftPart(result: GarmentEligibilityResult): EligibleGarmentResult {
  if (result.status === 'eligible') return result;
  if (result.garment === null) throw new Error('An arrangement piece has no catalog garment.');
  return Object.freeze({ ...result, status: 'eligible', garment: result.garment, score: 0,
    scoreBeforePenalties: 0, penaltyPoints: 0 });
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
  const results = piecesInSlotOrder(
    arrangement.body,
    arrangement.midLayer,
    arrangement.outerLayer,
    arrangement.footwear,
  );
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
