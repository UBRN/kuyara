import type { DayKind } from '@kuyara/contracts';

import {
  archetypeLabel,
  localDayKind,
  type RecommendationPhase,
} from '@/features/recommendation/application/recommendation-application-controller';
import type { RecommendedOutfit } from '@/features/recommendation/application/recommend-outfits';
import type { RecommendationGenerationMode } from '@/features/recommendation/domain/generation-mode';
import type {
  ClothingRequirementReasonCode,
  ClothingRequirements,
} from '@/features/recommendation/domain/weather-to-clothing-requirements';
import type {
  GarmentTypeId,
  StructuralCategory,
} from '@/features/catalog/domain/garment-taxonomy';
import {
  accessoryOutfitSlots,
  outfitSlots,
  type AccessoryOutfitSlot,
  type OutfitRequirementEvaluation,
  type OutfitSlot,
  type AssignedOutfitGarment,
  type OutfitCandidate,
} from '@/features/recommendation/domain/outfit-composition';
import type {
  TodayScreenState,
  TodaySnapshot,
} from '@/features/today/model';
import {
  resolveAtmosphereState,
  resolveDaypart,
  type Daypart,
} from '@/features/today/domain/atmosphere-state';
import { todayRainOutlookProbability } from '@/features/today/domain/today-rain-outlook';
import {
  findDayInsight,
  type DayInsight,
  type DayInsightModifier,
} from '@/features/weather/domain/day-insight';
import {
  getMessages,
  type SupportedLanguage,
  type TodayMessages,
  type TodayRequirementName,
} from '@/localization/messages';
import {
  formatTemperature,
  formatTemperatureValue,
  localeTag,
} from '@/presentation/format-temperature';
import type { AtmosphereState } from '@/theme/theme';

const DETAIL_CAPTION_GAP = 7;
const DETAIL_CORE_CAP = 0.42;
const DETAIL_RAIL_CAP = 0.30;

type DetailBoardBox = Readonly<{
  slot: OutfitSlot;
  garmentTypeId: GarmentTypeId;
  x: number;
  y: number;
  width: number;
  height: number;
}>;

export type DetailCaptionLayout = Readonly<{
  left: number;
  top: number;
  width: number;
}>;

export function createDetailCaptionLayout(
  box: DetailBoardBox,
  boardWidth: number,
): DetailCaptionLayout {
  const cap = boardWidth * (
    box.slot === 'mid_layer' || box.slot === 'outer_layer'
      ? DETAIL_RAIL_CAP
      : DETAIL_CORE_CAP
  );
  const centeredLeft = box.x + box.width / 2 - cap / 2;

  return {
    left: Math.min(Math.max(0, centeredLeft), boardWidth - cap),
    top: box.y + box.height + DETAIL_CAPTION_GAP,
    width: cap,
  };
}

type LocalizedOutfitPiece = Readonly<{
  slot: string;
  item: string;
  category: StructuralCategory;
  garmentTypeId: GarmentTypeId;
}>;

/**
 * The accessories the outfit finishes with. The garment board never draws them (ADR 0025),
 * so they reach the screen as their own list: badges under the Today card and a row on the
 * detail. Empty on every day that asks for none.
 */
export type LocalizedOutfitAccessory = LocalizedOutfitPiece & Readonly<{
  accessorySlot: AccessoryOutfitSlot;
}>;

export type LocalizedRequirementRow = Readonly<{
  id: string;
  kind: 'reason' | 'tradeoff';
  text: string;
}>;

export type LoadedOutfitPresentation = Readonly<{
  id: string;
  positionLabel: string;
  title: string;
  summary: string;
  emphasis?: string;
  pieces: readonly LocalizedOutfitPiece[];
  boardPieces: readonly Readonly<{ slot: OutfitSlot; garmentTypeId: GarmentTypeId; category: StructuralCategory }>[];
  boardAccessibilityLabel: string;
  accessories: readonly LocalizedOutfitAccessory[];
  accessoriesAccessibilityLabel: string;
  reasons: readonly string[];
  requirementRows: readonly LocalizedRequirementRow[];
  accessibilityLabel: string;
}>;

