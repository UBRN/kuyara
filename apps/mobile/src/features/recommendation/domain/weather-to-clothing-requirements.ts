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
import { wardrobeDayWindow } from '@/features/weather/domain/wardrobe-day';
import {
  chillyCelsius,
  freezingCelsius,
  hotCelsius,
  precipitationLikelyThreshold,
  veryHotCelsius,
  veryWindyMetersPerSecond,
  windyMetersPerSecond,
} from '@/features/weather/domain/weather-thresholds';

export const clothingRequirementReasonCodes = Object.freeze([
  'temperature_low',
  'apparent_temperature_low',
  'temperature_high',
  'apparent_temperature_high',
  'daily_range_wide',
  // No longer produced: the dressing-day window supplies its own extremes and never the
  // provider's calendar minimum and maximum. The member stays because recommendations
  // persisted before that change still carry it, and because the shared request enum in
  // `packages/contracts` lists it for binaries that are already installed.
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

export const extremityCoverTargets = Object.freeze([
  'head',
  'neck',
  'hands',
] as const);

export type ExtremityCoverTarget = (typeof extremityCoverTargets)[number];

/**
 * Warmth over one extremity. No top, bottom, one-piece, outer layer or shoe carries the
 * head, the neck or the hands, so this is the one requirement the six body slots never
 * answer: only an accessory does, and only after the outfit is composed.
 */
export type ExtremityCoverRequirement = RequirementBase<
  Exclude<ThermalLevel, 'none'>
> & Readonly<{ kind: 'extremity_cover'; target: ExtremityCoverTarget }>;

export type ClothingRequirement =
  | ThermalRequirement
  | BreathabilityRequirement
  | ArmCoverageRequirement
  | LegCoverageRequirement
  | WaterProtectionRequirement
  | WindProtectionRequirement
  | TractionRequirement
  | ExtremityCoverRequirement;

/** Everything the six body slots are composed and scored against. */
export type BodyClothingRequirement = Exclude<
  ClothingRequirement,
  ExtremityCoverRequirement
>;

export type ClothingRequirements = Readonly<{
  requirements: readonly ClothingRequirement[];
  reasonCodes: readonly ClothingRequirementReasonCode[];
}>;

export type BodyClothingRequirements = Readonly<{
  requirements: readonly BodyClothingRequirement[];
  reasonCodes: readonly ClothingRequirementReasonCode[];
}>;

function isBodyRequirement(
  requirement: ClothingRequirement,
): requirement is BodyClothingRequirement {
  return requirement.kind !== 'extremity_cover';
}

/**
 * The same set without the accessory-only requirements. Composition reads this, so an
 * extremity nobody can cover with a coat never lowers an outfit's score or invalidates it.
 */
export function bodyClothingRequirements(
  requirements: ClothingRequirements,
): BodyClothingRequirements {
  return Object.freeze({
    requirements: Object.freeze(
      requirements.requirements.filter(isBodyRequirement),
    ),
    reasonCodes: requirements.reasonCodes,
  });
}

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
  'extremity_cover:head': 8,
  'extremity_cover:neck': 9,
  'extremity_cover:hands': 10,
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
  return requirement.kind === 'water_protection' ||
      requirement.kind === 'extremity_cover'
    ? `${requirement.kind}:${requirement.target}`
    : requirement.kind;
}

function requirementStrength(requirement: ClothingRequirement): number {
  switch (requirement.kind) {
    case 'thermal':
    case 'extremity_cover':
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
  nowIso: string,
): ClothingRequirements {
  // Both the window and the "remaining" cut come from `now`, not from `observedAt`: at 00:20
  // a 23:50 snapshot would otherwise answer for yesterday and drop every hour left ahead.
  // The window is the dressing day, so an evening open reaches the hours of the night the
  // person is walking into instead of stopping at a midnight nobody changes clothes at.
  const now = Date.parse(nowIso);
  const dayWindow = wardrobeDayWindow(nowIso, snapshot.timeZone);
  // A zone `Intl` refuses leaves no window, and a requirement set built from the current
  // measurement alone would be a silent narrowing rather than a stated one. Every hour the
  // snapshot still has ahead is the honest pool there: wider than the dressing day, never
  // emptier than it.
  const windowEnd = dayWindow ? Date.parse(dayWindow.end) : Number.POSITIVE_INFINITY;
  const relevantHourly = snapshot.hourly.filter(
    ({ forecastAt }) => {
      const forecast = Date.parse(forecastAt);
      return forecast >= now && forecast < windowEnd;
    },
  );
  const measurements: readonly WeatherMeasurements[] = [
    snapshot.current,
    ...relevantHourly,
  ];
  // The extremes are the window's own, never the provider's daily minimum and maximum: those
  // describe the observation's calendar day, so at 23:40 they answer with this morning's low
  // and after midnight they answer for a day that has ended. A window with no hour in it
  // contributes nothing rather than a guess, and the current measurement stands alone.
  const airTemperatures = measurements.map(({ temperatureCelsius }) =>
    temperatureCelsius,
  );
  const apparentTemperatures = measurements.map(
    ({ apparentTemperatureCelsius }) => apparentTemperatureCelsius,
  );

  const coldExposure = Math.min(...airTemperatures, ...apparentTemperatures);
  const heatExposure = Math.max(...airTemperatures, ...apparentTemperatures);
  // Deliberately the provider's calendar day and not the window: `daily_range_wide` is a
  // statement about how far the date's own spread reaches, and rebasing it on the window
  // would silently change the meaning of a reason code that is already shipped.
  const wideDailyRange =
    snapshot.maximumTemperatureCelsius - snapshot.minimumTemperatureCelsius >= 8;
  // Cold below 18 makes insulation mandatory (below 12 also full coverage); heat at or
  // above 28 makes high breathability mandatory. One day can demand both (4 °C at 07:00,
  // 29 °C at 16:00, or 17 °C at 08:00 and 30 °C at 15:00) and no garment satisfies both,
  // so the side the current conditions trigger stays mandatory and the side only later
  // hours trigger becomes optional. When neither is current, protection wins over
  // comfort: the cold side stays mandatory.
  const currentCold = Math.min(
    snapshot.current.temperatureCelsius,
    snapshot.current.apparentTemperatureCelsius,
  );
  const currentHeat = Math.max(
    snapshot.current.temperatureCelsius,
    snapshot.current.apparentTemperatureCelsius,
  );
  const conflicting = coldExposure < chillyCelsius && heatExposure >= veryHotCelsius;
  const coldDemoted = conflicting
    && currentHeat >= veryHotCelsius
    && currentCold >= chillyCelsius;
  const heatDemoted = conflicting && !coldDemoted;
  const candidates: ClothingRequirement[] = [];

  const coldReasons = temperatureReasons(
    airTemperatures,
    apparentTemperatures,
    chillyCelsius,
    'low',
    wideDailyRange,
  );

  if (coldExposure < chillyCelsius) {
    const minimum: ThermalRequirement['minimum'] = coldExposure < freezingCelsius
      ? 'high'
      : coldExposure < 12
        ? 'moderate'
        : 'light';
    const coveragePriority: ClothingRequirementPriority =
      coldExposure < 12 && !coldDemoted ? 'mandatory' : 'optional';
    candidates.push({
      kind: 'thermal',
      minimum,
      priority: coldDemoted ? 'optional' : 'mandatory',
      reasonCodes: coldReasons,
    });
    candidates.push({
      kind: 'arm_coverage',
      minimum: 'full',
      priority: coveragePriority,
      reasonCodes: coldReasons,
    });
    candidates.push({
      kind: 'leg_coverage',
      minimum: 'full',
      priority: coveragePriority,
      reasonCodes: coldReasons,
    });
  }

  // Below 12 the head, the neck and the hands are worth covering, which is the boundary
  // that already makes full arm and leg coverage mandatory. These three stay optional
  // whatever the temperature: no accessory is ever the reason an outfit does not compose,
  // and a day whose cold side is demoted by current heat asks for none of them.
  if (coldExposure < 12 && !coldDemoted) {
    for (const target of extremityCoverTargets) {
      candidates.push({
        kind: 'extremity_cover',
        target,
        minimum: coldExposure < freezingCelsius ? 'high' : 'moderate',
        priority: 'optional',
        reasonCodes: coldReasons,
      });
    }
  }

  // Three rungs on the hot side where there were two. The outside guidance puts shorts at
  // 23 and a single short sleeve at 25 (A3 section 3: Fit The Forecast 22-26 with shorts
  // from 23, raksul 25); 28 stays the rung that makes breathability mandatory. The two
  // lower rungs only reorder the offer, because a day the body can dress for is never a day
  // the wardrobe fails to dress for.
  if (heatExposure >= hotCelsius) {
    const highHeat = heatExposure >= veryHotCelsius;
    candidates.push({
      kind: 'breathability',
      minimum: heatExposure >= 25 ? 'high' : 'moderate',
      priority: highHeat && !heatDemoted ? 'mandatory' : 'optional',
      reasonCodes: temperatureReasons(
        airTemperatures,
        apparentTemperatures,
        hotCelsius,
        'high',
        wideDailyRange,
      ),
    });
  }

  const maximumWind = Math.max(
    ...measurements.map(({ windSpeedMetersPerSecond }) =>
      windSpeedMetersPerSecond,
    ),
  );
  if (maximumWind >= windyMetersPerSecond) {
    const strongWind = maximumWind >= veryWindyMetersPerSecond;
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
  if (maximumPrecipitationProbability >= precipitationLikelyThreshold) {
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

  return Object.freeze({
    requirements,
    reasonCodes: orderedReasonCodes(globalReasonCodes),
  });
}
