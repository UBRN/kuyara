import type {
  HourlyWeather,
  WeatherConditionCode,
  WeatherSnapshot,
} from '@/features/weather/domain/weather';
import {
  wardrobeDayWindow,
  type WardrobeDayPeriod,
} from '@/features/weather/domain/wardrobe-day';
import {
  chillyCelsius,
  freezingCelsius,
  hotCelsius,
  isWetMeasurement,
  veryHotCelsius,
  veryWindyMetersPerSecond,
  windyMetersPerSecond,
} from '@/features/weather/domain/weather-thresholds';

/**
 * One sentence about the day the person is walking into, for Today to say under the outfit
 * rationale: what the weather does between now and the end of the dressing day, rather than
 * what it is doing at this moment.
 *
 * It is a second rule set beside `weather-outlook.ts`, not an edit of it. That line answers
 * "what changes next", one transition with an hour on it; this one answers "what kind of day
 * is this", and the two never restate each other's thresholds. Both are pure projections: a
 * closed `kind` and numbers, no copy, no key, no language and no clock of their own, with the
 * words chosen at the presentation boundary.
 *
 * The thresholds are all imported. Not one weather boundary is written as a number here.
 */

export type DayInsightPrecipitationForm = 'rain' | 'snow';
export type DayInsightHeatLevel = 'hot' | 'very_hot';
export type DayInsightColdLevel = 'chilly' | 'freezing';

/**
 * The day's temperature extreme when it rides on top of another insight. It is what makes
 * "sunny all day but very hot" one sentence rather than two: the carrier selects a different
 * whole key, and a modifier never becomes a clause glued onto a translated sentence.
 */
export type DayInsightModifier =
  | Readonly<{ kind: 'heat'; level: DayInsightHeatLevel }>
  | Readonly<{ kind: 'cold'; level: DayInsightColdLevel }>;

/**
 * The period is carried for the same reason `WeatherOutlook`'s steady state carries it: only
 * the shapes whose sentence names the day need to know whether that day is a day or a night,
 * and carrying it here spares the screen a second reading of the clock.
 */
export type DayInsight =
  | Readonly<{
    kind: 'wet_all_day';
    form: DayInsightPrecipitationForm;
    period: WardrobeDayPeriod;
  }>
  | Readonly<{
    kind: 'wet_window';
    form: DayInsightPrecipitationForm;
    /** Null when it is already falling, so the sentence names no beginning. */
    fromHour: string | null;
    /** Null when the run reaches the end of the window, so the sentence names no end. */
    untilHour: string | null;
  }>
  | Readonly<{
    kind: 'clear_all_day' | 'cloudy_all_day' | 'foggy_all_day';
    period: WardrobeDayPeriod;
    modifier: DayInsightModifier | null;
  }>
  | DayTemperatureExtreme
  | Readonly<{ kind: 'windy'; level: 'windy' | 'very_windy' }>;

/**
 * The day's apparent-temperature extreme: an insight in its own right on a day with no other
 * shape, and the modifier above once the `atHour` is dropped.
 */
export type DayTemperatureExtreme =
  | Readonly<{ kind: 'heat'; level: DayInsightHeatLevel; atHour: string }>
  | Readonly<{ kind: 'cold'; level: DayInsightColdLevel; atHour: string }>;

/**
 * Two hours left is the least that makes a claim about "the day" worth reading, the same
 * sufficiency the Weather screen's steady line applies to its own window.
 */
const minimumRemainingHours = 2;

/**
 * The series is hourly, so a snapshot that still covers the window ends within an hour of it.
 * One further hour of slack absorbs an odd first entry; beyond that the snapshot does not
 * reach the rest of the day, and describing the day from what it does have would be a guess.
 */
const forecastCoverageToleranceMs = 2 * 60 * 60 * 1000;

/** The same mapping the outlook line uses: sleet reads as snow, everything wet else as rain. */
function precipitationForm(condition: WeatherConditionCode): DayInsightPrecipitationForm {
  return condition === 'sleet' || condition === 'snow' ? 'snow' : 'rain';
}

// The sky families are the ones the stage tint already groups conditions into, split once
// more because fog and cloud say different things about a day even though they tint it the
// same. A falling condition never reaches here: it is wet, so the precipitation family has
// already answered.
const skyFamilies = {
  clear: 'clear',
  mostly_clear: 'clear',
  partly_cloudy: 'veiled',
  cloudy: 'veiled',
  fog: 'fog',
  drizzle: 'falling',
  rain: 'falling',
  heavy_rain: 'falling',
  sleet: 'falling',
  snow: 'falling',
  thunderstorm: 'falling',
} as const satisfies Record<WeatherConditionCode, 'clear' | 'veiled' | 'fog' | 'falling'>;