export type LoadedTodayPresentation = Readonly<{
  kind: 'loaded';
  atmosphere: AtmosphereState;
  copy: Readonly<{
    title: string;
    piecesHeading: string;
    reasonsHeading: string;
    finishingTouchesHeading: string;
    otherOptionsHeading: string;
  }>;
  header: Readonly<{
    location: string;
    freshness: string;
    isStale: boolean;
    isRefreshing: boolean;
    announceFreshness: boolean;
    // Set only while a recommendation refresh is narrating itself, in which case
    // `freshness` already carries that phase's copy instead of the generic line.
    phase: RecommendationPhase | null;
  }>;
  weather: Readonly<{
    condition: string;
    temperature: string;
    apparentTemperature: string;
    range: string;
    rainProbability: string;
    accessibilityLabel: string;
    // The provider-neutral identifier of whoever answered, carried so Today can show the
    // same attribution the Weather screen shows (ADR 0002 section 8). It is not display
    // text: `WeatherAttribution` maps it to a localized line, a link and, for OpenWeather,
    // the logo, and renders nothing for `sample` or an unrecognized identifier.
    sourceId: string;
    // The raw provider-neutral condition code and whether the sun is up at the place,
    // carried so the corner glyph can resolve its own condition ink and tempo. Neither is
    // display text: the visible condition name stays `condition`.
    conditionCode: string;
    daypart: Daypart | null;
  }>;
  // ADR 0034 section 4: neither badge carries a glyph, so the presentation carries words
  // only and the screen draws one controlled badge for both AI modes.
  generationMode: Readonly<{
    label: string;
    accessibilityLabel: string;
  }> | null;
  // The detail surface's one plain sentence, present in all three modes and null only while
  // no recommendation is settled.
  generationSource: string | null;
  /**
   * The support line under the rationale: what the rest of the dressing day does, or null on
   * a day with nothing worth saying, which draws no line and leaves no gap.
   */
  dayInsight: string | null;
  stageAccessibilityLabel: string;
  suggestions: readonly LoadedOutfitPresentation[];
  noOutfit: Readonly<{ title: string; body: string }> | null;
}>;

export type TodayPresentation =
  | LoadedTodayPresentation
  | Readonly<{
      kind: 'loading' | 'unavailable';
      title: string;
      body: string;
      accessibilityLabel: string;
      reason?: 'no-active-location' | 'failure';
      actionLabel?: string;
      phase?: RecommendationPhase | null;
    }>;

function formatPercent(ratio: number, language: SupportedLanguage): string {
  return new Intl.NumberFormat(localeTag(language), {
    style: 'percent',
    maximumFractionDigits: 0,
  }).format(ratio);
}

// The freshness line answers "how old is this?", so it is read against the viewer's own
// clock: the device time zone, and the device's 12/24-hour setting rather than a fixed
// 24-hour label or the application language.
function formatTime(
  value: string,
  language: SupportedLanguage,
  hour12: boolean,
  // The freshness line is read against the viewer's own clock and passes none; an hour that
  // belongs to the forecast passes the place's zone, so the sentence and the rail agree.
  timeZone?: string,
): string {
  return new Intl.DateTimeFormat(localeTag(language), {
    hour: hour12 ? 'numeric' : '2-digit',
    minute: '2-digit',
    hour12,
    timeZone,
  }).format(new Date(value));
}

const dayInsightModifierKeys = {
  hot: 'hot',
  very_hot: 'veryHot',
  chilly: 'chilly',
  freezing: 'freezing',
} as const satisfies Record<DayInsightModifier['level'], string>;

const dayInsightSkyKeys = {
  clear_all_day: 'clear',
  cloudy_all_day: 'cloudy',
  foggy_all_day: 'foggy',
} as const;

