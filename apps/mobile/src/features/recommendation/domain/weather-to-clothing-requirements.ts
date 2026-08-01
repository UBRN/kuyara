import type {
  Breathability,
  Coverage,
  ThermalLevel,
  TractionSuitability,
  WaterProtection,
  WindProtection,
} from '@/features/catalog/domain/garment-taxonomy';
import type {
  WeatherMeasurements,
  WeatherSnapshot,
} from '@/features/weather/domain/weather';

export const clothingRequirementReasonCodes = Object.freeze([
  'temperature_low',
  'apparent_temperature_low',
  'temperature_high',
  'apparent_temperature_high',
  'daily_range_wide',
  'daily_extrema_fallback',
  'wind_elevated',
  'wind_strong',
  'precipitation_possible',
  'precipitation_likely',
  'condition_drizzle',
  'condition_rain',
  'condition_heavy_rain',
  'condition_sleet',
  'condition_snow',
  'condition_thunderstorm',
] as const);

export type ClothingRequirementReasonCode =
  (typeof clothingRequirementReasonCodes)[number];
export type ClothingRequirementPriority = 'mandatory' | 'optional';

type RequirementBase<Minimum> = Readonly<{
  minimum: Minimum;
  priority: ClothingRequirementPriority;
  reasonCodes: readonly ClothingRequirementReasonCode[];
}>;

export type ThermalRequirement = RequirementBase<
  Exclude<ThermalLevel, 'none'>
> & Readonly<{ kind: 'thermal' }>;

export type BreathabilityRequirement = RequirementBase<Breathability> &
  Readonly<{ kind: 'breathability' }>;

export type ArmCoverageRequirement = RequirementBase<
  Exclude<Coverage, 'none'>
> & Readonly<{ kind: 'arm_coverage' }>;

export type LegCoverageRequirement = RequirementBase<
  Exclude<Coverage, 'none'>
> & Readonly<{ kind: 'leg_coverage' }>;

export type WaterProtectionRequirement = RequirementBase<
  Exclude<WaterProtection, 'none'>
> & Readonly<{
  kind: 'water_protection';
  target: 'body' | 'feet';
}>;

export type WindProtectionRequirement = RequirementBase<
  Exclude<WindProtection, 'none'>
> & Readonly<{ kind: 'wind_protection' }>;

export type TractionRequirement = RequirementBase<
  Exclude<TractionSuitability, 'everyday'>
> & Readonly<{ kind: 'traction' }>;

export type ClothingRequirement =
  | ThermalRequirement
  | BreathabilityRequirement
  | ArmCoverageRequirement
  | LegCoverageRequirement
  | WaterProtectionRequirement
  | WindProtectionRequirement
  | TractionRequirement;

export type ClothingRequirements = Readonly<{
  requirements: readonly ClothingRequirement[];
  reasonCodes: readonly ClothingRequirementReasonCode[];
}>;

const reasonOrder = new Map(
  clothingRequirementReasonCodes.map((code, index) => [code, index]),
);

const requirementOrder: Readonly<Record<string, number>> = Object.freeze({
  thermal: 0,
  arm_coverage: 1,
  leg_coverage: 2,
  breathability: 3,
  wind_protection: 4,
  'water_protection:body': 5,
  'water_protection:feet': 6,
  traction: 7,
});

const thermalStrength: Readonly<Record<Exclude<ThermalLevel, 'none'>, number>> =
  Object.freeze({ light: 1, moderate: 2, high: 3 });
const breathabilityStrength: Readonly<Record<Breathability, number>> =
  Object.freeze({ low: 1, moderate: 2, high: 3 });
const coverageStrength: Readonly<Record<Exclude<Coverage, 'none'>, number>> =
  Object.freeze({ partial: 1, full: 2 });
const waterStrength: Readonly<
  Record<Exclude<WaterProtection, 'none'>, number>
> = Object.freeze({ water_resistant: 1, waterproof: 2 });

function orderedReasonCodes(
  values: Iterable<ClothingRequirementReasonCode>,
): readonly ClothingRequirementReasonCode[] {
  return Object.freeze(
    [...new Set(values)].sort(
      (left, right) =>
        (reasonOrder.get(left) ?? Number.MAX_SAFE_INTEGER) -
        (reasonOrder.get(right) ?? Number.MAX_SAFE_INTEGER),
    ),
  );
}

function requirementKey(requirement: ClothingRequirement): string {
  return requirement.kind === 'water_protection'
    ? `${requirement.kind}:${requirement.target}`
    : requirement.kind;
}

