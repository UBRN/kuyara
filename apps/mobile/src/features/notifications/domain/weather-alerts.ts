import { zonedClock } from '@/domain/intl-format';
import type { HourlyWeather, WeatherSnapshot } from '@/features/weather/domain/weather';
import { forecastHoursAhead, wardrobeDayWindow } from '@/features/weather/domain/wardrobe-day';
import {
  isWetMeasurement,
  temperatureSwingCelsius,
} from '@/features/weather/domain/weather-thresholds';

export const weatherAlertLeadTimeMinutes = 60;
/**
 * ADR 0032: on the background path the app is not open, so a crossing closer than the
 * foreground lead is still worth announcing with a shortened lead. Quiet hours still apply.
 */
export const weatherAlertBackgroundLeadTimeMinutes = 15;
export const weatherAlertMinimumLeadAfterQuietHoursMinutes = 30;

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

/** The default quiet hours on the wall clock of `timeZone`. */
export function deviceQuietHours(timeZone: string): QuietHours {
  return { ...defaultQuietHours, timeZone };
}

export type WeatherAlertPlan = Readonly<{
  id: string;
  ruleId: WeatherAlertRuleId;
  locationKey: string;
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

function adjustForQuietHours(
  fireAt: number,
  latestFireAt: number,
  quietHours: QuietHours,
): number | null {
  const start = quietHours.start.hour * 60 + quietHours.start.minute;
  const end = quietHours.end.hour * 60 + quietHours.end.minute;
  if (start === end) return fireAt;

  // Quiet hours are compared as minutes past midnight, read off the zone's wall clock. Only
  // the 30-minute adjustment budget matters. Walking real minute boundaries avoids converting
  // ambiguous or missing local times across clock changes.
  for (
    let candidate = fireAt;
    candidate <= latestFireAt;
    candidate = (Math.floor(candidate / minuteMilliseconds) + 1) * minuteMilliseconds
  ) {
    const { hour, minute } = zonedClock(candidate, quietHours.timeZone);
    const localMinute = hour * 60 + minute;
    const isQuiet = start < end
      ? localMinute >= start && localMinute < end
      : localMinute >= start || localMinute < end;
    if (!isQuiet) return candidate;
  }

  return null;
}

/** Plans the dressing day's alerts from an already-validated snapshot with ordered hours. */
export function planWeatherAlerts(input: Readonly<{
  snapshot: WeatherSnapshot;
  now: string;
  quietHours: QuietHours;
  deliveredAlertIds: ReadonlySet<string>;
  leadTimeMinutes?: number;
}>): readonly WeatherAlertPlan[] {
  const { snapshot, quietHours, deliveredAlertIds } = input;
  const shortenedLeadTimeMinutes = input.leadTimeMinutes ?? weatherAlertLeadTimeMinutes;
  const now = Date.parse(input.now);
  // The day is the one the user is living, not the one the snapshot was observed in: a
  // 23:50 snapshot read at 00:20 belongs to the evening still under way, and the alert id
  // follows it. A 02:00 crossing is now plannable at 19:00, which a calendar day forbade.
  const dayWindow = wardrobeDayWindow(input.now, snapshot.timeZone);
  if (dayWindow === null || !Number.isFinite(now)) return [];

  const windowKey = dayWindow.key;
  const remainingHours = forecastHoursAhead(snapshot.hourly, now, dayWindow);
  const plans: WeatherAlertPlan[] = [];

  function identity(ruleId: WeatherAlertRuleId, crossing: HourlyWeather): string {
    // One alert per rule per location per dressing-day window. A day-period key is the bare
    // local date, byte-identical to every id already in the delivery ledger, so nothing that
    // has fired re-fires after the update; the evening keeps a namespace of its own.
    // The id follows the dressing day the crossing itself falls in: the day window runs to
    // midnight, so a 19:00 crossing planned at 10:00 already wears the evening namespace and
    // the replan after 18:00 finds it in the ledger instead of announcing it a second time.
    const crossingKey = wardrobeDayWindow(crossing.forecastAt, snapshot.timeZone)?.key ?? windowKey;
    return `${ruleId}:${snapshot.locationKey}:${crossingKey}`;
  }

  /** The lead's fire time for a crossing past quiet hours, or null when it has none. */
  function leadFireAt(crossingAt: number): number | null {
    const leadTimeMinutes = crossingAt - now < weatherAlertLeadTimeMinutes * minuteMilliseconds
      ? shortenedLeadTimeMinutes
      : weatherAlertLeadTimeMinutes;
    const originalFireAt = crossingAt - leadTimeMinutes * minuteMilliseconds;
    if (originalFireAt < now) return null;
    return adjustForQuietHours(
      originalFireAt,
      // A lead shorter than the 30-minute budget leaves no room to move, so the budget
      // never pushes an alert later than the lead already puts it.
      Math.max(
        originalFireAt,
        crossingAt - weatherAlertMinimumLeadAfterQuietHoursMinutes * minuteMilliseconds,
      ),
      quietHours,
    );
  }

  function addPlan(
    ruleId: WeatherAlertRuleId,
    crossing: HourlyWeather,
    fireAt: number,
    detail: WeatherAlertPlan['detail'],
  ): void {
    plans.push(Object.freeze({
      id: identity(ruleId, crossing),
      ruleId,
      locationKey: snapshot.locationKey,
      crossingAt: new Date(Date.parse(crossing.forecastAt)).toISOString(),
      fireAt: new Date(fireAt).toISOString(),
      detail: Object.freeze(detail),
    }));
  }

  const precipitationCrossing = remainingHours.find(isWetMeasurement);
  if (!isWetMeasurement(snapshot.current) && precipitationCrossing
    && !deliveredAlertIds.has(identity('precipitation_onset', precipitationCrossing))) {
    const fireAt = leadFireAt(Date.parse(precipitationCrossing.forecastAt));
    if (fireAt !== null) {
      addPlan('precipitation_onset', precipitationCrossing, fireAt, {
        kind: 'precipitation',
        form: ['sleet', 'snow'].includes(precipitationCrossing.condition) ? 'snow' : 'rain',
      });
    }
  }

  // The felt temperature through the window: the current reading until the first remaining
  // hour, then each hour's own reading for the sixty minutes it covers.
  const feltFrom = [
    { start: now, apparentCelsius: snapshot.current.apparentTemperatureCelsius },
    ...remainingHours.map(({ forecastAt, apparentTemperatureCelsius }) => ({
      start: Date.parse(forecastAt),
      apparentCelsius: apparentTemperatureCelsius,
    })),
  ];

  /**
   * ADR 0032 section 1: a swing is measured from the felt temperature at the moment its alert
   * arrives, a fixed forecast reading that does not move with the time the app is opened. The
   * lead's fire time is kept while that moment still feels 8 °C away from the crossing hour;
   * otherwise the alert moves to the last minute of the latest earlier hour outside quiet hours
   * that does, and is not planned when no such minute is left.
   */
  function swingDelivery(crossing: HourlyWeather): Readonly<{ fireAt: number; apparentCelsius: number }> | null {
    const latest = leadFireAt(Date.parse(crossing.forecastAt));
    if (latest === null) return null;
    for (let index = feltFrom.length - 1; index >= 0; index -= 1) {
      const { start, apparentCelsius } = feltFrom[index];
      if (start > latest) continue;
      const next = feltFrom[index + 1]?.start;
      const fireAt = next === undefined || next > latest
        ? latest
        : Math.floor((next - 1) / minuteMilliseconds) * minuteMilliseconds;
      if (fireAt < start
        || Math.abs(crossing.apparentTemperatureCelsius - apparentCelsius) < temperatureSwingCelsius
        || adjustForQuietHours(fireAt, fireAt, quietHours) !== fireAt) continue;
      return { fireAt, apparentCelsius };
    }
    return null;
  }

  for (const crossing of remainingHours) {
    // Once a window's swing is announced, a later hour measured from the readings before it
    // would announce the same change again, so the search stops at the first such hour.
    if (deliveredAlertIds.has(identity('temperature_swing', crossing))) break;
    const delivery = swingDelivery(crossing);
    if (delivery === null) continue;
    const toApparentCelsius = crossing.apparentTemperatureCelsius;
    addPlan('temperature_swing', crossing, delivery.fireAt, {
      kind: 'temperature',
      direction: toApparentCelsius < delivery.apparentCelsius ? 'drop' : 'rise',
      fromApparentCelsius: delivery.apparentCelsius,
      toApparentCelsius,
    });
    break;
  }

  return Object.freeze(plans.sort((left, right) => Date.parse(left.fireAt) - Date.parse(right.fireAt)));
}
