import type {
  OutfitSuggestion,
  TodayScreenState,
  TodaySnapshot,
} from '@/features/today/model';
import { getMessages, type SupportedLanguage } from '@/localization/messages';

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
  description: string;
  emphasis?: string;
  pieces: readonly LocalizedOutfitPiece[];
  reasons: readonly string[];
  accessibilityLabel: string;
}>;

export type LoadedTodayPresentation = Readonly<{
  kind: 'loaded';
  copy: Readonly<{
    title: string;
    settingsAction: string;
    settingsHint: string;
    piecesHeading: string;
    reasonsHeading: string;
    recommendedTodayHeading: string;
    otherOptionsHeading: string;
    windLabel: string;
    humidityLabel: string;
    uvIndexLabel: string;
    sunriseLabel: string;
    sunsetLabel: string;
    rainOutlookHeading: string;
  }>;
  header: Readonly<{
    location: string;
    date: string;
    freshness: string;
    isStale: boolean;
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
    sunrise: string;
    sunset: string;
    hourlyRainProbability: readonly LocalizedHourlyRainProbability[];
    rainOutlookTakeaway: string;
    metricsAccessibilityLabel: string;
    rainTimelineAccessibilityLabel: string;
    accessibilityLabel: string;
  }>;
  suggestions: readonly LoadedOutfitPresentation[];
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
  return new Intl.NumberFormat(localeTag(language), { maximumFractionDigits: 0 }).format(value);
}

function formatTemperature(value: number, language: SupportedLanguage): string {
  return `${formatNumber(value, language)}°`;
}

function formatDate(snapshot: TodaySnapshot, language: SupportedLanguage): string {
  return new Intl.DateTimeFormat(localeTag(language), {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: snapshot.timeZone,
  }).format(new Date(snapshot.retrievedAt));
}

function formatTime(snapshot: TodaySnapshot, language: SupportedLanguage): string {
  return new Intl.DateTimeFormat(localeTag(language), {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: snapshot.timeZone,
  }).format(new Date(snapshot.retrievedAt));
}

function localizeOutfit(
  suggestion: OutfitSuggestion,
  index: number,
  total: number,
  language: SupportedLanguage,
): LoadedOutfitPresentation {
  const copy = getMessages(language).today;
  const outfitCopy = copy.outfits[suggestion.intent];
  const pieces = suggestion.pieces.map(({ item, slot }) => ({
    slot: copy.slots[slot],
    item: copy.items[item],
  }));
  const reasons = suggestion.reasons.map((reason) => copy.reasons[reason]);

  return {
    id: suggestion.id,
    positionLabel: copy.optionPosition(index + 1, total),
    title: outfitCopy.title,
    description: outfitCopy.description,
    emphasis: suggestion.emphasis ? copy.emphasis[suggestion.emphasis] : undefined,
    pieces,
    reasons,
    accessibilityLabel: copy.outfitAccessibilityLabel({
      position: index + 1,
      total,
      title: outfitCopy.title,
      description: outfitCopy.description,
      pieces: pieces.map(({ item, slot }) => `${slot}: ${item}`).join(', '),
      reasons: reasons.join(' '),
    }),
  };
}

function createLoadedPresentation(
  snapshot: TodaySnapshot,
  language: SupportedLanguage,
): LoadedTodayPresentation {
  const copy = getMessages(language).today;
  const time = formatTime(snapshot, language);
  const weather = snapshot.weather;
  const isStale = snapshot.freshness === 'stale';
  const wind = copy.windValue(weather.windSpeedKmh, weather.windDirection);
  const humidity = copy.humidityValue(weather.humidityPercent);
  const uvIndex = copy.uvIndexValue(weather.uvIndex);
  const hourlyRainProbability = weather.hourlyRainProbability.map((hour) => ({
    ...hour,
    accessibilityLabel: `${hour.label}. ${copy.rainProbability(
      copy.humidityValue(hour.probabilityPercent),
    )}`,
  }));

  return {
    kind: 'loaded',
    copy: {
      title: copy.title,
      settingsAction: copy.settingsAction,
      settingsHint: copy.settingsHint,
      piecesHeading: copy.piecesHeading,
      reasonsHeading: copy.reasonsHeading,
      recommendedTodayHeading: copy.recommendedTodayHeading,
      otherOptionsHeading: copy.otherOptionsHeading,
      windLabel: copy.windLabel,
      humidityLabel: copy.humidityLabel,
      uvIndexLabel: copy.uvIndexLabel,
      sunriseLabel: copy.sunriseLabel,
      sunsetLabel: copy.sunsetLabel,
      rainOutlookHeading: copy.rainOutlookHeading,
    },
    header: {
      location: copy.locations[snapshot.location],
      date: formatDate(snapshot, language),
      freshness: isStale ? copy.staleAt(time) : copy.updatedAt(time),
      isStale,
    },
    weather: {
      condition: copy.conditions[weather.condition],
      temperature: formatTemperature(weather.temperatureCelsius, language),
      apparentTemperature: copy.apparentTemperature(
        formatTemperature(weather.apparentTemperatureCelsius, language),
      ),
      range: copy.temperatureRange(
        formatTemperature(weather.minimumTemperatureCelsius, language),
        formatTemperature(weather.maximumTemperatureCelsius, language),
      ),
      rainProbability: copy.rainProbability(
        `${formatNumber(weather.precipitationProbabilityPercent, language)}%`,
      ),
      wind,
      humidity,
      uvIndex,
      sunrise: weather.sunriseTime,
      sunset: weather.sunsetTime,
      hourlyRainProbability,
      rainOutlookTakeaway: copy.rainOutlookTakeaway,
      metricsAccessibilityLabel: [
        `${copy.windLabel}: ${wind}`,
        `${copy.humidityLabel}: ${humidity}`,
        `${copy.uvIndexLabel}: ${uvIndex}`,
        `${copy.sunriseLabel}: ${weather.sunriseTime}`,
        `${copy.sunsetLabel}: ${weather.sunsetTime}`,
      ].join('. '),
      rainTimelineAccessibilityLabel: [
        copy.rainOutlookHeading,
        ...hourlyRainProbability.map((hour) => hour.accessibilityLabel),
        copy.rainOutlookTakeaway,
      ].join('. '),
      accessibilityLabel: copy.weatherAccessibilityLabel({
        condition: copy.conditions[weather.condition],
        current: weather.temperatureCelsius,
        apparent: weather.apparentTemperatureCelsius,
        minimum: weather.minimumTemperatureCelsius,
        maximum: weather.maximumTemperatureCelsius,
        rainProbability: weather.precipitationProbabilityPercent,
      }),
    },
    suggestions: snapshot.suggestions.map((suggestion, index) =>
      localizeOutfit(suggestion, index, snapshot.suggestions.length, language),
    ),
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

  return createLoadedPresentation(state.snapshot, language);
}