/**
 * The one whole sentence for an insight. A modifier and a period each select a different key
 * rather than adding a clause, so no sentence is ever assembled from translated fragments,
 * and every hour arrives as one token the screen's own time helper has already formatted.
 * The period names itself: the dressing day's second half is the evening, which begins at
 * 18:00 whatever the sun is doing, so the sentence never says night over a lit sky.
 */
function dayInsightSentence(
  insight: DayInsight,
  copy: TodayMessages['dayInsight'],
  at: (value: string) => string,
): string | null {
  switch (insight.kind) {
    case 'wet_all_day':
      return copy.sentences[`${insight.form}_${insight.period}`];
    case 'wet_window': {
      const snow = insight.form === 'snow';
      const from = insight.fromHour === null ? null : at(insight.fromHour);
      const until = insight.untilHour === null ? null : at(insight.untilHour);
      if (from !== null && until !== null) {
        return snow ? copy.snowFromUntil({ from, until }) : copy.rainFromUntil({ from, until });
      }
      if (from !== null) return snow ? copy.snowFrom(from) : copy.rainFrom(from);
      if (until !== null) return snow ? copy.snowUntil(until) : copy.rainUntil(until);
      // Unreachable: a run with neither end is the all-day shape above.
      return null;
    }
    case 'heat':
      return insight.level === 'very_hot' ? copy.veryHot(at(insight.atHour)) : copy.hot(at(insight.atHour));
    case 'cold':
      return insight.level === 'freezing'
        ? copy.freezing(at(insight.atHour))
        : copy.chilly(at(insight.atHour));
    case 'windy':
      return copy.sentences[insight.level === 'very_windy' ? 'veryWindy' : 'windy'];
    default: {
      const sky = `${dayInsightSkyKeys[insight.kind]}_${insight.period}` as const;
      return insight.modifier === null
        ? copy.sentences[sky]
        : copy.sentences[`${sky}_${dayInsightModifierKeys[insight.modifier.level]}`];
    }
  }
}

function assignedGarments(outfit: OutfitCandidate): readonly AssignedOutfitGarment[] {
  const assigned = [
    ...(outfit.body.kind === 'separates'
      ? [outfit.body.primaryTop, outfit.body.bottom]
      : [outfit.body.onePiece]),
    outfit.midLayer,
    outfit.outerLayer,
    outfit.footwear,
  ].filter((garment): garment is AssignedOutfitGarment => garment !== null);

  return outfitSlots.flatMap((slot) => {
    const garment = assigned.find((candidate) => candidate.slot === slot);
    return garment ? [garment] : [];
  });
}

