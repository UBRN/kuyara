import type { ClothingPreference } from '@/domain/preferences';
import {
  getGarmentType,
} from '@/features/catalog/domain/garment-catalog';
import type {
  BodyRegion,
  Breathability,
  Coverage,
  GarmentType,
  GarmentTypeId,
  LayerRole,
  StructuralCategory,
  ThermalLevel,
  TractionSuitability,
  WaterProtection,
  WindProtection,
} from '@/features/catalog/domain/garment-taxonomy';
import type {
  ClothingRequirement,
  ClothingRequirementReasonCode,
  ClothingRequirements,
} from '@/features/recommendation/domain/weather-to-clothing-requirements';
import {
  resolveEffectiveGarment,
} from '@/features/wardrobe/domain/effective-garment';
import type {
  ResolvedGarment,
} from '@/features/wardrobe/domain/effective-garment';
import type { WardrobeItem } from '@/features/wardrobe/domain/wardrobe-item';

export type EffectiveGarmentProperties = Readonly<{
  category: StructuralCategory;
  bodyRegion: BodyRegion | null;
  supportedLayerRoles: readonly LayerRole[];
  thermalLevel: ThermalLevel | null;
  waterProtection: WaterProtection | null;
  windProtection: WindProtection | null;
  breathability: Breathability | null;
  armCoverage: Coverage | null;
  legCoverage: Coverage | null;
  tractionSuitability: TractionSuitability | null;
}>;

export type EffectiveGarmentCandidate = Readonly<{
  candidateKey: string;
  source: 'catalog' | 'wardrobe';
  garmentTypeId: GarmentTypeId;
  properties: EffectiveGarmentProperties;
}>;

export const garmentEligibilityReasonCodes = Object.freeze([
  'catalog_preference_mismatch',
  'catalog_type_unavailable',
  'wardrobe_garment_deleted',
  'wardrobe_garment_legacy',
  'wardrobe_garment_invalid',
  'unsupported_category',
  'mandatory_body_water_shortfall',
  'mandatory_feet_water_shortfall',
  'mandatory_wind_shortfall',
  'mandatory_traction_shortfall',
  'composition_requirement_shortfall',
  'optional_requirement_shortfall',
  'thermal_over_protection',
  'unnecessary_water_protection',
  'no_applicable_requirements',
] as const);

export type GarmentEligibilityReasonCode =
  (typeof garmentEligibilityReasonCodes)[number];

export type EffectiveGarmentProjection =
  | Readonly<{
      status: 'ready';
      garment: EffectiveGarmentCandidate;
    }>
  | Readonly<{
      status: 'rejected';
      candidateKey: string;
      reasonCode: Extract<
        GarmentEligibilityReasonCode,
        | 'catalog_preference_mismatch'
        | 'catalog_type_unavailable'
        | 'wardrobe_garment_deleted'
        | 'wardrobe_garment_legacy'
        | 'wardrobe_garment_invalid'
      >;
    }>;

type ProjectionRejectionReason = Extract<
  EffectiveGarmentProjection,
  { status: 'rejected' }
>['reasonCode'];

export type GarmentRequirementEvaluation = Readonly<{
  requirement: ClothingRequirement;
  status: 'met' | 'shortfall' | 'missing' | 'not_applicable';
  actualValue:
    | ThermalLevel
    | Breathability
    | Coverage
    | WaterProtection
    | WindProtection
    | TractionSuitability
    | null;
  contribution: number | null;
  hardFailure: boolean;
  reasonCodes: readonly ClothingRequirementReasonCode[];
}>;

type GarmentEligibilityBase = Readonly<{
  candidateKey: string;
  evaluations: readonly GarmentRequirementEvaluation[];
  reasonCodes: readonly GarmentEligibilityReasonCode[];
}>;

export type EligibleGarmentResult = GarmentEligibilityBase & Readonly<{
  status: 'eligible';
  score: number;
  scoreBeforePenalties: number;
  penaltyPoints: number;
}>;

export type IneligibleGarmentResult = GarmentEligibilityBase & Readonly<{
  status: 'ineligible';
  score: null;
  scoreBeforePenalties: null;
  penaltyPoints: 0;
}>;

export type GarmentEligibilityResult =
  | EligibleGarmentResult
  | IneligibleGarmentResult;

type GarmentTypeLookup = (typeId: string) => GarmentType | null;

const reasonOrder = new Map(
  garmentEligibilityReasonCodes.map((code, index) => [code, index]),
);
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
const waterStrength: Readonly<Record<WaterProtection, number>> = Object.freeze({
  none: 0,
  water_resistant: 1,
  waterproof: 2,
});
const windStrength: Readonly<Record<WindProtection, number>> = Object.freeze({
  none: 0,
  wind_resistant: 1,
});
const tractionStrength: Readonly<Record<TractionSuitability, number>> =
  Object.freeze({ everyday: 0, enhanced: 1 });

