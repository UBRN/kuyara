import { weatherLocalDateKey } from '@kuyara/contracts';

import type { WeatherSnapshot } from '@/features/weather/domain/weather';
import {
  isWetCondition,
  isWetMeasurement,
  temperatureSwingCelsius,
} from '@/features/weather/domain/weather-thresholds';

/**
 * ADR 0021 section 9: Weather leads with what the conditions mean before the raw
 * measurements. The meaning is one transition, the single change left in today that would
 * alter a clothing decision, at the same boundaries the alert rules fire on.
 *
 * The projection is pure and structural: a closed `kind` and numbers, no copy, no key, no
 * language and no clock of its own. The words are chosen at the presentation boundary.
 */

export type WeatherOutlook =
  | Readonly<{ kind: 'precipitation_onset'; form: 'rain' | 'snow'; atHour: string }>
  | Readonly<{ kind: 'precipitation_easing'; form: 'rain' | 'snow'; atHour: string }>
  | Readonly<{
    kind: 'temperature_change';
    direction: 'drop' | 'rise';
    atHour: string;
    fromApparentCelsius: number;
    toApparentCelsius: number;
  }>
  | Readonly<{ kind: 'steady' }>;

/**
 * Two hours of the local day left is the least that makes "no notable change" worth saying;
 * half an hour before midnight the sentence is true and worthless, so no line is drawn.
 */
const steadyMinimumRemainingHours = 2;

/** Finds today's one decision-changing transition in an already-validated snapshot. */
export function findWeatherOutlook(input: Readonly<{
  snapshot: WeatherSnapshot;
  now: string;
}>): WeatherOutlook | null {
  const { snapshot } = input;
  const now = Date.parse(input.now);
  const localDate = weatherLocalDateKey(input.now, snapshot.timeZone);
  if (localDate === null || !Number.isFinite(now)) return null;

  // The alert planner's window exactly: the hours of the day the person is living that have
  // not happened yet. The rail shows the next 36 hours; this line is about today's decision.
  const remainingHours = snapshot.hourly.filter(({ forecastAt }) => (
    Date.parse(forecastAt) > now
    && weatherLocalDateKey(forecastAt, snapshot.timeZone) === localDate
  ));

  const isWetNow = isWetMeasurement(snapshot.current);
  // Easing claims precipitation is falling right now and will stop, and only the condition
  // code can establish the present tense. A likely-enough probability over a dry condition is
  // a forecast, which is the onset sentence's job; a day that is merely likely to be wet has
  // no precipitation transition to name, so the temperature or steady line takes the slot.
  const precipitationCrossing = isWetNow && !isWetCondition(snapshot.current.condition)
    ? undefined
    : remainingHours.find((hour) => isWetMeasurement(hour) !== isWetNow);

  const fromApparentCelsius = snapshot.current.apparentTemperatureCelsius;
  const temperatureCrossing = remainingHours.find(({ apparentTemperatureCelsius }) =>
    Math.abs(apparentTemperatureCelsius - fromApparentCelsius) >= temperatureSwingCelsius,
  );

  // The earliest transition wins. A tie goes to precipitation, which changes what is worn
  // rather than how much of it.
  if (precipitationCrossing && (
    !temperatureCrossing
    || Date.parse(precipitationCrossing.forecastAt) <= Date.parse(temperatureCrossing.forecastAt)
  )) {
    return {
      kind: isWetNow ? 'precipitation_easing' : 'precipitation_onset',
      // Onset names the weather arriving, easing the weather leaving.
      form: ['sleet', 'snow'].includes(
        isWetNow ? snapshot.current.condition : precipitationCrossing.condition,
      ) ? 'snow' : 'rain',
      atHour: precipitationCrossing.forecastAt,
    };
  }

  if (temperatureCrossing) {
    const toApparentCelsius = temperatureCrossing.apparentTemperatureCelsius;
    return {
      kind: 'temperature_change',
      direction: toApparentCelsius < fromApparentCelsius ? 'drop' : 'rise',
      atHour: temperatureCrossing.forecastAt,
      fromApparentCelsius,
      toApparentCelsius,
    };
  }

  return remainingHours.length >= steadyMinimumRemainingHours ? { kind: 'steady' } : null;
}