function localizeOutfit(
  outfit: RecommendedOutfit,
  index: number,
  total: number,
  weatherReasons: readonly string[],
  language: SupportedLanguage,
  dayKind: DayKind,
): LoadedOutfitPresentation {
  const messages = getMessages(language);
  const copy = messages.today;
  const assigned = assignedGarments(outfit);
  const boardPieces = assigned.map(({ garment, slot }) => ({
    slot, garmentTypeId: garment.garmentTypeId, category: garment.properties.category,
  }));
  const pieces = assigned.map(({ garment, slot }) => ({
    slot: copy.slots[slot],
    item:
      messages.catalog[
        `catalog.garment_type.${garment.garmentTypeId}.name`
      ],
    category: garment.properties.category,
    garmentTypeId: garment.garmentTypeId,
  }));
  const accessories = accessoryOutfitSlots.flatMap((accessorySlot) => {
    const accessory = outfit.accessories[accessorySlot];
    return accessory
      ? [{
          accessorySlot,
          slot: copy.slots[accessorySlot],
          item: messages.catalog[
            `catalog.garment_type.${accessory.garment.garmentTypeId}.name`
          ],
          category: accessory.garment.properties.category,
          garmentTypeId: accessory.garment.garmentTypeId,
        } satisfies LocalizedOutfitAccessory]
      : [];
  });
  const title = archetypeLabel(messages.recommendation, outfit.archetypeId, dayKind);
  const summary = pieces.map(({ item }) => item).join(' + ');
  const composedReasons = [
    ...weatherReasons,
    ...outfit.reasonCodes.map((reason) => copy.compositionReasons[reason]),
  ];
  // Today prints `reasons[0]` as its rationale line. A mild day derives no clothing
  // requirement and therefore no reason code, which would leave that line blank, so one
  // deterministic status sentence stands in. Any real reason, the daily-range one
  // included, keeps its place and suppresses it.
  const reasons = composedReasons.length > 0
    ? composedReasons
    : [copy.mildWeatherRationale];
  const pieceNamesByCandidateKey = new Map(
    assigned.map(({ garment }, assignedIndex) => [garment.candidateKey, pieces[assignedIndex].item]),
  );
  const requirementRows = outfit.requirementEvaluations.flatMap((evaluation) => {
    if (evaluation.status !== 'met' && evaluation.status !== 'tradeoff') return [];

    const candidateKeys = evaluation.status === 'tradeoff'
      ? evaluation.tradeoffCandidateKeys
      : evaluation.suppliedByCandidateKeys;
    const garmentNames = candidateKeys.flatMap((candidateKey) => {
      const name = pieceNamesByCandidateKey.get(candidateKey);
      return name ? [name] : [];
    });
    if (garmentNames.length === 0) return [];

    const requirementName = copy.requirementNames[requirementNameKey(evaluation)];
    const kind = evaluation.status === 'tradeoff' ? 'tradeoff' : 'reason';
    return [{
      id: requirementNameKey(evaluation),
      kind,
      text: kind === 'tradeoff'
        ? copy.requirementTradeoffRow({ requirement: requirementName, garments: garmentNames })
        : copy.requirementRow({ requirement: requirementName, garments: garmentNames }),
    } satisfies LocalizedRequirementRow];
  });

  return {
    id: outfit.optionId,
    positionLabel: copy.optionPosition(index + 1, total),
    title,
    summary,
    emphasis: index === 0 ? copy.emphasis.recommended : undefined,
    pieces,
    boardPieces,
    boardAccessibilityLabel: copy.boardAccessibilityLabel({ archetype: title, pieces: pieces.map(({ item }) => item) }),
    accessories,
    accessoriesAccessibilityLabel: accessories.length > 0
      ? copy.finishingTouchesAccessibilityLabel(accessories.map(({ item }) => item))
      : '',
    reasons,
    requirementRows,
    accessibilityLabel: copy.outfitAccessibilityLabel({
      position: index + 1,
      total,
      archetype: title,
      pieces,
      reasons,
    }),
  };
}

function requirementNameKey(
  evaluation: OutfitRequirementEvaluation,
): TodayRequirementName {
  const requirement = evaluation.requirement;
  if (requirement.kind !== 'water_protection') return requirement.kind;
  return requirement.target === 'body'
    ? 'body_water_protection'
    : 'footwear_water_protection';
}

// Today prints `reasons[0]` as the primary outfit's rationale. The derivation orders its
// reason codes by the weather value they came from, so an optional requirement's sentence
// can lead and explain the outfit by something it was not composed to answer. A mandatory
// requirement's reason comes first; inside each group the derivation's own order stands.
function reasonCodesByPriority(
  requirements: ClothingRequirements,
): readonly ClothingRequirementReasonCode[] {
  const mandatory = new Set(
    requirements.requirements
      .filter(({ priority }) => priority === 'mandatory')
      .flatMap(({ reasonCodes }) => reasonCodes),
  );

  return [
    ...requirements.reasonCodes.filter((code) => mandatory.has(code)),
    ...requirements.reasonCodes.filter((code) => !mandatory.has(code)),
  ];
}