function orderedReasonCodes(
  values: Iterable<GarmentEligibilityReasonCode>,
): readonly GarmentEligibilityReasonCode[] {
  return Object.freeze(
    [...new Set(values)].sort(
      (left, right) =>
        (reasonOrder.get(left) ?? Number.MAX_SAFE_INTEGER) -
        (reasonOrder.get(right) ?? Number.MAX_SAFE_INTEGER),
    ),
  );
}

function propertiesFromGarmentType(
  type: GarmentType,
): EffectiveGarmentProperties {
  return Object.freeze({
    category: type.structuralCategory,
    bodyRegion: type.bodyRegion,
    supportedLayerRoles: Object.freeze([...type.supportedLayerRoles]),
    thermalLevel: type.defaultThermalLevel,
    waterProtection: type.defaultWaterProtection,
    windProtection: type.defaultWindProtection,
    breathability: type.defaultBreathability,
    armCoverage: type.defaultArmCoverage,
    legCoverage: type.defaultLegCoverage,
    tractionSuitability: type.defaultTractionSuitability,
  });
}

function propertiesFromResolvedGarment(
  garment: ResolvedGarment,
): EffectiveGarmentProperties {
  return Object.freeze({
    category: garment.category,
    bodyRegion: garment.bodyRegion,
    supportedLayerRoles: Object.freeze([...garment.supportedLayerRoles]),
    thermalLevel: garment.thermalLevel,
    waterProtection: garment.waterProtection,
    windProtection: garment.windProtection,
    breathability: garment.breathability,
    armCoverage: garment.armCoverage,
    legCoverage: garment.legCoverage,
    tractionSuitability: garment.tractionSuitability,
  });
}

function readyProjection(
  candidateKey: string,
  source: EffectiveGarmentCandidate['source'],
  garmentTypeId: GarmentTypeId,
  properties: EffectiveGarmentProperties,
): EffectiveGarmentProjection {
  return Object.freeze({
    status: 'ready',
    garment: Object.freeze({ candidateKey, source, garmentTypeId, properties }),
  });
}

function rejectedProjection(
  candidateKey: string,
  reasonCode: ProjectionRejectionReason,
): EffectiveGarmentProjection {
  return Object.freeze({ status: 'rejected', candidateKey, reasonCode });
}

export function projectCatalogEffectiveGarment(
  typeId: string,
  preference: ClothingPreference,
  lookupGarmentType: GarmentTypeLookup = getGarmentType,
): EffectiveGarmentProjection {
  const candidateKey = `catalog:${typeId}`;
  const type = lookupGarmentType(typeId);

  if (!type || type.status !== 'active') {
    return rejectedProjection(candidateKey, 'catalog_type_unavailable');
  }

  if (!type.apparelPreferenceApplicability.includes(preference)) {
    return rejectedProjection(candidateKey, 'catalog_preference_mismatch');
  }

  return readyProjection(
    candidateKey,
    'catalog',
    type.typeId,
    propertiesFromGarmentType(type),
  );
}

export function projectWardrobeEffectiveGarment(
  item: WardrobeItem,
  lookupGarmentType: GarmentTypeLookup = getGarmentType,
): EffectiveGarmentProjection {
  const candidateKey = `wardrobe:${item.id}`;

  if (item.deletedAt !== null) {
    return rejectedProjection(candidateKey, 'wardrobe_garment_deleted');
  }

  const resolution = resolveEffectiveGarment(item, lookupGarmentType);
  if (resolution.status === 'legacy') {
    return rejectedProjection(candidateKey, 'wardrobe_garment_legacy');
  }
  if (resolution.status === 'invalid-data') {
    return rejectedProjection(candidateKey, 'wardrobe_garment_invalid');
  }

  return readyProjection(
    candidateKey,
    'wardrobe',
    resolution.garment.garmentTypeId,
    propertiesFromResolvedGarment(resolution.garment),
  );
}

function isRequirementApplicable(
  requirement: ClothingRequirement,
  properties: EffectiveGarmentProperties,
): boolean {
  switch (requirement.kind) {
    case 'thermal':
    case 'breathability':
      return properties.category !== 'accessory';
    case 'arm_coverage':
      return (
        properties.category === 'top' ||
        properties.category === 'outerwear' ||
        properties.category === 'one_piece'
      );
    case 'leg_coverage':
      return (
        properties.category === 'bottom' ||
        properties.category === 'one_piece'
      );
    case 'water_protection':
      return requirement.target === 'body'
        ? properties.category === 'outerwear' &&
            properties.supportedLayerRoles.includes('outer')
        : properties.category === 'footwear';
    case 'wind_protection':
      return (
        properties.category === 'outerwear' &&
        properties.supportedLayerRoles.includes('outer')
      );
    case 'traction':
      return properties.category === 'footwear';
  }
}

