import type { HourlyWeather, WeatherSnapshot } from '@/features/weather/domain/weather';
import { wardrobeDayWindow } from '@/features/weather/domain/wardrobe-day';
import {
  chillyCelsius,
  freezingCelsius,
  hotCelsius,
  isWetMeasurement,
  temperatureSwingCelsius,
  veryHotCelsius,
  veryWindyMetersPerSecond,
  windyMetersPerSecond,
} from '@/features/weather/domain/weather-thresholds';
import type { DayInsight } from '@/features/weather/domain/day-insight';

export type DayWindow =
  | Readonly<{ kind: 'rain' | 'snow' | 'wind' | 'very_windy'; fromHour: string | null; untilHour: string | null }>
  | Readonly<{ kind: 'stays_hot' | 'stays_very_hot' | 'stays_cold' | 'stays_freezing'; fromHour: string }>
  | Readonly<{ kind: 'temperature_change'; direction: 'drop' | 'rise'; atHour: string; toCelsius: number }>
  | Readonly<{ kind: 'lowest'; atHour: string; temperatureCelsius: number }>;

const hourMs = 60 * 60 * 1000;

function firstRun(
  hours: readonly HourlyWeather[],
  matches: (hour: HourlyWeather) => boolean,
): Readonly<{ start: number; end: number }> | null {
  const start = hours.findIndex(matches);
  if (start < 0) return null;
  let end = start + 1;
  while (end < hours.length && matches(hours[end])) end += 1;
  return { start, end };
}

function interval(
  hours: readonly HourlyWeather[],
  run: Readonly<{ start: number; end: number }>,
  alreadyNow: boolean,
): Readonly<{ fromHour: string | null; untilHour: string | null }> {
  return {
    fromHour: run.start === 0 && alreadyNow ? null : hours[run.start].forecastAt,
    untilHour: run.end === hours.length ? null : hours[run.end].forecastAt,
  };
}

/** The first useful second line about the same, fully covered dressing-day window. */
export function findDayWindow(input: Readonly<{
  snapshot: WeatherSnapshot;
  now: string;
  firstInsight: DayInsight | null;
  coverage?: Readonly<{ start: string; end: string }>;
}>): DayWindow | null {
  const now = Math.max(Date.parse(input.now), Date.parse(input.coverage?.start ?? input.now));
  const window = wardrobeDayWindow(input.coverage?.start ?? input.now, input.snapshot.timeZone);
  if (!window || !Number.isFinite(now)) return null;
  const end = Date.parse(input.coverage?.end ?? window.end);
  const hours = input.snapshot.hourly.filter(({ forecastAt }) => {
    const at = Date.parse(forecastAt);
    return at >= now && at < end;
  });
  if (
    hours.length < 2 ||
    Date.parse(hours[0].forecastAt) - now > hourMs ||
    end - Date.parse(hours[hours.length - 1].forecastAt) > hourMs ||
    hours.some((hour, index) => index > 0 &&
      Date.parse(hour.forecastAt) - Date.parse(hours[index - 1].forecastAt) !== hourMs)
  ) {
    return null;
  }

  if (input.firstInsight?.kind !== 'wet_all_day' && input.firstInsight?.kind !== 'wet_window') {
    const wet = firstRun(hours, isWetMeasurement);
    if (wet) {
      return {
        kind: ['sleet', 'snow'].includes(hours[wet.start].condition) ? 'snow' : 'rain',
        ...interval(hours, wet, isWetMeasurement(input.snapshot.current)),
      };
    }
  }

  // A "stays" claim needs at least two consecutive forecast hours at the window's end.
  const endingRun = (matches: (hour: HourlyWeather) => boolean) => {
    let start = hours.length - 1;
    while (start >= 0 && matches(hours[start])) start -= 1;
    start += 1;
    return hours.length - start >= 2 ? start : null;
  };
  const veryHot = endingRun(({ apparentTemperatureCelsius }) => apparentTemperatureCelsius >= veryHotCelsius);
  if (veryHot !== null) return { kind: 'stays_very_hot', fromHour: hours[veryHot].forecastAt };
  const hot = endingRun(({ apparentTemperatureCelsius }) => apparentTemperatureCelsius >= hotCelsius);
  if (hot !== null) return { kind: 'stays_hot', fromHour: hours[hot].forecastAt };
  const freezing = endingRun(({ apparentTemperatureCelsius }) => apparentTemperatureCelsius <= freezingCelsius);
  if (freezing !== null) return { kind: 'stays_freezing', fromHour: hours[freezing].forecastAt };
  const cold = endingRun(({ apparentTemperatureCelsius }) => apparentTemperatureCelsius <= chillyCelsius);
  if (cold !== null) return { kind: 'stays_cold', fromHour: hours[cold].forecastAt };

  const wind = firstRun(hours, ({ windSpeedMetersPerSecond }) => windSpeedMetersPerSecond >= windyMetersPerSecond);
  if (wind) {
    return {
      kind: hours.slice(wind.start, wind.end).some(({ windSpeedMetersPerSecond }) =>
        windSpeedMetersPerSecond >= veryWindyMetersPerSecond) ? 'very_windy' : 'wind',
      ...interval(
        hours, wind,
        input.snapshot.current.windSpeedMetersPerSecond >= windyMetersPerSecond,
      ),
    };
  }

  const from = input.snapshot.current.apparentTemperatureCelsius;
  const crossing = hours.find(({ apparentTemperatureCelsius }) =>
    Math.abs(apparentTemperatureCelsius - from) >= temperatureSwingCelsius);
  if (!crossing) return null;
  if (window.period === 'evening' && crossing.apparentTemperatureCelsius < from) {
    const coldest = hours.reduce((lowest, hour) =>
      hour.apparentTemperatureCelsius < lowest.apparentTemperatureCelsius ? hour : lowest);
    if (coldest.forecastAt !== crossing.forecastAt) {
      return { kind: 'lowest', atHour: coldest.forecastAt, temperatureCelsius: coldest.apparentTemperatureCelsius };
    }
  }
  return {
    kind: 'temperature_change',
    direction: crossing.apparentTemperatureCelsius < from ? 'drop' : 'rise',
    atHour: crossing.forecastAt,
    toCelsius: crossing.apparentTemperatureCelsius,
  };
}
