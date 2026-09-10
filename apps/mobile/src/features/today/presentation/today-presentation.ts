import type { RecommendedOutfit } from '@/features/recommendation/application/recommend-outfits';
import type {
  GarmentTypeId,
  StructuralCategory,
} from '@/features/catalog/domain/garment-taxonomy';
import {
  outfitSlots,
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
    otherOptionsHeading: string;
  }>;
  header: Readonly<{
    location: string;
    freshness: string;
    isStale: boolean;
    isRefreshing: boolean;
    announceFreshness: boolean;
  }>;
  weather: Readonly<{
    condition: string;
    temperature: string;
    apparentTemperature: string;
    range: string;
    rainProbability: string;
    accessibilityLabel: string;
  }>;
  generationMode: Readonly<{
    label: string;
    accessibilityLabel: string;
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

function formatTime(
  value: string,
  timeZone: string,
  language: SupportedLanguage,
): string {
  return new Intl.DateTimeFormat(localeTag(language), {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone,
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
  const title = messages.recommendation.archetypes[outfit.archetypeId];
  const summary = pieces.map(({ item }) => item).join(' + ');
  const reasons = [
    ...weatherReasons,
    ...outfit.reasonCodes.map((reason) => copy.compositionReasons[reason]),
  ];
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
    id: `outfit-${index + 1}`,
    positionLabel: copy.optionPosition(index + 1, total),
    title,
    summary,
    emphasis: index === 0 ? copy.emphasis.recommended : undefined,
    pieces,
    boardPieces,
    boardAccessibilityLabel: copy.boardAccessibilityLabel({ archetype: title, pieces: pieces.map(({ item }) => item) }),
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

function createLoadedPresentation(
  snapshot: TodaySnapshot,
  language: SupportedLanguage,
  isRefreshing: boolean,
  refreshFailed: boolean,
): LoadedTodayPresentation {
  const messages = getMessages(language);
  const copy = messages.today;
  const weatherCopy = messages.weather;
  const weather = snapshot.weather;
  const current = weather.current;
  const time = formatTime(weather.fetchedAt, weather.timeZone, language);
  const isStale = snapshot.freshness === 'stale';
  const condition = weatherCopy.conditions[current.condition];
  const weatherReasons = snapshot.recommendation.requirements.reasonCodes.map(
    (reason) => copy.requirementReasons[reason],
  );
  const outfits =
    snapshot.recommendation.status === 'recommended'
      ? snapshot.recommendation.outfits
      : [];
  const suggestions = outfits.map((outfit, index) =>
    localizeOutfit(outfit, index, outfits.length, weatherReasons, language),
  );
  const generationMode = snapshot.recommendation.status === 'recommended' &&
    snapshot.recommendation.generationMode === 'ai-assisted'
    ? {
        label: copy.generationModeAiAssisted,
        accessibilityLabel: copy.generationModeAccessibilityLabel(copy.generationModeAiAssisted),
      }
    : null;
  const primary = suggestions[0];

  return {
    kind: 'loaded',
    atmosphere: resolveAtmosphereState(
      current.condition,
      localHourOf(weather.fetchedAt, weather.timeZone),
    ),
    copy: {
      title: copy.title,
      piecesHeading: copy.piecesHeading,
      reasonsHeading: copy.reasonsHeading,
      otherOptionsHeading: copy.otherOptionsHeading,
    },
    header: {
      location:
        snapshot.activeLocation.source === 'manual'
          ? snapshot.activeLocation.displayName
          : weatherCopy.currentLocation,
      freshness: isRefreshing
        ? copy.refreshingStatus
        : refreshFailed
          ? copy.refreshFailedAt(time)
          : isStale
            ? copy.staleAt(time)
            : copy.updatedAt(time),
      isStale,
      isRefreshing,
      announceFreshness: isRefreshing || refreshFailed || isStale,
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
        formatPercent(current.precipitationProbability, language),
      ),
      accessibilityLabel: copy.weatherAccessibilityLabel({
        condition,
        current: current.temperatureCelsius,
        apparent: current.apparentTemperatureCelsius,
        minimum: weather.minimumTemperatureCelsius,
        maximum: weather.maximumTemperatureCelsius,
        rainProbability: Math.round(current.precipitationProbability * 100),
      }),
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
): TodayPresentation {
  const copy = getMessages(language).today;

  if (state.kind === 'loading') {
    return {
      kind: 'loading',
      title: copy.loadingTitle,
      body: copy.loadingBody,
      accessibilityLabel: copy.loadingAccessibilityLabel,
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
    return {
      kind: 'unavailable',
      reason: 'failure',
      title: copy.unavailableTitle,
      body: copy.unavailableBody,
      accessibilityLabel: `${copy.unavailableTitle}. ${copy.unavailableBody}`,
    };
  }

  return createLoadedPresentation(
    state.snapshot,
    language,
    state.isRefreshing,
    state.refreshFailed,
  );
}