function actualValueForRequirement(
  requirement: ClothingRequirement,
  properties: EffectiveGarmentProperties,
): GarmentRequirementEvaluation['actualValue'] {
  switch (requirement.kind) {
    case 'thermal':
      return properties.thermalLevel;
    case 'breathability':
      return properties.breathability;
    case 'arm_coverage':
      return properties.armCoverage;
    case 'leg_coverage':
      return properties.legCoverage;
    case 'water_protection':
      return properties.waterProtection;
    case 'wind_protection':
      return properties.windProtection;
    case 'traction':
      return properties.tractionSuitability;
  }
}

function strengthForRequirement(
  requirement: ClothingRequirement,
  value: NonNullable<GarmentRequirementEvaluation['actualValue']>,
): number {
  switch (requirement.kind) {
    case 'thermal':
      return thermalStrength[value as ThermalLevel];
    case 'breathability':
      return breathabilityStrength[value as Breathability];
    case 'arm_coverage':
    case 'leg_coverage':
      return coverageStrength[value as Coverage];
    case 'water_protection':
      return waterStrength[value as WaterProtection];
    case 'wind_protection':
      return windStrength[value as WindProtection];
    case 'traction':
      return tractionStrength[value as TractionSuitability];
  }
}

function minimumStrength(requirement: ClothingRequirement): number {
  return strengthForRequirement(requirement, requirement.minimum);
}

function hardFailureReason(
  requirement: ClothingRequirement,
): GarmentEligibilityReasonCode | null {
  if (requirement.priority !== 'mandatory') {
    return null;
  }

  switch (requirement.kind) {
    case 'water_protection':
      return requirement.target === 'body'
        ? 'mandatory_body_water_shortfall'
        : 'mandatory_feet_water_shortfall';
    case 'wind_protection':
      return 'mandatory_wind_shortfall';
    case 'traction':
      return 'mandatory_traction_shortfall';
    case 'thermal':
    case 'breathability':
    case 'arm_coverage':
    case 'leg_coverage':
      return null;
  }
}

function evaluateRequirement(
  requirement: ClothingRequirement,
  properties: EffectiveGarmentProperties,
): GarmentRequirementEvaluation {
  if (!isRequirementApplicable(requirement, properties)) {
    return Object.freeze({
      requirement,
      status: 'not_applicable',
      actualValue: null,
      contribution: null,
      hardFailure: false,
      reasonCodes: Object.freeze([...requirement.reasonCodes]),
    });
  }

  const actualValue = actualValueForRequirement(requirement, properties);
  if (actualValue === null) {
    return Object.freeze({
      requirement,
      status: 'missing',
      actualValue,
      contribution: 0,
      hardFailure: hardFailureReason(requirement) !== null,
      reasonCodes: Object.freeze([...requirement.reasonCodes]),
    });
  }

  const actualStrength = strengthForRequirement(requirement, actualValue);
  const requiredStrength = minimumStrength(requirement);
  const met = actualStrength >= requiredStrength;

  return Object.freeze({
    requirement,
    status: met ? 'met' : 'shortfall',
    actualValue,
    contribution: Math.round(
      Math.min(actualStrength / requiredStrength, 1) * 100,
    ),
    hardFailure: !met && hardFailureReason(requirement) !== null,
    reasonCodes: Object.freeze([...requirement.reasonCodes]),
  });
}

function thermalPenalty(
  requirements: ClothingRequirements,
  properties: EffectiveGarmentProperties,
): number {
  const actual = properties.thermalLevel;
  if (actual === null) {
    return 0;
  }

  const requirement = requirements.requirements.find(
    (candidate) => candidate.kind === 'thermal',
  );
  if (!requirement) {
    return actual === 'high' ? 20 : actual === 'moderate' ? 10 : 0;
  }

  return Math.max(
    thermalStrength[actual] - thermalStrength[requirement.minimum],
    0,
  ) * 5;
}