function requirementStrength(requirement: ClothingRequirement): number {
  switch (requirement.kind) {
    case 'thermal':
      return thermalStrength[requirement.minimum];
    case 'breathability':
      return breathabilityStrength[requirement.minimum];
    case 'arm_coverage':
    case 'leg_coverage':
      return coverageStrength[requirement.minimum];
    case 'water_protection':
      return waterStrength[requirement.minimum];
    case 'wind_protection':
    case 'traction':
      return 1;
  }
}

function mergeRequirements(
  candidates: readonly ClothingRequirement[],
): readonly ClothingRequirement[] {
  const grouped = new Map<string, ClothingRequirement[]>();

  for (const candidate of candidates) {
    const key = requirementKey(candidate);
    const entries = grouped.get(key) ?? [];
    entries.push(candidate);
    grouped.set(key, entries);
  }

  const merged = [...grouped.entries()].map(([key, entries]) => {
    const strongest = entries.reduce((current, candidate) =>
      requirementStrength(candidate) > requirementStrength(current)
        ? candidate
        : current,
    );
    const priority = entries.some(({ priority: value }) => value === 'mandatory')
      ? 'mandatory'
      : 'optional';
    const reasonCodes = orderedReasonCodes(
      entries.flatMap(({ reasonCodes: values }) => values),
    );

    return Object.freeze({
      ...strongest,
      priority,
      reasonCodes,
      sortOrder: requirementOrder[key] ?? Number.MAX_SAFE_INTEGER,
    });
  });

  return Object.freeze(
    merged
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .map(({ sortOrder: _sortOrder, ...requirement }) =>
        Object.freeze(requirement as ClothingRequirement),
      ),
  );
}

function temperatureReasons(
  airTemperatures: readonly number[],
  apparentTemperatures: readonly number[],
  boundary: number,
  direction: 'low' | 'high',
  wideDailyRange: boolean,
  usesDailyExtremaFallback: boolean,
): readonly ClothingRequirementReasonCode[] {
  const compare = direction === 'low'
    ? (value: number) => value < boundary
    : (value: number) => value >= boundary;
  const reasons: ClothingRequirementReasonCode[] = [];

  if (airTemperatures.some(compare)) {
    reasons.push(direction === 'low' ? 'temperature_low' : 'temperature_high');
  }
  if (apparentTemperatures.some(compare)) {
    reasons.push(
      direction === 'low'
        ? 'apparent_temperature_low'
        : 'apparent_temperature_high',
    );
  }
  if (wideDailyRange) {
    reasons.push('daily_range_wide');
  }
  if (usesDailyExtremaFallback) {
    reasons.push('daily_extrema_fallback');
  }

  return orderedReasonCodes(reasons);
}

function addWaterProtection(
  candidates: ClothingRequirement[],
  target: WaterProtectionRequirement['target'],
  minimum: WaterProtectionRequirement['minimum'],
  priority: ClothingRequirementPriority,
  reasonCode: ClothingRequirementReasonCode,
): void {
  candidates.push({
    kind: 'water_protection',
    target,
    minimum,
    priority,
    reasonCodes: [reasonCode],
  });
}

function addTraction(
  candidates: ClothingRequirement[],
  priority: ClothingRequirementPriority,
  reasonCode: ClothingRequirementReasonCode,
): void {
  candidates.push({
    kind: 'traction',
    minimum: 'enhanced',
    priority,
    reasonCodes: [reasonCode],
  });
}

/**
 * Converts an already-validated provider-independent weather snapshot into
 * weather-protection properties. It does not select or compose clothing.
 */
