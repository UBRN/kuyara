import {
  outfitSlots,
  type AssignedOutfitGarment,
  type OutfitCandidate,
} from '@/features/recommendation/domain/outfit-composition';
import type {
  TodayScreenState,
  TodaySnapshot,
} from '@/features/today/model';
import {
  getMessages,
  type SupportedLanguage,
} from '@/localization/messages';

type LocalizedOutfitPiece = Readonly<{
  slot: string;
  item: string;
}>;

export type LocalizedHourlyRainProbability = Readonly<{
  label: string;
  probabilityPercent: number;
  accessibilityLabel: string;
}>;

export type LoadedOutfitPresentation = Readonly<{
  id: string;
  positionLabel: string;
  title: string;
  emphasis?: string;
  pieces: readonly LocalizedOutfitPiece[];
  reasons: readonly string[];
  accessibilityLabel: string;
}>;

export type LoadedTodayPresentation = Readonly<{
  kind: 'loaded';
  copy: Readonly<{
    title: string;
    headerAccessibilityLabel: (values: { title: string; location: string }) => string;
    settingsAction: string;
    settingsHint: string;
    refreshAction: string;
    piecesHeading: string;
    reasonsHeading: string;
    recommendedTodayHeading: string;
    otherOptionsHeading: string;
    windLabel: string;
    humidityLabel: string;
    uvIndexLabel: string;
    rainOutlookHeading: string;
  }>;
  header: Readonly<{
    location: string;
    date: string;
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
    wind: string;
    humidity: string;
    uvIndex: string;
    hourlyRainProbability: readonly LocalizedHourlyRainProbability[];
    metricsAccessibilityLabel: string;
    rainTimelineAccessibilityLabel: string;
    accessibilityLabel: string;
  }>;
  generationMode: Readonly<{
    label: string;
    tone: 'accent-filled' | 'bordered';
    accessibilityLabel: string;
  }> | null;
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

function formatDecimal(value: number, language: SupportedLanguage): string {
  return new Intl.NumberFormat(localeTag(language), {
    maximumFractionDigits: 1,
  }).format(value);
}

function formatTemperature(value: number, language: SupportedLanguage): string {
  return `${formatNumber(value, language)}°`;
}

function formatDate(
  value: string,
  timeZone: string,
  language: SupportedLanguage,
): string {
  return new Intl.DateTimeFormat(localeTag(language), {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone,
  }).format(new Date(value));
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
  outfit: OutfitCandidate,
  index: number,
  total: number,
  weatherReasons: readonly string[],
  language: SupportedLanguage,
): LoadedOutfitPresentation {
  const messages = getMessages(language);
  const copy = messages.today;
  const pieces = assignedGarments(outfit).map(({ garment, slot }) => ({
    slot: copy.slots[slot],
    item:
      messages.catalog[
        `catalog.garment_type.${garment.garmentTypeId}.name`
      ],
  }));
  const title = pieces.map(({ item }) => item).join(' + ');
  const reasons = [
    ...weatherReasons,
    ...outfit.reasonCodes.map((reason) => copy.compositionReasons[reason]),
  ];

  return {
    id: `outfit-${index + 1}`,
    positionLabel: copy.optionPosition(index + 1, total),
    title,
    emphasis: index === 0 ? copy.emphasis.recommended : undefined,
    pieces,
    reasons,
    accessibilityLabel: copy.outfitAccessibilityLabel({
      position: index + 1,
      total,
      pieces,
      reasons,
    }),
  };
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
  const wind = weatherCopy.windValue(
    formatDecimal(current.windSpeedMetersPerSecond, language),
  );
  const humidity = copy.humidityValue(current.humidity);
  const uvIndex = copy.uvIndexValue(formatDecimal(current.uvIndex, language));
  const condition = weatherCopy.conditions[current.condition];
  const hourlyRainProbability = weather.hourly
    .filter(
      ({ forecastAt }) =>
        Date.parse(forecastAt) >= Date.parse(current.observedAt),
    )
    .slice(0, 6)
    .map((hour) => {
      const probabilityPercent = Math.round(
        hour.precipitationProbability * 100,
      );
      const label = formatTime(hour.forecastAt, weather.timeZone, language);
      return {
        label,
        probabilityPercent,
        accessibilityLabel: copy.hourlyRainAccessibilityLabel({
          time: label,
          probabilityPercent,
        }),
      };
    });
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
  const generationMode = snapshot.recommendation.status === 'recommended'
    ? snapshot.recommendation.generationMode === 'ai-assisted'
      ? {
          label: copy.generationModeAiAssisted,
          tone: 'accent-filled' as const,
          accessibilityLabel: copy.generationModeAccessibilityLabel(
            copy.generationModeAiAssisted,
          ),
        }
      : {
          label: copy.generationModeStandard,
          tone: 'bordered' as const,
          accessibilityLabel: copy.generationModeAccessibilityLabel(
            copy.generationModeStandard,
          ),
        }
    : null;

  return {
    kind: 'loaded',
    copy: {
      title: copy.title,
      headerAccessibilityLabel: copy.headerAccessibilityLabel,
      settingsAction: copy.settingsAction,
      settingsHint: copy.settingsHint,
      refreshAction: copy.refreshAction,
      piecesHeading: copy.piecesHeading,
      reasonsHeading: copy.reasonsHeading,
      recommendedTodayHeading: copy.recommendedTodayHeading,
      otherOptionsHeading: copy.otherOptionsHeading,
      windLabel: copy.windLabel,
      humidityLabel: copy.humidityLabel,
      uvIndexLabel: copy.uvIndexLabel,
      rainOutlookHeading: copy.rainOutlookHeading,
    },
    header: {
      location:
        snapshot.activeLocation.source === 'manual'
          ? weatherCopy.locations[snapshot.activeLocation.catalogId]
          : weatherCopy.currentLocation,
      date: formatDate(current.observedAt, weather.timeZone, language),
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
      wind,
      humidity,
      uvIndex,
      hourlyRainProbability,
      metricsAccessibilityLabel: copy.metricsAccessibilityLabel({
        windSpeed: formatDecimal(current.windSpeedMetersPerSecond, language),
        humidityPercent: formatNumber(current.humidity * 100, language),
        uvIndex: formatDecimal(current.uvIndex, language),
      }),
      rainTimelineAccessibilityLabel: [
        copy.rainOutlookHeading,
        ...hourlyRainProbability.map((hour) => hour.accessibilityLabel),
      ].join('. '),
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
    return {
      kind: 'unavailable',
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
