import type { WeatherMeasurements } from '@/features/weather/domain/weather';
import { chillyCelsius, isWetMeasurement } from '@/features/weather/domain/weather-thresholds';
import type { ClothingRequirements } from '@/features/recommendation/domain/weather-to-clothing-requirements';

/** The outfit's useful forecast horizon, independent of the dressing-day key. */
export type OutfitCoverage = Readonly<{ start: string; end: string }>;

function localParts(instant: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  }).formatToParts(new Date(instant));
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return { year: Number(values.year), month: Number(values.month),
    day: Number(values.day), hour: Number(values.hour), minute: Number(values.minute) };
}

export function outfitCoverage(startIso: string, timeZone: string): OutfitCoverage | null {
  const start = Date.parse(startIso);
  if (!Number.isFinite(start)) return null;
  try {
    const local = localParts(start, timeZone);
    const endHour = local.hour >= 18 || local.hour < 1 ? 1
      : local.hour < 4 ? 4
        : local.hour < 11 ? 19
          : local.hour < 16 ? 20 : 22;
    const endDate = new Date(Date.UTC(local.year, local.month - 1,
      local.day + (local.hour >= 18 ? 1 : 0)));
    // Search actual instants, not a fixed UTC offset. This also chooses the first 01:00
    // on a fall-back night and handles a changed offset before the end of the window.
    const first = Math.ceil((start + 1) / 900000) * 900000;
    for (let at = first; at <= start + 30 * 3600000; at += 900000) {
      const candidate = localParts(at, timeZone);
      if (candidate.year === endDate.getUTCFullYear() &&
          candidate.month === endDate.getUTCMonth() + 1 &&
          candidate.day === endDate.getUTCDate() &&
          candidate.hour === endHour && candidate.minute === 0) {
        return { start: new Date(start).toISOString(), end: new Date(at).toISOString() };
      }
    }
    return null;
  } catch {
    return null;
  }
}

const hourMs = 3600000;

/**
 * The window a sentence may promise. When the forecast stops before the coverage end, the
 * sentence ends at the last forecast hour instead: no protection is claimed for an hour the
 * forecast does not describe. Null when no forecast hour falls inside the window at all.
 */
export function forecastBoundedCoverage(
  coverage: OutfitCoverage,
  forecastHours: readonly Readonly<{ forecastAt: string }>[],
): OutfitCoverage | null {
  const start = Date.parse(coverage.start);
  const end = Date.parse(coverage.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  const last = Math.max(...forecastHours.map(({ forecastAt }) => Date.parse(forecastAt))
    .filter((at) => Number.isFinite(at) && at < end));
  if (!Number.isFinite(last) || last <= start) return null;
  return last + hourMs >= end ? coverage : { start: coverage.start, end: new Date(last).toISOString() };
}

/** What the rest of a displayed outfit's window now asks for that the outfit was not chosen for. */
export type CoverageDrift = Readonly<{ kind: 'rain' | 'snow' | 'cold'; at: string }>;

type DriftHour = WeatherMeasurements & Readonly<{ forecastAt: string }>;

const coldOf = (hour: WeatherMeasurements) =>
  Math.min(hour.temperatureCelsius, hour.apparentTemperatureCelsius);

/**
 * N15: after a stale refresh the outfit never changes silently, so Today says when the rest
 * of its window needs protection the outfit was not chosen for. Rain or snow counts when the
 * chosen requirements carry no mandatory body water protection; cold uses N19's mandatory
 * rule (below 12 °C for two consecutive hours, or below 5 °C once) and counts when the outfit
 * carries no mandatory insulation above light. Rain is reported ahead of cold.
 */
export function coverageDrift(
  chosen: ClothingRequirements,
  hourly: readonly DriftHour[],
  nowIso: string,
  coverageEnd: string,
): CoverageDrift | null {
  const now = Date.parse(nowIso);
  const end = Date.parse(coverageEnd);
  if (!Number.isFinite(now) || !Number.isFinite(end) || now >= end) return null;
  const remaining = [...hourly]
    .filter(({ forecastAt }) => {
      const at = Date.parse(forecastAt);
      return at + hourMs > now && at < end;
    })
    .sort((left, right) => Date.parse(left.forecastAt) - Date.parse(right.forecastAt));
  const rainProtected = chosen.requirements.some((requirement) =>
    requirement.kind === 'water_protection' && requirement.target === 'body' &&
    requirement.priority === 'mandatory');
  if (!rainProtected) {
    const wet = remaining.find(isWetMeasurement);
    if (wet) {
      return { kind: wet.condition === 'sleet' || wet.condition === 'snow' ? 'snow' : 'rain',
        at: wet.forecastAt };
    }
  }
  const coldProtected = chosen.requirements.some((requirement) =>
    requirement.kind === 'thermal' && requirement.priority === 'mandatory' &&
    requirement.minimum !== 'light');
  if (coldProtected) return null;
  const cold = firstMandatoryCold(remaining);
  return cold ? { kind: 'cold', at: cold.forecastAt } : null;
}

/** N19's mandatory cold: below 5 °C at any hour, or below 12 °C for two consecutive hours. */
function firstMandatoryCold<Hour extends DriftHour>(sorted: readonly Hour[]): Hour | undefined {
  return sorted.find((hour, index) => {
    if (coldOf(hour) < 5) return true;
    const next = sorted[index + 1];
    return coldOf(hour) < 12 && next !== undefined && coldOf(next) < 12 &&
      Date.parse(next.forecastAt) - Date.parse(hour.forecastAt) === hourMs;
  });
}

/** A later short cool spell: the hour it starts, for a "take a layer" finishing touch. */
export type CoolSpell = Readonly<{ at: string }>;

/**
 * N19: the first four hours of the window decide the outfit, and a later cool hour that is
 * not mandatory cold becomes a finishing touch rather than protection. Only for an outfit
 * with no mandatory insulation, and only while the spell is still ahead. A tail that turns
 * mandatory cold is not a short spell: the drift caption speaks for it instead.
 */
export function laterCoolSpell(
  chosen: ClothingRequirements,
  hourly: readonly DriftHour[],
  nowIso: string,
  coverage: OutfitCoverage,
): CoolSpell | null {
  const now = Date.parse(nowIso);
  const start = Date.parse(coverage.start);
  const end = Date.parse(coverage.end);
  if (!Number.isFinite(now) || !Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (chosen.requirements.some((requirement) =>
    requirement.kind === 'thermal' && requirement.priority === 'mandatory')) return null;
  const tail = hourly
    .filter(({ forecastAt }) => {
      const at = Date.parse(forecastAt);
      return at >= start + 4 * hourMs && at < end && at + hourMs > now;
    })
    .sort((left, right) => Date.parse(left.forecastAt) - Date.parse(right.forecastAt));
  if (firstMandatoryCold(tail)) return null;
  const cool = tail.find((hour) => coldOf(hour) < chillyCelsius);
  return cool ? { at: cool.forecastAt } : null;
}
