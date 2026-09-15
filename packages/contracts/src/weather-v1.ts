import { z } from 'zod';

export const weatherV1Path = '/v1/weather' as const;

export const weatherConditionCodes = [
  'clear',
  'mostly_clear',
  'partly_cloudy',
  'cloudy',
  'fog',
  'drizzle',
  'rain',
  'heavy_rain',
  'sleet',
  'snow',
  'thunderstorm',
] as const;

export const weatherV1ErrorCodes = [
  'invalid_request',
  'not_found',
  'method_not_allowed',
  'weather_unavailable',
  'internal_error',
  'rate_limited',
] as const;

export const weatherSourceIds = ['sample', 'open-meteo', 'openweather', 'weatherkit'] as const;

const utcTimestampSchema = z.iso.datetime({ offset: false });

export const ianaTimeZoneSchema = z.string().trim().min(1).max(100).refine((value) => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value }).format(0);
    return true;
  } catch {
    return false;
  }
}, 'Invalid IANA time zone.');

export const weatherV1RequestSchema = z.strictObject({
  latitudeE2: z.number().int().min(-9000).max(9000),
  longitudeE2: z.number().int().min(-18000).max(18000),
  timeZone: ianaTimeZoneSchema,
});

const weatherMeasurementsSchema = z.object({
  temperatureCelsius: z.number(),
  apparentTemperatureCelsius: z.number(),
  condition: z.enum(weatherConditionCodes),
  precipitationProbability: z.number().min(0).max(1),
  windSpeedMetersPerSecond: z.number().min(0),
  humidity: z.number().min(0).max(1),
  uvIndex: z.number().min(0),
});

const currentWeatherSchema = weatherMeasurementsSchema.extend({
  observedAt: utcTimestampSchema,
});

const hourlyWeatherSchema = weatherMeasurementsSchema.extend({
  forecastAt: utcTimestampSchema,
});

const hourInMilliseconds = 60 * 60 * 1000;
export const weatherHourlyForecastMaximumEntries = 38;

export function isWeatherHourlyForecastInWindow(
  forecastAt: string,
  observedAt: string,
): boolean {
  const forecastTime = Date.parse(forecastAt);
  const observedTime = Date.parse(observedAt);
  return Number.isFinite(forecastTime) && Number.isFinite(observedTime) &&
    forecastTime >= observedTime - hourInMilliseconds &&
    forecastTime <= observedTime + 36 * hourInMilliseconds;
}

export function isValidWeatherHourlyForecastWindow(
  hourly: readonly Readonly<{ forecastAt: string }>[],
  observedAt: string,
): boolean {
  if (hourly.length < 1 || hourly.length > weatherHourlyForecastMaximumEntries) return false;

  return hourly.every(({ forecastAt }, index) => (
    isWeatherHourlyForecastInWindow(forecastAt, observedAt) &&
    (index === 0 || Date.parse(hourly[index - 1].forecastAt) < Date.parse(forecastAt))
  ));
}

export function weatherLocalDateKey(timestamp: string, timeZone: string): string | null {
  try {
    const date = new Date(timestamp);
    if (!Number.isFinite(date.getTime())) return null;
    const parts = new Intl.DateTimeFormat('en', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  } catch {
    return null;
  }
}

const weatherV1DataSchema = z.object({
  timeZone: ianaTimeZoneSchema,
  fetchedAt: utcTimestampSchema,
  origin: z.object({
    kind: z.enum(['sample', 'live']),
    sourceId: z.enum(weatherSourceIds),
  }),
  current: currentWeatherSchema,
  minimumTemperatureCelsius: z.number(),
  maximumTemperatureCelsius: z.number(),
  hourly: z.array(hourlyWeatherSchema).min(1).max(weatherHourlyForecastMaximumEntries),
}).superRefine((value, context) => {
  if ((value.origin.sourceId === 'sample') !== (value.origin.kind === 'sample')) {
    context.addIssue({
      code: 'custom',
      message: 'origin.sourceId must be "sample" if and only if origin.kind is "sample".',
      path: ['origin', 'sourceId'],
    });
  }

  if (
    value.minimumTemperatureCelsius > value.maximumTemperatureCelsius ||
    value.current.temperatureCelsius < value.minimumTemperatureCelsius ||
    value.current.temperatureCelsius > value.maximumTemperatureCelsius
  ) {
    context.addIssue({
      code: 'custom',
      message: 'Current and minimum/maximum temperatures are inconsistent.',
      path: ['minimumTemperatureCelsius'],
    });
  }

  if (!isValidWeatherHourlyForecastWindow(value.hourly, value.current.observedAt)) {
    context.addIssue({
      code: 'custom',
      message: 'Hourly forecasts must be ordered and fall within the current 36-hour window.',
      path: ['hourly'],
    });
  }
});

export const weatherV1SuccessSchema = z.object({
  data: weatherV1DataSchema,
});

export const weatherV1ErrorSchema = z.object({
  error: z.object({
    code: z.enum(weatherV1ErrorCodes),
  }),
});

export type WeatherConditionCode = (typeof weatherConditionCodes)[number];
export type WeatherSourceId = (typeof weatherSourceIds)[number];
export type WeatherV1ErrorCode = (typeof weatherV1ErrorCodes)[number];
export type WeatherV1Request = z.infer<typeof weatherV1RequestSchema>;
export type WeatherV1Success = z.infer<typeof weatherV1SuccessSchema>;
export type WeatherV1Data = WeatherV1Success['data'];
export type WeatherV1Error = z.infer<typeof weatherV1ErrorSchema>;