function createLoadedPresentation(
  snapshot: TodaySnapshot,
  language: SupportedLanguage,
  hour12: boolean,
  isRefreshing: boolean,
  refreshFailed: boolean,
  now: number,
  phase: RecommendationPhase | null,
): LoadedTodayPresentation {
  const messages = getMessages(language);
  const copy = messages.today;
  const weatherCopy = messages.weather;
  const weather = snapshot.weather;
  const current = weather.current;
  const rainProbability = todayRainOutlookProbability(weather, now);
  const time = formatTime(weather.fetchedAt, language, hour12);
  const insight = findDayInsight({ snapshot: weather, now: new Date(now).toISOString() });
  const dayInsight = insight === null ? null : dayInsightSentence(
    insight,
    copy.dayInsight,
    (value) => formatTime(value, language, hour12, weather.timeZone),
  );
  const isStale = snapshot.freshness === 'stale';
  const condition = weatherCopy.conditions[current.condition];
  const weatherReasons = reasonCodesByPriority(
    snapshot.recommendation.requirements,
  ).map((reason) => copy.requirementReasons[reason]);
  const outfits =
    snapshot.recommendation.status === 'recommended'
      ? snapshot.recommendation.outfits
      : [];
  // The label follows the day the user is reading it on, so a stored weekend result does not
  // say "Weekend Relaxed" on the Monday after.
  const dayKind = localDayKind(new Date(now));
  const suggestions = outfits.map((outfit, index) =>
    localizeOutfit(outfit, index, outfits.length, weatherReasons, language, dayKind),
  );
  // ADR 0034 section 4: the on-device badge appears only when the stored mode is
  // `on-device-ai`, so the words never advertise a tier that did not produce this result,
  // and a settled deterministic result carries no badge at all, because the absence of the
  // mark is the signal (ADR 0021 section 8). The phase line during generation is separate
  // and still narrates the deterministic fallback while it runs.
  const generationModeBadges: Record<
    RecommendationGenerationMode,
    Readonly<{ label: string; accessibilityLabel: string }> | null
  > = {
    'on-device-ai': {
      label: copy.generationModeOnDeviceAi,
      accessibilityLabel: copy.generationModeOnDeviceAiAccessibilityLabel,
    },
    'ai-assisted': {
      label: copy.generationModeAiAssisted,
      accessibilityLabel: copy.generationModeAiAssistedAccessibilityLabel,
    },
    'deterministic-fallback': null,
  };
  // The detail surface has room for the whole sentence, so it says where the outfit was
  // chosen in all three modes, including the one Today deliberately leaves unmarked.
  const generationSources: Record<RecommendationGenerationMode, string> = {
    'on-device-ai': copy.generationSourceOnDeviceAi,
    'ai-assisted': copy.generationSourceAiAssisted,
    'deterministic-fallback': copy.generationSourceDeterministic,
  };
  const settledMode = snapshot.recommendation.status === 'recommended'
    ? snapshot.recommendation.generationMode
    : null;
  const generationMode = settledMode ? generationModeBadges[settledMode] : null;
  const generationSource = settledMode ? generationSources[settledMode] : null;
  const primary = suggestions[0];
  // One reading of the place's own sunrise and sunset feeds both the stage tint and the
  // corner glyph, so the two can never disagree about whether it is day or night there.
  const daypart = resolveDaypart(
    new Date(now).toISOString(),
    weather.timeZone,
    snapshot.activeLocation.coordinates,
  );

  return {
    kind: 'loaded',
    atmosphere: resolveAtmosphereState(current.condition, daypart),
    copy: {
      title: copy.title,
      piecesHeading: copy.piecesHeading,
      reasonsHeading: copy.reasonsHeading,
      finishingTouchesHeading: copy.finishingTouchesHeading,
      otherOptionsHeading: copy.otherOptionsHeading,
    },
    header: {
      // A device fix names its locality when the reverse geocode resolved one, and falls
      // back to the generic copy when it did not.
      location: snapshot.activeLocation.displayName ?? weatherCopy.currentLocation,
      freshness: isRefreshing
        ? phase
          ? copy.phase[phase]
          : copy.refreshingStatus
        : refreshFailed
          ? copy.refreshFailedAt(time)
          : isStale
            ? copy.staleAt(time)
            : copy.updatedAt(time),
      isStale,
      isRefreshing,
      announceFreshness: isRefreshing || refreshFailed || isStale,
      phase: isRefreshing ? phase : null,
    },
    weather: {
      condition,
      temperature: formatTemperature(current.temperatureCelsius, language),
      apparentTemperature: copy.apparentTemperature(
        formatTemperature(current.apparentTemperatureCelsius, language),
      ),
      range: copy.temperatureRange(
        formatTemperature(weather.minimumTemperatureCelsius, language),
        formatTemperature(weather.maximumTemperatureCelsius, language),
      ),
      rainProbability: copy.rainProbability(
        formatPercent(rainProbability, language),
      ),
      accessibilityLabel: copy.weatherAccessibilityLabel({
        condition,
        current: formatTemperatureValue(current.temperatureCelsius, language),
        apparent: formatTemperatureValue(current.apparentTemperatureCelsius, language),
        minimum: formatTemperatureValue(weather.minimumTemperatureCelsius, language),
        maximum: formatTemperatureValue(weather.maximumTemperatureCelsius, language),
        rainProbability: Math.round(rainProbability * 100),
      }),
      sourceId: weather.origin.sourceId,
      conditionCode: current.condition,
      daypart,
    },
    generationMode,
    generationSource,
    dayInsight,
    stageAccessibilityLabel: primary ? copy.stageAccessibilityLabel({
      temperature: formatTemperatureValue(current.temperatureCelsius, language),
      condition,
      pieces: primary.pieces.map(({ item }) => item),
      archetype: primary.title,
    }) : '',
    suggestions,
    noOutfit:
      snapshot.recommendation.status === 'unavailable'
        ? { title: copy.noOutfitTitle, body: copy.noOutfitBody }
        : null,
  };
}