/**
 * The day's apparent-temperature extreme, when it reaches a boundary worth saying out loud.
 * Cold wins a tie with heat at the same severity, for the reason the requirement rules give
 * when a day demands both: protection before comfort.
 */
function temperatureExtreme(hours: readonly HourlyWeather[]): DayTemperatureExtreme | null {
  let coldest = hours[0];
  let hottest = hours[0];
  for (const hour of hours) {
    if (hour.apparentTemperatureCelsius < coldest.apparentTemperatureCelsius) coldest = hour;
    if (hour.apparentTemperatureCelsius > hottest.apparentTemperatureCelsius) hottest = hour;
  }

  const cold = coldest.apparentTemperatureCelsius < freezingCelsius
    ? 'freezing'
    : coldest.apparentTemperatureCelsius < chillyCelsius ? 'chilly' : null;
  const heat = hottest.apparentTemperatureCelsius >= veryHotCelsius
    ? 'very_hot'
    : hottest.apparentTemperatureCelsius >= hotCelsius ? 'hot' : null;

  if (cold === 'freezing') return { kind: 'cold', level: cold, atHour: coldest.forecastAt };
  if (heat === 'very_hot') return { kind: 'heat', level: heat, atHour: hottest.forecastAt };
  if (cold) return { kind: 'cold', level: cold, atHour: coldest.forecastAt };
  if (heat) return { kind: 'heat', level: heat, atHour: hottest.forecastAt };
  return null;
}

/**
 * The one thing worth saying about the rest of the dressing day, or nothing. The families are
 * ordered and the first that fires wins, so rain is never outranked by wind and exactly one
 * insight is ever returned.
 */
export function findDayInsight(input: Readonly<{
  snapshot: WeatherSnapshot;
  now: string;
}>): DayInsight | null {
  const { snapshot } = input;
  const now = Date.parse(input.now);
  const dayWindow = wardrobeDayWindow(input.now, snapshot.timeZone);
  if (dayWindow === null || !Number.isFinite(now)) return null;

  const windowEnd = Date.parse(dayWindow.end);
  const hours = snapshot.hourly.filter(({ forecastAt }) => {
    const forecast = Date.parse(forecastAt);
    return forecast >= now && forecast < windowEnd;
  });
  if (hours.length < minimumRemainingHours) return null;
  // A snapshot that stops short of the window describes a fraction of the day, and a line
  // that says "all day" over a fraction would be inventing the rest of it.
  const lastHour = Date.parse(hours[hours.length - 1].forecastAt);
  if (windowEnd - lastHour > forecastCoverageToleranceMs) return null;

  const { period } = dayWindow;
  const extreme = temperatureExtreme(hours);
  const modifier: DayInsightModifier | null = extreme === null
    ? null
    : extreme.kind === 'heat'
      ? { kind: 'heat', level: extreme.level }
      : { kind: 'cold', level: extreme.level };

  const wetness = hours.map((hour) => isWetMeasurement(hour));
  const firstWet = wetness.indexOf(true);
  if (firstWet !== -1) {
    // The first run wins: a day with two wet stretches is still a day whose rain the person
    // meets first, and naming the later one would answer a question nobody asked.
    const firstDryAfter = wetness.indexOf(false, firstWet);
    const form = precipitationForm(hours[firstWet].condition);
    if (firstWet === 0 && firstDryAfter === -1) return { kind: 'wet_all_day', form, period };
    return {
      kind: 'wet_window',
      form,
      fromHour: firstWet === 0 ? null : hours[firstWet].forecastAt,
      untilHour: firstDryAfter === -1 ? null : hours[firstDryAfter].forecastAt,
    };
  }

  const skies = hours.map(({ condition }) => skyFamilies[condition]);
  const allDaySky = skies.every((sky) => sky === 'clear')
    ? 'clear_all_day'
    : skies.every((sky) => sky === 'fog')
      ? 'foggy_all_day'
      : skies.every((sky) => sky === 'fog' || sky === 'veiled')
        ? 'cloudy_all_day'
        : null;
  if (allDaySky) return { kind: allDaySky, period, modifier };

  // A sky that changes its mind has no shape to describe, so the temperature speaks for the
  // day instead, and only a day with nothing else to say is described by its wind.
  if (extreme) return extreme;

  const strongestWind = Math.max(
    ...hours.map(({ windSpeedMetersPerSecond }) => windSpeedMetersPerSecond),
  );
  if (strongestWind >= veryWindyMetersPerSecond) return { kind: 'windy', level: 'very_windy' };
  if (strongestWind >= windyMetersPerSecond) return { kind: 'windy', level: 'windy' };

  return null;
}
