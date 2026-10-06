import type { DayKind } from '@kuyara/contracts';

import type { GarmentOutfitPalette } from '@/components/ui';

import {
  archetypeLabel,
  localDayKey,
  localDayKind,
  type RecommendationPhase,
} from '@/features/recommendation/application/recommendation-application-controller';
import { calendarDateUtcMidnight } from '@/domain/calendar-date';
import { dateTimeFormat, numberFormat, zonedDateKey } from '@/domain/intl-format';
import {
  departureIsAhead,
  quarterHourMs,
  type DressingDayDeparture,
} from '@/features/recommendation/domain/dressing-day-departure';
import { dateKeyDayKind } from '@/features/recommendation/domain/local-day';
import type { RecommendedOutfit } from '@/features/recommendation/application/recommend-outfits';
import type { RecommendationSnapshot } from '@/features/recommendation/application/recommendation-repository';
import type { ManualDetail } from '@/features/today/application/composed-detail';
import { previewIsThisMorning, tomorrowForecastDay } from '@/features/today/application/outfit-detail-state';
import type { RecommendationGenerationMode } from '@/features/recommendation/domain/generation-mode';
import {
  coverageDrift,
  forecastBoundedCoverage,
  laterCoolSpell,
  type OutfitCoverage,
} from '@/features/recommendation/domain/outfit-coverage';
import { weatherCauseLinks, type WeatherCause } from '@/features/recommendation/domain/weather-causes';
import {
  withDailyRangeReason,
  type ClothingRequirementReasonCode,
  type ClothingRequirements,
} from '@/features/recommendation/domain/weather-to-clothing-requirements';
import type {
  GarmentTypeId,
  StructuralCategory,
} from '@/features/catalog/domain/garment-taxonomy';
import {
  accessoryOutfitSlots,
  assignedOutfitGarments,
  type AccessoryOutfitSlot,
  type OutfitRequirementEvaluation,
  type OutfitSlot,
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
import type { DailyWeather, NormalizedCoordinates, WeatherSnapshot } from '@/features/weather/domain/weather';
import {
  getMessages,
  type SupportedLanguage,
  type TodayMessages,
  type TodayRequirementName,
} from '@/localization/messages';
import {
  dressingDayDateKey,
  isEveningDressingDayKey,
  wardrobeDayWindow,
} from '@/features/weather/domain/wardrobe-day';
import type { TemperatureUnit } from '@/localization/device-locale';
import { formatClockTime, formatLastUpdated } from '@/presentation/format-clock-time';
import {
  formatTemperature,
  formatTemperatureValue,
  localeTag,
} from '@/presentation/format-temperature';
import type { AtmosphereState } from '@/theme/theme';

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

/**
 * "Why this outfit": one kind of weather and the outermost pieces it put in the outfit,
 * drawn as a line from the weather to the pieces and said as one whole sentence.
 */
export type LocalizedWeatherLink = Readonly<{
  cause: WeatherCause;
  label: string;
  pieces: readonly Readonly<{ slot: OutfitSlot; garmentTypeId: GarmentTypeId; category: StructuralCategory; item: string }>[];
  text: string;
}>;

export type LoadedOutfitPresentation = Readonly<{
  id: string;
  positionLabel: string;
  title: string;
  /** Set once a piece is changed on detail: "Changed from <archetype>", one whole sentence. */
  changedFrom: string | null;
  summary: string;
  pieces: readonly (LocalizedOutfitPiece & Readonly<{ changed: boolean }>)[];
  boardPieces: readonly Readonly<{ slot: OutfitSlot; garmentTypeId: GarmentTypeId; category: StructuralCategory }>[];
  /** The outfit's colours (O15): its board, alternate tile, badges and detail share them. */
  palette: GarmentOutfitPalette;
  /**
   * Phase 7: after a change, the pieces still kuyara's pick keep the
   * colours the original outfit gave them. The screen resolves them from `original`.
   */
  keptColors: Readonly<{ original: GarmentOutfitPalette; slots: readonly OutfitSlot[] }> | null;
  boardAccessibilityLabel: string;
  accessories: readonly LocalizedOutfitAccessory[];
  accessoriesAccessibilityLabel: string;
  reasons: readonly string[];
  requirementRows: readonly LocalizedRequirementRow[];
  /** Empty when no weather requirement put a piece in the outfit (mild weather). */
  weatherLinks: readonly LocalizedWeatherLink[];
  accessibilityLabel: string;
}>;

export type LoadedTodayPresentation = Readonly<{
  kind: 'loaded';
  /** The visible title, whose temperature remains grouped with its condition. */
  title: string;
  titleAccessibilityLabel: string;
  /**
   * The same title split where it may wrap and where the symbol stands: `lead` is everything
   * before the temperature, and the rest stays together on one line.
   */
  titleParts: Readonly<{ lead: string; beforeSymbol: string; afterSymbol: string }>;
  /** The dressing day's date for the top row, which turns at 04:00, not at midnight. */
  date: string;
  /** The same day as `YYYY-MM-DD`, which names the shared outfit image. */
  dateKey: string;
  atmosphere: AtmosphereState;
  copy: Readonly<{
    piecesHeading: string;
    finishingTouchesHeading: string;
    otherOptionsHeading: string;
    moreIdeasHeading: string;
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
    recapAccessibilityLabel: string;
    // The raw provider-neutral condition code and whether the sun is up at the place,
    // carried so the title symbol can resolve its own condition ink and tempo. Neither is
    // display text: the visible condition name stays `condition`.
    conditionCode: string;
    daypart: Daypart | null;
  }>;
  // ADR 0034 section 4: each AI mode has its own badge, words beside its own symbol, so the
  // presentation carries which mode it is alongside the words.
  generationMode: Readonly<{
    mode: 'on-device-ai' | 'ai-assisted';
    label: string;
    accessibilityLabel: string;
  }> | null;
  // The detail surface's one plain sentence, present in all three modes and null only while
  // no recommendation is settled.
  generationSource: string | null;
  /** N18: the window the displayed outfit was chosen for, one whole sentence. */
  coverageCaption: string | null;
  /** While a re-ask runs: the window being chosen for, one whole sentence. */
  choosingCaption: string | null;
  /** N15: protection the rest of the window needs that the outfit was not chosen for. */
  driftCaption: string | null;
  /** N19: a later short cool spell, the "take a layer" finishing touch. */
  coolSpellCaption: string | null;
  /** P6: the one weather line, the accepted AI sentence first, else the deterministic one. */
  dayInsight: string | null;
  stageAccessibilityLabel: string;
  suggestions: readonly LoadedOutfitPresentation[];
  /** "More ideas": the composed pool past the outfits on screen, empty when there is none. */
  moreIdeas: readonly LoadedOutfitPresentation[];
  /** How many ideas the strip holds, one whole sentence; null without ideas. */
  moreIdeasCaption: string | null;
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
  return numberFormat(localeTag(language), {
    style: 'percent',
    maximumFractionDigits: 0,
  }).format(ratio);
}

/** The long day name a window sentence uses when it starts on another calendar date. */
function formatWindowDay(instant: number, language: SupportedLanguage, timeZone: string): string {
  return dateTimeFormat(localeTag(language), {
    weekday: 'long', day: 'numeric', month: 'long', timeZone,
  }).format(new Date(instant));
}

/**
 * The three parts every window sentence takes: the start floored to the quarter hour, the
 * end, and the day only when the window starts on a calendar date other than today's.
 */
export function coverageWindowParts(
  window: OutfitCoverage,
  now: number,
  timeZone: string,
  language: SupportedLanguage,
  hour12: boolean,
): Readonly<{ day: string | null; start: string; end: string }> {
  const start = Math.floor(Date.parse(window.start) / quarterHourMs) * quarterHourMs;
  return {
    day: zonedDateKey(start, timeZone) === zonedDateKey(now, timeZone)
      ? null : formatWindowDay(start, language, timeZone),
    start: formatClockTime(start, language, hour12, timeZone),
    end: formatClockTime(window.end, language, hour12, timeZone),
  };
}

function windowSentence(
  parts: ReturnType<typeof coverageWindowParts>,
  sameDay: (start: string, end: string) => string,
  onDay: (day: string, start: string, end: string) => string,
): string {
  return parts.day === null ? sameDay(parts.start, parts.end) : onDay(parts.day, parts.start, parts.end);
}

/** The re-ask sheet's warning for the window a confirmation would choose for. */
export function askAgainWarning(
  window: OutfitCoverage,
  now: number,
  timeZone: string,
  language: SupportedLanguage,
  hour12: boolean,
): string {
  const copy = getMessages(language).today.askAgain;
  return windowSentence(coverageWindowParts(window, now, timeZone, language, hour12),
    copy.warning, copy.warningOnDay);
}

/** A departure clock time as the wheel and the confirm label show it, in the place's zone. */
export function formatDepartureTime(
  instant: string,
  language: SupportedLanguage,
  hour12: boolean,
  timeZone: string,
): string {
  return formatClockTime(instant, language, hour12, timeZone);
}

export function eveningLaterReadyLine(
  departure: DressingDayDeparture | null,
  now: number,
  language: SupportedLanguage,
  hour12: boolean,
): string | null {
  if (!departure || !isEveningDressingDayKey(departure.dayKey)) return null;
  const readyAt = Date.parse(departure.updatedAt);
  if (!Number.isFinite(readyAt) || readyAt > now || !departureIsAhead(departure, now)) return null;
  // Chosen in the evening, its small hours included, and shown until the departure, past midnight too.
  const readyKey = wardrobeDayWindow(departure.updatedAt, departure.timeZone)?.key;
  if (!readyKey || !isEveningDressingDayKey(readyKey) ||
      readyKey !== wardrobeDayWindow(new Date(now).toISOString(), departure.timeZone)?.key) return null;
  return getMessages(language).today.laterReady({
    departure: formatDepartureTime(departure.departureAt, language, hour12, departure.timeZone),
    ready: formatDepartureTime(departure.updatedAt, language, hour12, departure.timeZone),
  });
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

/**
 * What the first-generation runway needs from the weather: the condition its field and
 * particles follow, the daypart that picks the particles' ink, and the day insight its
 * line rotates through.
 */
export function runwayWeather(
  weather: WeatherSnapshot,
  coordinates: NormalizedCoordinates | null,
  language: SupportedLanguage,
  hour12: boolean,
  now: number,
): Readonly<{ condition: string; daypart: Daypart | null; insight: string | null }> {
  const at = new Date(now).toISOString();
  const insight = findDayInsight({ snapshot: weather, now: at });
  return {
    condition: weather.current.condition,
    daypart: resolveDaypart(at, weather.timeZone, coordinates),
    insight: insight === null ? null : dayInsightSentence(
      insight,
      getMessages(language).today.dayInsight,
      (value) => formatClockTime(value, language, hour12, weather.timeZone),
    ),
  };
}

export type GarmentPaletteDay = Pick<GarmentOutfitPalette, 'temperatureC' | 'condition' | 'isNight'>;

/**
 * A saved recommendation keeps the weather and dressing-day half it was chosen for.
 * Older rows without a basis retain the current-weather fallback.
 */
export function garmentPaletteDay(
  weather: WeatherSnapshot,
  now: number,
  basis?: TodaySnapshot['paletteBasis'],
): GarmentPaletteDay {
  return {
    temperatureC: basis?.temperatureC ?? weather.current.temperatureCelsius,
    condition: basis?.condition ?? weather.current.condition,
    isNight: isEveningDressingDayKey(basis?.localDayKey ?? localDayKey(new Date(now))),
  };
}

// A weather update rebuilds Today's presentation while the saved outfits stay the same objects.
// Handing a board the arrays it already drew lets it skip composing and painting again, so
// each outfit keeps its pieces, and its palette for as long as the palette day is unchanged.
const boardPiecesByOutfit = new WeakMap<OutfitCandidate, LoadedOutfitPresentation['boardPieces']>();
const palettesByOutfit = new WeakMap<RecommendedOutfit, GarmentOutfitPalette>();

/**
 * One outfit's palette inputs, accessories included, so a single resolution colours its
 * board and its finishing-touch badges together. Colour is render-only: nothing here is
 * stored or reaches a recommendation.
 */
/** The reader's chosen colours drawn as recorded swatches; colour only paints, it never selects. */
function withPieceColors(palette: GarmentOutfitPalette, colors: ManualDetail['pieceColors']): GarmentOutfitPalette {
  if (!colors || Object.keys(colors).length === 0) return palette;
  return {
    ...palette,
    pieces: palette.pieces.map((piece) => {
      const recordedSwatchId = colors[piece.slot];
      return recordedSwatchId === undefined ? piece : { ...piece, recordedSwatchId };
    }),
  };
}

export function outfitGarmentPalette(outfit: RecommendedOutfit, day: GarmentPaletteDay): GarmentOutfitPalette {
  const kept = palettesByOutfit.get(outfit);
  if (kept && kept.temperatureC === day.temperatureC && kept.condition === day.condition &&
      kept.isNight === day.isNight) return kept;
  const palette: GarmentOutfitPalette = {
    temperatureC: day.temperatureC,
    condition: day.condition,
    isNight: day.isNight,
    optionId: outfit.optionId,
    formality: outfit.formality,
    pieces: [
      ...outfitBoardPieces(outfit).map(({ slot, garmentTypeId }) => ({ slot, garmentTypeId })),
      ...accessoryOutfitSlots.flatMap((slot) => {
        const accessory = outfit.accessories[slot];
        return accessory ? [{ slot, garmentTypeId: accessory.garment.garmentTypeId }] : [];
      }),
    ],
  };
  palettesByOutfit.set(outfit, palette);
  return palette;
}

/** The pieces a board draws for an outfit, in the board's slot order. */
export function outfitBoardPieces(outfit: OutfitCandidate): LoadedOutfitPresentation['boardPieces'] {
  const kept = boardPiecesByOutfit.get(outfit);
  if (kept) return kept;
  const pieces = assignedOutfitGarments(outfit).map(({ garment, slot }) => ({
    slot, garmentTypeId: garment.garmentTypeId, category: garment.properties.category,
  }));
  boardPiecesByOutfit.set(outfit, pieces);
  return pieces;
}

function localizeOutfit(
  outfit: RecommendedOutfit,
  index: number,
  total: number,
  weatherReasons: readonly string[],
  language: SupportedLanguage,
  dayKind: DayKind,
  paletteDay: GarmentPaletteDay,
  manual: Readonly<{
    original: RecommendedOutfit;
    changedSlots: readonly OutfitSlot[];
    pieceColors?: ManualDetail['pieceColors'];
  }> | null = null,
): LoadedOutfitPresentation {
  const changedSlots = manual?.changedSlots ?? [];
  const messages = getMessages(language);
  const copy = messages.today;
  const assigned = assignedOutfitGarments(outfit);
  const boardPieces = outfitBoardPieces(outfit);
  const pieces = assigned.map(({ garment, slot }) => ({
    slot: copy.slots[slot],
    item:
      messages.catalog[
        `catalog.garment_type.${garment.garmentTypeId}.name`
      ],
    category: garment.properties.category,
    garmentTypeId: garment.garmentTypeId,
    changed: changedSlots.includes(slot),
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
  const archetype = archetypeLabel(messages.recommendation, outfit.archetypeId, dayKind);
  const changed = changedSlots.length > 0;
  const title = changed ? copy.manualMix.title : archetype;
  const summary = pieces.map(({ item }) => item).join(' + ');
  const composedReasons = [
    ...weatherReasons,
    ...outfit.reasonCodes.map((reason) => copy.compositionReasons[reason]),
  ];
  // Detail still needs a reason even when mild weather derives no clothing requirement.
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

  // The outfit's pieces from its outer layer inwards, the order a link keeps the weather's
  // pieces in.
  const outermostFirst = assigned
    .map(({ garment, slot }, assignedIndex) => ({ garment, slot, assignedIndex }))
    .sort((a, b) => outermostSlotOrder.indexOf(a.slot) - outermostSlotOrder.indexOf(b.slot));
  const assignedByKey = new Map(outermostFirst.map((entry) => [entry.garment.candidateKey, entry]));
  const weatherLinks = weatherCauseLinks(
    outfit.requirementEvaluations,
    outermostFirst.map(({ garment }) => garment.candidateKey),
  ).map(({ cause, candidateKeys }) => {
    const linked = candidateKeys.flatMap((key) => {
      const entry = assignedByKey.get(key);
      return entry ? [{
        slot: entry.slot,
        garmentTypeId: entry.garment.garmentTypeId,
        category: entry.garment.properties.category,
        item: pieces[entry.assignedIndex].item,
      }] : [];
    });
    return {
      cause,
      label: copy.whyOutfit.causes[cause],
      pieces: linked,
      text: copy.whyOutfit.link[cause](linked.map(({ item }) => item)),
    } satisfies LocalizedWeatherLink;
  }).filter(({ pieces: linked }) => linked.length > 0);

  return {
    id: outfit.optionId,
    positionLabel: copy.optionPosition(index + 1, total),
    title,
    changedFrom: changed ? copy.manualMix.changedFrom(archetype) : null,
    summary,
    pieces,
    boardPieces,
    palette: withPieceColors(outfitGarmentPalette(outfit, paletteDay), manual?.pieceColors),
    keptColors: manual && changed ? {
      original: withPieceColors(outfitGarmentPalette(manual.original, paletteDay), manual.pieceColors),
      slots: outfitGarmentPalette(outfit, paletteDay).pieces
        .map(({ slot }) => slot).filter((slot) => !changedSlots.includes(slot)),
    } : null,
    boardAccessibilityLabel: copy.boardAccessibilityLabel({ archetype: title, pieces: pieces.map(({ item }) => item) }),
    accessories,
    accessoriesAccessibilityLabel: accessories.length > 0
      ? copy.finishingTouchesAccessibilityLabel(accessories.map(({ item }) => item))
      : '',
    reasons,
    requirementRows,
    weatherLinks,
    accessibilityLabel: copy.outfitAccessibilityLabel({
      position: index + 1,
      total,
      archetype: title,
      pieces,
      reasons,
    }),
  };
}

// From the outer layer inwards: the layers weather adds come before the base it covers.
const outermostSlotOrder: readonly OutfitSlot[] = [
  'outer_layer', 'mid_layer', 'footwear', 'one_piece', 'primary_top', 'bottom',
];

function requirementNameKey(
  evaluation: OutfitRequirementEvaluation,
): TodayRequirementName {
  const requirement = evaluation.requirement;
  if (requirement.kind !== 'water_protection') return requirement.kind;
  return requirement.target === 'body'
    ? 'body_water_protection'
    : 'footwear_water_protection';
}

// Detail leads with mandatory requirements, then keeps the derivation's own order.
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

export type TomorrowPreviewPresentation = Readonly<{
  /** The previewed outfit's option id, which its detail opens on. */
  id: string;
  heading: string;
  weather: string;
  title: string;
  boardPieces: LoadedOutfitPresentation['boardPieces'];
  palette: GarmentOutfitPalette;
  accessibilityLabel: string;
  accessibilityHint: string;
}>;

// A forecast day colours its outfit by its own high and condition, in daylight, on the strip
// and on its detail alike.
function forecastDayPalette(day: DailyWeather): GarmentPaletteDay {
  return { temperatureC: day.maximumTemperatureCelsius, condition: day.condition, isNight: false };
}

/**
 * The evening's look at the next dressing day: the first outfit chosen for it, coloured by
 * that day's own weather, and its forecast in one short line. Null without a forecast row.
 */
export function createTomorrowPreviewPresentation(
  preview: RecommendationSnapshot,
  weather: WeatherSnapshot,
  language: SupportedLanguage,
  temperatureUnit: TemperatureUnit,
  now: number,
): TomorrowPreviewPresentation | null {
  const outfit = preview.recommendation.outfits[0];
  const day = tomorrowForecastDay(preview, weather);
  if (!outfit || !day) return null;
  const messages = getMessages(language);
  const copy = messages.today;
  const thisMorning = previewIsThisMorning(now, weather.timeZone, day.dateKey);
  const condition = messages.weather.conditions[day.condition];
  const title = archetypeLabel(messages.recommendation, outfit.archetypeId, dateKeyDayKind(day.dateKey));
  const boardPieces = outfitBoardPieces(outfit);
  const outfitLabel = copy.boardAccessibilityLabel({
    archetype: title,
    pieces: boardPieces.map(({ garmentTypeId }) =>
      messages.catalog[`catalog.garment_type.${garmentTypeId}.name`]),
  });
  return {
    id: outfit.optionId,
    heading: thisMorning ? copy.tomorrow.morningHeading : copy.tomorrow.heading,
    weather: copy.tomorrow.weather({
      condition,
      minimum: formatTemperature(day.minimumTemperatureCelsius, language, temperatureUnit),
      maximum: formatTemperature(day.maximumTemperatureCelsius, language, temperatureUnit),
    }),
    title,
    boardPieces,
    palette: outfitGarmentPalette(outfit, forecastDayPalette(day)),
    accessibilityLabel: (thisMorning
      ? copy.tomorrow.morningStripAccessibilityLabel
      : copy.tomorrow.stripAccessibilityLabel)({
      outfit: outfitLabel,
      weather: copy.tomorrow.weatherAccessibilityLabel({
        condition,
        minimum: formatTemperatureValue(day.minimumTemperatureCelsius, language, temperatureUnit),
        maximum: formatTemperatureValue(day.maximumTemperatureCelsius, language, temperatureUnit),
        unitName: messages.temperatureUnitNames[temperatureUnit],
      }),
    }),
    accessibilityHint: thisMorning ? copy.tomorrow.morningStripAccessibilityHint
      : copy.tomorrow.stripAccessibilityHint,
  };
}

/**
 * A dressing-day key's calendar date as Today's top row shows it, in the language's own order
 * ("Tue 6 Oct", "6 Eki Sal"). The calendar date is read in UTC, never as an instant in a place.
 */
export function formatDressingDate(dayKey: string, language: SupportedLanguage): string {
  return dateTimeFormat(localeTag(language), {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(calendarDateUtcMidnight(dressingDayDateKey(dayKey)));
}

function createLoadedPresentation(
  snapshot: TodaySnapshot,
  language: SupportedLanguage,
  hour12: boolean,
  temperatureUnit: TemperatureUnit,
  isRefreshing: boolean,
  refreshFailed: boolean,
  now: number,
  phase: RecommendationPhase | null,
  choosingWindow: OutfitCoverage | null,
  manual: ManualDetail | null,
  day: DailyWeather | null,
): LoadedTodayPresentation {
  const messages = getMessages(language);
  const copy = messages.today;
  const weatherCopy = messages.weather;
  const weather = snapshot.weather;
  const current = weather.current;
  // Detail of tomorrow's preview reads that day's forecast row (`day`); tonight's hours, drift
  // and insight say nothing about it.
  const rainProbability = day ? day.precipitationProbability : todayRainOutlookProbability(weather, now);
  const time = formatLastUpdated(weather.fetchedAt, language, hour12, now);
  const insight = day ? null : findDayInsight({ snapshot: weather, now: new Date(now).toISOString() });
  const deterministicDayInsight = insight === null ? null : dayInsightSentence(
    insight,
    copy.dayInsight,
    (value) => formatClockTime(value, language, hour12, weather.timeZone),
  );
  const acceptedInsight = snapshot.recommendation.status === 'recommended'
    && snapshot.recommendation.insightLocale === language
    ? snapshot.recommendation.insightSentence
    : null;
  const dayInsight = acceptedInsight ?? deterministicDayInsight;
  const shown = snapshot.coverageStart && snapshot.coverageEnd
    ? forecastBoundedCoverage({ start: snapshot.coverageStart, end: snapshot.coverageEnd }, weather.hourly)
    : null;
  const coverageCaption = shown && snapshot.recommendation.status === 'recommended'
    ? windowSentence(coverageWindowParts(shown, now, weather.timeZone, language, hour12),
      copy.coverage.chosen, copy.coverage.chosenOnDay)
    : null;
  const choosing = choosingWindow
    ? forecastBoundedCoverage(choosingWindow, weather.hourly) ?? choosingWindow : null;
  const choosingCaption = choosing
    ? windowSentence(coverageWindowParts(choosing, now, weather.timeZone, language, hour12),
      copy.coverage.choosing, copy.coverage.choosingOnDay)
    : null;
  const drift = !day && snapshot.coverageEnd && snapshot.recommendation.status === 'recommended' && !choosing
    ? coverageDrift(snapshot.recommendation.requirements, weather.hourly,
      new Date(now).toISOString(), snapshot.coverageEnd)
    : null;
  const driftCaption = drift
    ? copy.drift[drift.kind](formatClockTime(drift.at, language, hour12, weather.timeZone))
    : null;
  // Cold drift already says the rest of the window needs more than a layer.
  const coolSpell = !day && shown && snapshot.recommendation.status === 'recommended' && !choosing &&
    drift?.kind !== 'cold'
    ? laterCoolSpell(snapshot.recommendation.requirements, weather.hourly,
      new Date(now).toISOString(), shown)
    : null;
  const coolSpellCaption = coolSpell
    ? copy.coolSpell(formatClockTime(coolSpell.at, language, hour12, weather.timeZone))
    : null;
  const isStale = snapshot.freshness === 'stale';
  const conditionCode = day?.condition ?? current.condition;
  const condition = weatherCopy.conditions[conditionCode];
  // A stored or AI-chosen result rebuilds its reason codes from the requirements alone, so
  // the day's own spread supplies the wide-range one that no requirement carries.
  const weatherReasons = reasonCodesByPriority({
    ...snapshot.recommendation.requirements,
    reasonCodes: withDailyRangeReason(
      snapshot.recommendation.requirements.reasonCodes,
      day?.minimumTemperatureCelsius ?? weather.minimumTemperatureCelsius,
      day?.maximumTemperatureCelsius ?? weather.maximumTemperatureCelsius,
    ),
  }).map((reason) => copy.requirementReasons[reason]);
  const outfits =
    snapshot.recommendation.status === 'recommended'
      ? snapshot.recommendation.outfits
      : [];
  // The label follows the day the user is reading it on, so a stored weekend result does not
  // say "Weekend Relaxed" on the Monday after.
  const dayKind = day ? dateKeyDayKind(day.dateKey) : localDayKind(new Date(now));
  const paletteDay = day ? forecastDayPalette(day) : garmentPaletteDay(weather, now, snapshot.paletteBasis);
  const suggestions = outfits.map((outfit, index) =>
    manual && (manual.changedSlots.length > 0 || manual.original) && outfit.optionId === manual.optionId
      // The changed or composed outfit stands in the opened option's place and keeps its id.
      ? { ...localizeOutfit(manual.outfit, index, outfits.length, weatherReasons, language, dayKind, paletteDay,
        { original: manual.original ?? outfit, changedSlots: manual.changedSlots, pieceColors: manual.pieceColors }),
      id: outfit.optionId }
      : localizeOutfit(outfit, index, outfits.length, weatherReasons, language, dayKind, paletteDay),
  );
  const ideas = snapshot.moreIdeas ?? [];
  const moreIdeas = ideas.map((outfit, index) =>
    localizeOutfit(outfit, index, ideas.length, weatherReasons, language, dayKind, paletteDay));
  // ADR 0034 section 4: the on-device badge appears only when the stored mode is
  // `on-device-ai`, so the words never advertise a tier that did not produce this result,
  // and a settled deterministic result carries no badge at all, because the absence of the
  // mark is the signal (ADR 0021 section 8). The phase line during generation is separate
  // and still narrates the deterministic fallback while it runs.
  const generationModeBadges: Record<
    RecommendationGenerationMode,
    LoadedTodayPresentation['generationMode']
  > = {
    'on-device-ai': {
      mode: 'on-device-ai',
      label: copy.generationModeOnDeviceAi,
      accessibilityLabel: copy.generationModeOnDeviceAiAccessibilityLabel,
    },
    'ai-assisted': {
      mode: 'ai-assisted',
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
  // Phase 7: after a change the sentence says the person changed a piece and
  // where kuyara chose the rest, one whole sentence per mode and per count.
  // Every edit counts: a swap, a layer taken off or added, a finishing touch taken off or added.
  const { sourceOne, sourceMany } = copy.manualMix;
  const manualGenerationSources: Record<RecommendationGenerationMode, string> | null =
    !manual || manual.changedSlots.length === 0 ? null
      : manual.changedSlots.length === 1 ? {
        'on-device-ai': sourceOne.onDeviceAi,
        'ai-assisted': sourceOne.aiAssisted,
        'deterministic-fallback': sourceOne.deterministic,
      } : {
        'on-device-ai': sourceMany.onDeviceAi,
        'ai-assisted': sourceMany.aiAssisted,
        'deterministic-fallback': sourceMany.deterministic,
      };
  const generationMode = settledMode ? generationModeBadges[settledMode] : null;
  const generationSource = settledMode
    ? (manualGenerationSources ?? generationSources)[settledMode] : null;
  const primary = suggestions[0];
  // One reading of the place's own sunrise and sunset feeds both the stage tint and the
  // title symbol, so the two can never disagree about whether it is day or night there.
  const daypart = day ? 'day' : resolveDaypart(
    new Date(now).toISOString(),
    weather.timeZone,
    snapshot.activeLocation.coordinates,
  );
  const dayRange = day ? copy.tomorrow.range({
    minimum: formatTemperature(day.minimumTemperatureCelsius, language, temperatureUnit),
    maximum: formatTemperature(day.maximumTemperatureCelsius, language, temperatureUnit),
  }) : null;

  // One localized template per language: the values are substituted, never the words.
  const titleLine = copy.titleTemplate
    .replace('{temperature}', dayRange ?? formatTemperature(current.temperatureCelsius, language, temperatureUnit))
    .replace('{condition}', condition);
  const [beforeSymbol, afterSymbol] = titleLine.split(' {symbol} ');
  const leadEnd = copy.titleTemplate.indexOf('{temperature}');
  const dressingDayKey = day?.dateKey ?? localDayKey(new Date(now));

  return {
    kind: 'loaded',
    title: `${beforeSymbol} ${afterSymbol}`,
    titleAccessibilityLabel: copy.titleAccessibilityLabel({
      temperature: formatTemperatureValue(current.temperatureCelsius, language, temperatureUnit),
      unitName: messages.temperatureUnitNames[temperatureUnit],
      condition,
    }),
    titleParts: {
      lead: beforeSymbol.slice(0, leadEnd).trim(),
      beforeSymbol: beforeSymbol.slice(leadEnd),
      afterSymbol,
    },
    // M15: the dressing day's date, so between midnight and 04:00 it still names the
    // evening's calendar date.
    date: formatDressingDate(dressingDayKey, language),
    dateKey: dressingDayDateKey(dressingDayKey),
    atmosphere: resolveAtmosphereState(conditionCode, daypart),
    copy: {
      piecesHeading: copy.piecesHeading,
      finishingTouchesHeading: copy.finishingTouchesHeading,
      otherOptionsHeading: copy.otherOptionsHeading,
      moreIdeasHeading: copy.moreIdeas.heading,
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
      temperature: dayRange ?? formatTemperature(current.temperatureCelsius, language, temperatureUnit),
      apparentTemperature: copy.apparentTemperature(
        formatTemperature(current.apparentTemperatureCelsius, language, temperatureUnit),
      ),
      range: copy.temperatureRange(
        formatTemperature(weather.minimumTemperatureCelsius, language, temperatureUnit),
        formatTemperature(weather.maximumTemperatureCelsius, language, temperatureUnit),
      ),
      rainProbability: copy.rainProbability(
        formatPercent(rainProbability, language),
      ),
      accessibilityLabel: copy.weatherAccessibilityLabel({
        condition,
        unitName: messages.temperatureUnitNames[temperatureUnit],
        current: formatTemperatureValue(current.temperatureCelsius, language, temperatureUnit),
        apparent: formatTemperatureValue(current.apparentTemperatureCelsius, language, temperatureUnit),
        minimum: formatTemperatureValue(weather.minimumTemperatureCelsius, language, temperatureUnit),
        maximum: formatTemperatureValue(weather.maximumTemperatureCelsius, language, temperatureUnit),
        rainProbability: Math.round(rainProbability * 100),
      }),
      recapAccessibilityLabel: day ? copy.tomorrow.recapAccessibilityLabel({
        condition,
        minimum: formatTemperatureValue(day.minimumTemperatureCelsius, language, temperatureUnit),
        maximum: formatTemperatureValue(day.maximumTemperatureCelsius, language, temperatureUnit),
        unitName: messages.temperatureUnitNames[temperatureUnit],
        rainProbability: Math.round(rainProbability * 100),
        coverageCaption,
      }) : copy.weatherRecapAccessibilityLabel({
        temperature: formatTemperatureValue(current.temperatureCelsius, language, temperatureUnit),
        unitName: messages.temperatureUnitNames[temperatureUnit],
        condition,
        rainProbability: Math.round(rainProbability * 100),
        coverageCaption,
      }),
      conditionCode,
      daypart,
    },
    generationMode,
    generationSource,
    coverageCaption,
    choosingCaption,
    driftCaption,
    coolSpellCaption,
    dayInsight,
    stageAccessibilityLabel: primary ? copy.stageAccessibilityLabel({
      unitName: messages.temperatureUnitNames[temperatureUnit],
      temperature: formatTemperatureValue(current.temperatureCelsius, language, temperatureUnit),
      condition,
      pieces: primary.pieces.map(({ item }) => item),
      archetype: primary.title,
    }) : '',
    suggestions,
    moreIdeas,
    moreIdeasCaption: ideas.length === 0 ? null
      : (settledMode === 'deterministic-fallback' ? copy.moreIdeas.captionDeterministic
        : copy.moreIdeas.caption)(ideas.length),
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
  temperatureUnit: TemperatureUnit,
  now: number,
  /** Detail only: the open option as the person changed it (Phase 7). */
  manual: ManualDetail | null = null,
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
    temperatureUnit,
    state.isRefreshing,
    state.refreshFailed,
    now,
    state.phase ?? null,
    state.choosingWindow ?? null,
    manual,
    state.forecastDay ?? null,
  );
}