export function createTodayPresentation(
  state: TodayScreenState,
  language: SupportedLanguage,
  hour12: boolean,
  now: number,
): TodayPresentation {
  const messages = getMessages(language);
  const copy = messages.today;

  if (state.kind === 'loading') {
    return {
      kind: 'loading',
      title: copy.loadingTitle,
      body: copy.loadingBody,
      accessibilityLabel: copy.loadingAccessibilityLabel,
      phase: state.phase ?? null,
    };
  }

  if (state.kind === 'unavailable') {
    if (state.reason === 'no-active-location') {
      return {
        kind: 'unavailable',
        reason: 'no-active-location',
        title: copy.noLocationTitle,
        body: copy.noLocationBody,
        actionLabel: copy.chooseLocationAction,
        accessibilityLabel: `${copy.noLocationTitle}. ${copy.noLocationBody}`,
      };
    }
    // A dead end otherwise: the screen states the failure and offers nothing to do about
    // it. Being offline is the one category the user can act on differently, so it keeps
    // the same words Weather already uses for it rather than the generic line.
    const failureCopy = state.failure === 'offline'
      ? { title: messages.weather.offlineTitle, body: messages.weather.offlineBody }
      : { title: copy.unavailableTitle, body: copy.unavailableBody };

    return {
      kind: 'unavailable',
      reason: 'failure',
      title: failureCopy.title,
      body: failureCopy.body,
      actionLabel: copy.refreshAction,
      accessibilityLabel: `${failureCopy.title}. ${failureCopy.body}`,
    };
  }

  return createLoadedPresentation(
    state.snapshot,
    language,
    hour12,
    state.isRefreshing,
    state.refreshFailed,
    now,
    state.phase ?? null,
  );
}