export function deriveClothingRequirements(
  snapshot: WeatherSnapshot,
): ClothingRequirements {
  const observedAt = Date.parse(snapshot.current.observedAt);
  const relevantHourly = snapshot.hourly.filter(
    ({ forecastAt }) => Date.parse(forecastAt) >= observedAt,
  );
  const hasRemainingForecast = relevantHourly.some(
    ({ forecastAt }) => Date.parse(forecastAt) > observedAt,
  );
  const measurements: readonly WeatherMeasurements[] = [
    snapshot.current,
    ...relevantHourly,
  ];
  const airTemperatures = measurements.map(({ temperatureCelsius }) =>
    temperatureCelsius,
  );
  const apparentTemperatures = measurements.map(
    ({ apparentTemperatureCelsius }) => apparentTemperatureCelsius,
  );
  const usesDailyExtremaFallback = !hasRemainingForecast;

  if (usesDailyExtremaFallback) {
    airTemperatures.push(
      snapshot.minimumTemperatureCelsius,
      snapshot.maximumTemperatureCelsius,
    );
  }

  const coldExposure = Math.min(...airTemperatures, ...apparentTemperatures);
  const heatExposure = Math.max(...airTemperatures, ...apparentTemperatures);
  const wideDailyRange =
    snapshot.maximumTemperatureCelsius - snapshot.minimumTemperatureCelsius >= 8;
  const candidates: ClothingRequirement[] = [];

  const coldReasons = temperatureReasons(
    airTemperatures,
    apparentTemperatures,
    18,
    'low',
    wideDailyRange,
    usesDailyExtremaFallback,
  );

  if (coldExposure < 18) {
    const minimum: ThermalRequirement['minimum'] = coldExposure < 5
      ? 'high'
      : coldExposure < 12
        ? 'moderate'
        : 'light';
    candidates.push({
      kind: 'thermal',
      minimum,
      priority: 'mandatory',
      reasonCodes: coldReasons,
    });
    candidates.push({
      kind: 'arm_coverage',
      minimum: 'full',
      priority: coldExposure < 12 ? 'mandatory' : 'optional',
      reasonCodes: coldReasons,
    });
    candidates.push({
      kind: 'leg_coverage',
      minimum: 'full',
      priority: coldExposure < 12 ? 'mandatory' : 'optional',
      reasonCodes: coldReasons,
    });
  }

  if (heatExposure >= 24) {
    const highHeat = heatExposure >= 28;
    candidates.push({
      kind: 'breathability',
      minimum: highHeat ? 'high' : 'moderate',
      priority: highHeat ? 'mandatory' : 'optional',
      reasonCodes: temperatureReasons(
        airTemperatures,
        apparentTemperatures,
        24,
        'high',
        wideDailyRange,
        usesDailyExtremaFallback,
      ),
    });
  }

  const maximumWind = Math.max(
    ...measurements.map(({ windSpeedMetersPerSecond }) =>
      windSpeedMetersPerSecond,
    ),
  );
  if (maximumWind >= 5) {
    const strongWind = maximumWind >= 8;
    candidates.push({
      kind: 'wind_protection',
      minimum: 'wind_resistant',
      priority: strongWind ? 'mandatory' : 'optional',
      reasonCodes: [strongWind ? 'wind_strong' : 'wind_elevated'],
    });
  }

  const maximumPrecipitationProbability = Math.max(
    ...measurements.map(({ precipitationProbability }) =>
      precipitationProbability,
    ),
  );
  if (maximumPrecipitationProbability >= 0.6) {
    addWaterProtection(
      candidates,
      'body',
      'waterproof',
      'mandatory',
      'precipitation_likely',
    );
  } else if (maximumPrecipitationProbability >= 0.3) {
    addWaterProtection(
      candidates,
      'body',
      'water_resistant',
      'optional',
      'precipitation_possible',
    );
  }

  for (const condition of new Set(measurements.map(({ condition }) => condition))) {
    const reasonCode = `condition_${condition}` as ClothingRequirementReasonCode;

    switch (condition) {
      case 'drizzle':
        addWaterProtection(
          candidates,
          'body',
          'water_resistant',
          'mandatory',
          reasonCode,
        );
        break;
      case 'rain':
        addWaterProtection(
          candidates,
          'body',
          'waterproof',
          'mandatory',
          reasonCode,
        );
        addWaterProtection(
          candidates,
          'feet',
          'water_resistant',
          'optional',
          reasonCode,
        );
        break;
      case 'heavy_rain':
      case 'thunderstorm':
        addWaterProtection(
          candidates,
          'body',
          'waterproof',
          'mandatory',
          reasonCode,
        );
        addWaterProtection(
          candidates,
          'feet',
          'water_resistant',
          'mandatory',
          reasonCode,
        );
        addTraction(candidates, 'optional', reasonCode);
        break;
      case 'sleet':
      case 'snow':
        addWaterProtection(
          candidates,
          'body',
          'waterproof',
          'mandatory',
          reasonCode,
        );
        addWaterProtection(
          candidates,
          'feet',
          'waterproof',
          'mandatory',
          reasonCode,
        );
        addTraction(candidates, 'mandatory', reasonCode);
        break;
      case 'clear':
      case 'mostly_clear':
      case 'partly_cloudy':
      case 'cloudy':
      case 'fog':
        break;
    }
  }

  const requirements = mergeRequirements(candidates);
  const globalReasonCodes: ClothingRequirementReasonCode[] = requirements.flatMap(
    ({ reasonCodes }) => reasonCodes,
  );

  if (wideDailyRange) {
    globalReasonCodes.push('daily_range_wide');
  }
  if (usesDailyExtremaFallback) {
    globalReasonCodes.push('daily_extrema_fallback');
  }

  return Object.freeze({
    requirements,
    reasonCodes: orderedReasonCodes(globalReasonCodes),
  });
}
