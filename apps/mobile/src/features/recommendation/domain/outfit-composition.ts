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
import {
  compareGarmentEligibilityResults,
  type EffectiveGarmentCandidate,
  type EligibleGarmentResult,
  type GarmentEligibilityResult,
  type GarmentRequirementEvaluation,
} from '@/features/recommendation/domain/garment-eligibility';
import type {
  ClothingRequirement,
  ClothingRequirementReasonCode,
  ClothingRequirements,
} from '@/features/recommendation/domain/weather-to-clothing-requirements';

export const outfitSlots = Object.freeze([
  'primary_top',
  'bottom',
  'one_piece',
  'mid_layer',
  'outer_layer',
  'footwear',
] as const);

export type OutfitSlot = (typeof outfitSlots)[number];

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
  requirement: ClothingRequirement;
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
  requirement: ClothingRequirement;
  bestContribution: number;
  bestObservedContribution: number;
  compositionKey: string | null;
  reasonCodes: readonly ClothingRequirementReasonCode[];
}>;

export type OutfitCompositionFailure = Readonly<{
  status: 'failure';
  reasonCodes: readonly OutfitCompositionFailureCode[];
  missingSlots: readonly OutfitSlot[];
  unmetRequirements: readonly ClothingRequirement[];
  bestObservedEvidence: readonly OutfitRequirementBestEvidence[];
  consideredCandidateKeys: readonly string[];
}>;

export type OutfitCompositionSuccess = Readonly<{
  status: 'composed';
  outfit: OutfitCandidate;
}>;

export type OutfitCompositionResult =
  | OutfitCompositionSuccess
  | OutfitCompositionFailure;

