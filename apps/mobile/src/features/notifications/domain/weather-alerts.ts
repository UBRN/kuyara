import { weatherLocalDateKey } from '@kuyara/contracts';

import type {
  HourlyWeather,
  WeatherMeasurements,
  WeatherSnapshot,
} from '@/features/weather/domain/weather';

export const weatherAlertLeadTimeMinutes = 60;
/**
 * Decided 2026-09-12 and recorded as an amendment to ADR 0032: on the background path the
 * app is not open, so a crossing closer than the foreground lead is still worth announcing
 * with a shortened lead. Quiet hours still apply.
 */
export const weatherAlertBackgroundLeadTimeMinutes = 15;
export const weatherAlertMinimumLeadAfterQuietHoursMinutes = 30;
export const precipitationLikelyThreshold = 0.6;
export const temperatureSwingCelsius = 8;

export type WeatherAlertRuleId = 'precipitation_onset' | 'temperature_swing';
export type LocalClockTime = Readonly<{ hour: number; minute: number }>;
export type QuietHours = Readonly<{
  start: LocalClockTime;
  end: LocalClockTime;
  timeZone: string;
}>;

export const defaultQuietHours: Omit<QuietHours, 'timeZone'> = Object.freeze({
  start: Object.freeze({ hour: 22, minute: 0 }),
  end: Object.freeze({ hour: 7, minute: 0 }),
});

export type WeatherAlertPlan = Readonly<{
  id: string;
  ruleId: WeatherAlertRuleId;
  locationKey: string;
  localDate: string;
  crossingAt: string;
  fireAt: string;
  detail:
    | Readonly<{ kind: 'precipitation'; form: 'rain' | 'snow' }>
    | Readonly<{
      kind: 'temperature';
      direction: 'drop' | 'rise';
      fromApparentCelsius: number;
      toApparentCelsius: number;
    }>;
}>;

const minuteMilliseconds = 60 * 1000;

function isWet(measurement: WeatherMeasurements): boolean {
  return measurement.precipitationProbability >= precipitationLikelyThreshold
    || ['drizzle', 'rain', 'heavy_rain', 'sleet', 'snow', 'thunderstorm']
      .includes(measurement.condition);
}

function adjustForQuietHours(
  fireAt: number,
  latestFireAt: number,
  quietHours: QuietHours,
): number | null {
  const start = quietHours.start.hour * 60 + quietHours.start.minute;
  const end = quietHours.end.hour * 60 + quietHours.end.minute;
  if (start === end) return fireAt;

  const formatter = new Intl.DateTimeFormat('en', {
    timeZone: quietHours.timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });

  // Only the 30-minute adjustment budget matters. Walking real minute boundaries
  // avoids converting ambiguous or missing local times across clock changes.
  for (
    let candidate = fireAt;
    candidate <= latestFireAt;
    candidate = (Math.floor(candidate / minuteMilliseconds) + 1) * minuteMilliseconds
  ) {
    const parts = formatter.formatToParts(candidate);
    const hour = Number(parts.find(({ type }) => type === 'hour')?.value);
    const minute = Number(parts.find(({ type }) => type === 'minute')?.value);
    const localMinute = hour * 60 + minute;
    const isQuiet = start < end
      ? localMinute >= start && localMinute < end
      : localMinute >= start || localMinute < end;
    if (!isQuiet) return candidate;
  }

  return null;
}

/** Plans today's alerts from an already-validated snapshot with ordered hours. */
export function planWeatherAlerts(input: Readonly<{
  snapshot: WeatherSnapshot;
  now: string;
  quietHours: QuietHours;
  deliveredAlertIds: ReadonlySet<string>;
  leadTimeMinutes?: number;
}>): readonly WeatherAlertPlan[] {
  const { snapshot, quietHours, deliveredAlertIds } = input;
  const leadTimeMinutes = input.leadTimeMinutes ?? weatherAlertLeadTimeMinutes;
  const now = Date.parse(input.now);
  // The day is the one the user is living, not the one the snapshot was observed in: a
  // 23:50 snapshot read at 00:20 belongs to the new day, and the alert id follows it.
  const localDate = weatherLocalDateKey(input.now, snapshot.timeZone);
  if (localDate === null || !Number.isFinite(now)) return [];

  const remainingHours = snapshot.hourly.filter(({ forecastAt }) => (
    Date.parse(forecastAt) > now &&
    weatherLocalDateKey(forecastAt, snapshot.timeZone) === localDate
  ));
  const plans: WeatherAlertPlan[] = [];

  function addPlan(
    ruleId: WeatherAlertRuleId,
    crossing: HourlyWeather,
    detail: WeatherAlertPlan['detail'],
  ): void {
    const id = `${ruleId}:${snapshot.locationKey}:${localDate}`;
    const crossingAt = Date.parse(crossing.forecastAt);
    const originalFireAt = crossingAt - leadTimeMinutes * minuteMilliseconds;
    if (deliveredAlertIds.has(id) || originalFireAt < now) return;

    const fireAt = adjustForQuietHours(
      originalFireAt,
      // A lead shorter than the 30-minute budget leaves no room to move, so the budget
      // never pushes an alert later than the lead already puts it.
      Math.max(
        originalFireAt,
        crossingAt - weatherAlertMinimumLeadAfterQuietHoursMinutes * minuteMilliseconds,
      ),
      quietHours,
    );
    if (fireAt === null) return;

    plans.push(Object.freeze({
      id,
      ruleId,
      locationKey: snapshot.locationKey,
      localDate: localDate!,
      crossingAt: new Date(crossingAt).toISOString(),
      fireAt: new Date(fireAt).toISOString(),
      detail: Object.freeze(detail),
    }));
  }

  const precipitationCrossing = remainingHours.find(isWet);
  if (!isWet(snapshot.current) && precipitationCrossing) {
    addPlan('precipitation_onset', precipitationCrossing, {
      kind: 'precipitation',
      form: ['sleet', 'snow'].includes(precipitationCrossing.condition) ? 'snow' : 'rain',
    });
  }

  const fromApparentCelsius = snapshot.current.apparentTemperatureCelsius;
  const temperatureCrossing = remainingHours.find(({ apparentTemperatureCelsius }) =>
    Math.abs(apparentTemperatureCelsius - fromApparentCelsius) >= temperatureSwingCelsius,
  );
  if (temperatureCrossing) {
    const toApparentCelsius = temperatureCrossing.apparentTemperatureCelsius;
    addPlan('temperature_swing', temperatureCrossing, {
      kind: 'temperature',
      direction: toApparentCelsius < fromApparentCelsius ? 'drop' : 'rise',
      fromApparentCelsius,
      toApparentCelsius,
    });
  }

  return Object.freeze(plans.sort((left, right) => Date.parse(left.fireAt) - Date.parse(right.fireAt)));
}
