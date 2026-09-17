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
  localHourOf,
  resolveAtmosphereState,
} from '@/features/today/domain/atmosphere-state';
import { todayRainOutlookProbability } from '@/features/today/domain/today-rain-outlook';
import {
  getMessages,
  type SupportedLanguage,
  type TodayRequirementName,
} from '@/localization/messages';
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
  }>;
  generationMode: Readonly<{
    label: string;
    accessibilityLabel: string;
    // ADR 0034 section 4: no Apple logo, glyph or icon accompanies the on-device words, and
    // a sparkle beside "Apple Intelligence" would read as exactly that glyph. The mark stays
    // on the Worker tier alone; the other two badges carry words only.
    showsAiMark: boolean;
  }> | null;
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

function localeTag(language: SupportedLanguage): string {
  return language === 'tr' ? 'tr-TR' : 'en-GB';
}

function formatNumber(value: number, language: SupportedLanguage): string {
  return new Intl.NumberFormat(localeTag(language), {
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPercent(ratio: number, language: SupportedLanguage): string {
  return new Intl.NumberFormat(localeTag(language), {
    style: 'percent',
    maximumFractionDigits: 0,
  }).format(ratio);
}

function formatTemperature(value: number, language: SupportedLanguage): string {
  return `${formatNumber(value, language)}°`;
}

// The freshness line answers "how old is this?", so it is read against the viewer's own
// clock: the device time zone, and the device's 12/24-hour setting rather than a fixed
// 24-hour label or the application language.
function formatTime(
  value: string,
  language: SupportedLanguage,
  hour12: boolean,
): string {
  return new Intl.DateTimeFormat(localeTag(language), {
    hour: hour12 ? 'numeric' : '2-digit',
    minute: '2-digit',
    hour12,
  }).format(new Date(value));
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
  const generationModeLabels: Record<RecommendationGenerationMode, string | null> = {
    'on-device-ai': copy.generationModeOnDeviceAi,
    'ai-assisted': copy.generationModeAiAssisted,
    'deterministic-fallback': null,
  };
  const generationModeLabel = snapshot.recommendation.status === 'recommended'
    ? generationModeLabels[snapshot.recommendation.generationMode]
    : null;
  const generationMode = generationModeLabel && snapshot.recommendation.status === 'recommended'
    ? {
        label: generationModeLabel,
        accessibilityLabel: copy.generationModeAccessibilityLabel(generationModeLabel),
        showsAiMark: snapshot.recommendation.generationMode === 'ai-assisted',
      }
    : null;
  const primary = suggestions[0];

  return {
    kind: 'loaded',
    atmosphere: resolveAtmosphereState(
      current.condition,
      localHourOf(new Date(now).toISOString(), weather.timeZone),
    ),
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
        current: current.temperatureCelsius,
        apparent: current.apparentTemperatureCelsius,
        minimum: weather.minimumTemperatureCelsius,
        maximum: weather.maximumTemperatureCelsius,
        rainProbability: Math.round(rainProbability * 100),
      }),
      sourceId: weather.origin.sourceId,
    },
    generationMode,
    stageAccessibilityLabel: primary ? copy.stageAccessibilityLabel({
      temperature: formatNumber(current.temperatureCelsius, language),
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