export type OutfitCompositionsSuccess = Readonly<{
  status: 'composed';
  outfits: readonly OutfitCandidate[]; // 1, 2 or 3 entries, best first
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

function cloneRequirement(requirement: ClothingRequirement): ClothingRequirement {
  return Object.freeze({
    ...requirement,
    reasonCodes: Object.freeze([...requirement.reasonCodes]),
  }) as ClothingRequirement;
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

function assignedGarment(
  result: EligibleGarmentResult,
  slot: OutfitSlot,
  layerRole: LayerRole | null,
): AssignedOutfitGarment {
  return Object.freeze({
    slot,
    layerRole,
    garment: cloneGarment(result.garment),
    eligibilityScore: result.score,
    evaluations: Object.freeze(result.evaluations.map(cloneEvaluation)),
  });
}

function requirementKey(requirement: ClothingRequirement): string {
  return requirement.kind === 'water_protection'
    ? `${requirement.kind}:${requirement.target}`
    : requirement.kind;
}

function findEvaluation(
  result: EligibleGarmentResult | null,
  requirement: ClothingRequirement,
): GarmentRequirementEvaluation | null {
  if (!result) {
    return null;
  }

  const key = requirementKey(requirement);
  return result.evaluations.find(
    ({ requirement: candidate }) => requirementKey(candidate) === key,
  ) ?? null;
}

function bodyResults(draft: DraftComposition): readonly EligibleGarmentResult[] {
  const core = draft.body.kind === 'separates'
    ? [draft.body.primaryTop, draft.body.bottom]
    : [draft.body.onePiece];

  return Object.freeze([
    ...core,
    ...(draft.midLayer ? [draft.midLayer] : []),
    ...(draft.outerLayer ? [draft.outerLayer] : []),
  ]);
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

function aggregateProperties(
  draft: DraftComposition,
): OutfitAggregateProperties {
  const body = bodyResults(draft);
  const coreAndMid = coreAndMidResults(draft);
  const bodyStrength = body.reduce(
    (sum, { garment }) =>
      sum + (garment.properties.thermalLevel === null
        ? 0
        : thermalStrength[garment.properties.thermalLevel]),
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

function evaluationStatus(
  contribution: number,
  missing: boolean,
): OutfitRequirementEvaluation['status'] {
  return contribution >= 100 ? 'met' : missing ? 'missing' : 'shortfall';
}

function mandatoryProtectiveOuter(
  draft: DraftComposition,
  requirements: ClothingRequirements,
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
  requirement: ClothingRequirement,
  draft: DraftComposition,
  aggregates: OutfitAggregateProperties,
  requirements: ClothingRequirements,
): OutfitRequirementEvaluation {
  const body = bodyResults(draft);
  const bodyKeys = Object.freeze(
    body.map(({ candidateKey }) => candidateKey).sort(compareStrings),
  );
  let contribution = 0;
  let observedContribution = 0;
  let missing = false;
  let status: OutfitRequirementEvaluation['status'];
  let suppliedByCandidateKeys: readonly string[] = Object.freeze([]);
  let tradeoffCandidateKeys: readonly string[] = Object.freeze([]);

  switch (requirement.kind) {
    case 'thermal': {
      const required = thermalStrength[requirement.minimum];
      contribution = percentage(aggregates.thermal.bodyStrength, required);
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
      suppliedByCandidateKeys = bodyKeys;

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

function thermalOverProtectionPenalty(
  requirements: ClothingRequirements,
  bodyStrength: number,
): number {
  const requirement = requirements.requirements.find(
    (candidate) => candidate.kind === 'thermal',
  );

  if (!requirement) {
    return bodyStrength <= 1 ? 0 : bodyStrength === 2 ? 10 : 20;
  }

  return Math.max(bodyStrength - thermalStrength[requirement.minimum], 0) * 5;
}

function unnecessaryWaterProtectionPenalty(
  requirements: ClothingRequirements,
  aggregates: OutfitAggregateProperties,
): number {
  const hasBreathability = requirements.requirements.some(
    ({ kind }) => kind === 'breathability',
  );
  if (!hasBreathability) {
    return 0;
  }

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
  requirements: ClothingRequirements,
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
  requirements: ClothingRequirements,
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

function isValid(candidate: OutfitCandidate): boolean {
  const formalities = [
    ...(candidate.body.kind === 'separates'
      ? [candidate.body.primaryTop, candidate.body.bottom]
      : [candidate.body.onePiece]),
    candidate.midLayer,
    candidate.outerLayer,
    candidate.footwear,
  ].flatMap((assigned) => {
    const formality = assigned && getGarmentType(assigned.garment.garmentTypeId)?.formality;
    return formality ? [formality] : [];
  });
  const formalityRanks = formalities.map((formality) =>
    formalityOrder.indexOf(formality));

  return formalityRanks.length === candidate.candidateKeys.length &&
    Math.max(...formalityRanks) - Math.min(...formalityRanks) <= 1 &&
    candidate.requirementEvaluations.every(
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

function compareOutfits(left: OutfitCandidate, right: OutfitCandidate): number {
  const scoreOrder = right.score - left.score;
  if (scoreOrder !== 0) {
    return scoreOrder;
  }
  const penaltyOrder = left.penaltyPoints - right.penaltyPoints;
  if (penaltyOrder !== 0) {
    return penaltyOrder;
  }
  const layerOrder = optionalLayerCount(left) - optionalLayerCount(right);
  if (layerOrder !== 0) {
    return layerOrder;
  }

  if (left.body.kind === right.body.kind) {
    const leftScores = slotScoreVector(left);
    const rightScores = slotScoreVector(right);
    for (let index = 0; index < leftScores.length; index += 1) {
      const groupOrder = rightScores[index] - leftScores[index];
      if (groupOrder !== 0) {
        return groupOrder;
      }
    }
  }

  return compareStrings(left.compositionKey, right.compositionKey);
}

function hasDuplicateCandidate(draft: DraftComposition): boolean {
  const keys = [
    ...bodyResults(draft).map(({ candidateKey }) => candidateKey),
    draft.footwear.candidateKey,
  ];
  return new Set(keys).size !== keys.length;
}

function failureCodeForRequirement(
  requirement: ClothingRequirement,
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
  requirements: readonly ClothingRequirement[],
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
  unmetRequirements: readonly ClothingRequirement[],
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

/** Returns every valid composition, sorted best first, or the shared failure. */
function collectValidOutfits(
  requirements: ClothingRequirements,
  candidates: readonly GarmentEligibilityResult[],
): OutfitCompositionsResult {
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
        for (const footwearCandidate of footwear) {
          const draft = Object.freeze({
            body,
            midLayer,
            outerLayer,
            footwear: footwearCandidate,
          });
          if (!hasDuplicateCandidate(draft)) {
            evaluated.push(evaluateDraft(draft, requirements));
          }
        }
      }
    }
  }

  const valid = evaluated.filter(isValid).sort(compareOutfits);
  if (valid.length > 0) {
    return Object.freeze({
      status: 'composed',
      outfits: Object.freeze(valid),
    });
  }

  const evidence = bestEvidence(mandatoryRequirements, evaluated);
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

function selectDiverseOutfits(
  outfits: readonly OutfitCandidate[],
  count: number,
  startOffset: number,
): readonly OutfitCandidate[] {
  const selected: OutfitCandidate[] = [];
  const offset = outfits.length === 0 ? 0 : startOffset % outfits.length;
  const rotated = [...outfits.slice(offset), ...outfits.slice(0, offset)];
  for (const outfit of rotated) {
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
 * Composes one complete deterministic outfit from already evaluated candidates.
 * It assigns runtime roles but does not mutate garment data or re-evaluate
 * garment-level requirement applicability.
 */
export function composeOutfit(
  requirements: ClothingRequirements,
  candidates: readonly GarmentEligibilityResult[],
): OutfitCompositionResult {
  const result = collectValidOutfits(requirements, candidates);
  return result.status === 'failure'
    ? result
    : Object.freeze({ status: 'composed', outfit: result.outfits[0] });
}

export function composeOutfits(
  requirements: ClothingRequirements,
  candidates: readonly GarmentEligibilityResult[],
): OutfitCompositionsResult {
  const result = collectValidOutfits(requirements, candidates);
  return result.status === 'failure'
    ? result
    : Object.freeze({
        status: 'composed',
        outfits: selectDiverseOutfits(result.outfits, 3, 0),
      });
}

export function composeOutfitOptions(
  requirements: ClothingRequirements,
  candidates: readonly GarmentEligibilityResult[],
  startOffset: number,
): OutfitCompositionsResult {
  const result = collectValidOutfits(requirements, candidates);
  return result.status === 'failure'
    ? result
    : Object.freeze({
        status: 'composed',
        outfits: selectDiverseOutfits(result.outfits, 24, startOffset),
      });
}
