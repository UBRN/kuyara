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
import type {
  EffectiveGarmentCandidate,
  EligibleGarmentResult,
  GarmentRequirementEvaluation,
} from '@/features/recommendation/domain/garment-eligibility';
import {
  accessoryOutfitSlots,
  type AccessoryOutfitSlot,
  type BodyOutfitSlot,
  type OutfitSlot,
} from '@/features/recommendation/domain/outfit-slots';
import type {
  BodyClothingRequirement,
  ClothingRequirement,
  ClothingRequirementReasonCode,
} from '@/features/recommendation/domain/weather-to-clothing-requirements';

// The composed outfit as every reader sees it, the frozen parts it is built from, and the
// one way an outfit is flattened into its pieces.

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

/** The formality ladder, least formal first. */
export const formalityOrder = Object.freeze(['casual', 'smart', 'formal'] as const);

/** A body of separates or a one-piece, whatever its pieces are: candidates, assigned garments or a person's choices. */
export type ArrangedBody<Piece> =
  | Readonly<{
      kind: 'separates';
      primaryTop: Piece;
      bottom: Piece;
    }>
  | Readonly<{
      kind: 'one_piece';
      onePiece: Piece;
    }>;

/** The six body slots of an arrangement: a body, the two optional layers and the shoes. */
export type BodyArrangement<Piece> = Readonly<{
  body: ArrangedBody<Piece>;
  midLayer: Piece | null;
  outerLayer: Piece | null;
  footwear: Piece;
}>;

/** The pieces a body is made of: a top and a bottom, or the one-piece. */
export function corePieces<Piece>(body: ArrangedBody<Piece>): Piece[] {
  return body.kind === 'separates' ? [body.primaryTop, body.bottom] : [body.onePiece];
}

/**
 * A body and the pieces worn with it, given in slot order, with the empty layers left out:
 * the one place an arrangement, a draft or an outfit is flattened into its pieces.
 */
export function piecesInSlotOrder<Piece>(
  body: ArrangedBody<Piece>,
  ...worn: readonly (Piece | null)[]
): Piece[] {
  return [...corePieces(body), ...worn.filter((piece): piece is Piece => piece !== null)];
}

export type AssignedOutfitGarment = Readonly<{
  slot: OutfitSlot;
  layerRole: LayerRole | null;
  garment: EffectiveGarmentCandidate;
  eligibilityScore: number;
  evaluations: readonly GarmentRequirementEvaluation[];
}>;

export type OutfitBody = ArrangedBody<AssignedOutfitGarment>;

export type OutfitAccessories = Readonly<
  Record<AccessoryOutfitSlot, AssignedOutfitGarment | null>
>;

/** The accessories of an outfit the day attached nothing to. */
export const noAccessories: OutfitAccessories = Object.freeze({
  head: null,
  neck: null,
  hands: null,
  handheld: null,
});

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

/** The garments an outfit wears in its six body slots, in slot order; an empty layer is left out. */
export function assignedOutfitGarments(
  outfit: OutfitCandidate,
): readonly AssignedOutfitGarment[] {
  return piecesInSlotOrder(outfit.body, outfit.midLayer, outfit.outerLayer, outfit.footwear);
}

/**
 * Everything the outfit carries: the six body slots, then the accessories in the same slot
 * order every time, because a stored or offered outfit is compared against this list verbatim.
 */
export function outfitGarments(outfit: OutfitCandidate): readonly AssignedOutfitGarment[] {
  return [
    ...assignedOutfitGarments(outfit),
    ...accessoryOutfitSlots.flatMap((slot) => {
      const accessory = outfit.accessories[slot];
      return accessory ? [accessory] : [];
    }),
  ];
}

/** The piece an arrangement wears in one body slot, or null when it leaves the slot empty. */
function pieceInSlot<Piece>(arrangement: BodyArrangement<Piece>, slot: BodyOutfitSlot): Piece | null {
  const { body } = arrangement;
  switch (slot) {
    case 'primary_top': return body.kind === 'separates' ? body.primaryTop : null;
    case 'bottom': return body.kind === 'separates' ? body.bottom : null;
    case 'one_piece': return body.kind === 'one_piece' ? body.onePiece : null;
    case 'mid_layer': return arrangement.midLayer;
    case 'outer_layer': return arrangement.outerLayer;
    case 'footwear': return arrangement.footwear;
  }
}

/** Any piece that names its garment type: a candidate, an assigned garment. */
export type WornPiece = Readonly<{ garment: Readonly<{ garmentTypeId: GarmentTypeId }> }>;

/**
 * The key History reads a worn day by: its distinct body garment types, sorted. The same
 * pieces are the same outfit whatever slots or accessories they were worn with.
 */
export function garmentIdSetOf(garmentTypeIds: readonly string[]): string {
  return [...new Set(garmentTypeIds)].sort().join('|');
}

/** An outfit's `garmentIdSetOf` key. */
export function garmentIdSet(outfit: OutfitCandidate): string {
  return garmentIdSetOf(assignedOutfitGarments(outfit).map((item) => item.garment.garmentTypeId));
}

/**
 * A piece a person chose to wear around: one catalog garment type held to one of the six body
 * slots. Slot-bound, because a sweater is either a top or a mid layer and the two are
 * different outfits.
 */
export type OutfitPin = Readonly<{
  slot: BodyOutfitSlot;
  garmentTypeId: GarmentTypeId;
}>;

/** Whether an outfit, or a draft of one, wears every pin in the slot the pin names. */
export function outfitWearsPins(
  outfit: BodyArrangement<WornPiece>,
  pins: readonly OutfitPin[],
): boolean {
  return pins.every(({ slot, garmentTypeId }) =>
    pieceInSlot(outfit, slot)?.garment.garmentTypeId === garmentTypeId);
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

/** Keys and composition keys sort by code point, never by locale. */
export function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function cloneRequirement<Requirement extends ClothingRequirement>(
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

export function requirementCopyOf(requirement: BodyClothingRequirement) {
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
 * than once per outfit. A mild day composes tens of thousands of outfits from the same few
 * dozen candidates, and cloning each candidate's garment and its evaluations again for every
 * outfit was the composer's largest single cost. Every copy is deeply frozen and nothing
 * mutates one, so the outfits share them.
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

/** A candidate as an outfit wears it: in one slot, in one runtime layer role. */
export function assignedGarment(
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