function unnecessaryWaterPenalty(
  requirements: ClothingRequirements,
  properties: EffectiveGarmentProperties,
): number {
  const hasApplicableBreathability = requirements.requirements.some(
    (requirement) =>
      requirement.kind === 'breathability' &&
      isRequirementApplicable(requirement, properties),
  );
  const hasApplicableWater = requirements.requirements.some(
    (requirement) =>
      requirement.kind === 'water_protection' &&
      isRequirementApplicable(requirement, properties),
  );

  if (!hasApplicableBreathability || hasApplicableWater) {
    return 0;
  }

  return properties.waterProtection === 'waterproof'
    ? 10
    : properties.waterProtection === 'water_resistant'
      ? 5
      : 0;
}

function ineligibleResult(
  candidateKey: string,
  evaluations: readonly GarmentRequirementEvaluation[],
  reasons: Iterable<GarmentEligibilityReasonCode>,
): IneligibleGarmentResult {
  return Object.freeze({
    status: 'ineligible',
    candidateKey,
    score: null,
    scoreBeforePenalties: null,
    penaltyPoints: 0,
    evaluations: Object.freeze([...evaluations]),
    reasonCodes: orderedReasonCodes(reasons),
  });
}

export function evaluateGarmentEligibility(
  requirements: ClothingRequirements,
  projection: EffectiveGarmentProjection,
): GarmentEligibilityResult {
  if (projection.status === 'rejected') {
    return ineligibleResult(projection.candidateKey, [], [
      projection.reasonCode,
    ]);
  }

  const { garment } = projection;
  if (garment.properties.category === 'accessory') {
    return ineligibleResult(garment.candidateKey, [], [
      'unsupported_category',
    ]);
  }

  const evaluations = Object.freeze(
    requirements.requirements.map((requirement) =>
      evaluateRequirement(requirement, garment.properties),
    ),
  );
  const hardFailures = evaluations.filter(({ hardFailure }) => hardFailure);

  if (hardFailures.length > 0) {
    return ineligibleResult(
      garment.candidateKey,
      evaluations,
      hardFailures.flatMap(({ requirement }) => {
        const reason = hardFailureReason(requirement);
        return reason === null ? [] : [reason];
      }),
    );
  }

  const applicable = evaluations.filter(
    (evaluation) => evaluation.status !== 'not_applicable',
  );
  const weightedTotal = applicable.reduce(
    (sum, { contribution, requirement }) =>
      sum + (contribution ?? 0) * (requirement.priority === 'mandatory' ? 2 : 1),
    0,
  );
  const totalWeight = applicable.reduce(
    (sum, { requirement }) =>
      sum + (requirement.priority === 'mandatory' ? 2 : 1),
    0,
  );
  const scoreBeforePenalties = totalWeight === 0
    ? 50
    : Math.round(weightedTotal / totalWeight);
  const thermalOverProtection = thermalPenalty(requirements, garment.properties);
  const unnecessaryWater = unnecessaryWaterPenalty(
    requirements,
    garment.properties,
  );
  const penaltyPoints = Math.min(
    thermalOverProtection + unnecessaryWater,
    30,
  );
  const reasons: GarmentEligibilityReasonCode[] = [];

  if (totalWeight === 0) {
    reasons.push('no_applicable_requirements');
  }
  if (
    applicable.some(
      ({ requirement, status }) =>
        (status === 'shortfall' || status === 'missing') &&
        (requirement.kind === 'thermal' ||
          requirement.kind === 'breathability' ||
          requirement.kind === 'arm_coverage' ||
          requirement.kind === 'leg_coverage'),
    )
  ) {
    reasons.push('composition_requirement_shortfall');
  }
  if (
    applicable.some(
      ({ requirement, status }) =>
        requirement.priority === 'optional' &&
        (status === 'shortfall' || status === 'missing'),
    )
  ) {
    reasons.push('optional_requirement_shortfall');
  }
  if (thermalOverProtection > 0) {
    reasons.push('thermal_over_protection');
  }
  if (unnecessaryWater > 0) {
    reasons.push('unnecessary_water_protection');
  }

  return Object.freeze({
    status: 'eligible',
    candidateKey: garment.candidateKey,
    score: Math.max(scoreBeforePenalties - penaltyPoints, 0),
    scoreBeforePenalties,
    penaltyPoints,
    evaluations,
    reasonCodes: orderedReasonCodes(reasons),
  });
}

function compareCandidateKeys(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Scores are comparable only within one compatible category or composition role. */
export function compareGarmentEligibilityResults(
  left: GarmentEligibilityResult,
  right: GarmentEligibilityResult,
): number {
  if (left.status !== right.status) {
    return left.status === 'eligible' ? -1 : 1;
  }
  if (left.status === 'eligible' && right.status === 'eligible') {
    const scoreOrder = right.score - left.score;
    if (scoreOrder !== 0) {
      return scoreOrder;
    }
  }

  return compareCandidateKeys(left.candidateKey, right.candidateKey);
}
