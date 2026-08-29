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

export const weatherSourceIds = ['sample', 'open-meteo', 'openweather'] as const;

const utcTimestampSchema = z.string().datetime({ offset: false });

export const ianaTimeZoneSchema = z.string().trim().min(1).max(100).refine((value) => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value }).format(0);
    return true;
  } catch {
    return false;
  }
}, 'Invalid IANA time zone.');

export const weatherV1RequestSchema = z.object({
  latitudeE2: z.number().int().min(-9000).max(9000),
  longitudeE2: z.number().int().min(-18000).max(18000),
  timeZone: ianaTimeZoneSchema,
}).strict();

const weatherMeasurementsSchema = z.object({
  temperatureCelsius: z.number().finite(),
  apparentTemperatureCelsius: z.number().finite(),
  condition: z.enum(weatherConditionCodes),
  precipitationProbability: z.number().finite().min(0).max(1),
  windSpeedMetersPerSecond: z.number().finite().min(0),
  humidity: z.number().finite().min(0).max(1),
  uvIndex: z.number().finite().min(0),
}).strict();

const currentWeatherSchema = weatherMeasurementsSchema.extend({
  observedAt: utcTimestampSchema,
}).strict();

const hourlyWeatherSchema = weatherMeasurementsSchema.extend({
  forecastAt: utcTimestampSchema,
}).strict();

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
  }).strict(),
  current: currentWeatherSchema,
  minimumTemperatureCelsius: z.number().finite(),
  maximumTemperatureCelsius: z.number().finite(),
  hourly: z.array(hourlyWeatherSchema).min(1).max(25),
}).strict().superRefine((value, context) => {
  if ((value.origin.sourceId === 'sample') !== (value.origin.kind === 'sample')) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
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
      code: z.ZodIssueCode.custom,
      message: 'Current and minimum/maximum temperatures are inconsistent.',
      path: ['minimumTemperatureCelsius'],
    });
  }

  const currentLocalDate = weatherLocalDateKey(value.current.observedAt, value.timeZone);
  let previousForecastAt: string | null = null;
  for (let index = 0; index < value.hourly.length; index += 1) {
    const forecastAt = value.hourly[index].forecastAt;
    if (
      (previousForecastAt !== null && previousForecastAt >= forecastAt) ||
      currentLocalDate === null ||
      weatherLocalDateKey(forecastAt, value.timeZone) !== currentLocalDate
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Hourly forecasts must be ordered and belong to the current local day.',
        path: ['hourly', index, 'forecastAt'],
      });
    }
    previousForecastAt = forecastAt;
  }
});

export const weatherV1SuccessSchema = z.object({
  data: weatherV1DataSchema,
}).strict();

export const weatherV1ErrorSchema = z.object({
  error: z.object({
    code: z.enum(weatherV1ErrorCodes),
  }).strict(),
}).strict();

export type WeatherConditionCode = (typeof weatherConditionCodes)[number];
export type WeatherSourceId = (typeof weatherSourceIds)[number];
export type WeatherV1ErrorCode = (typeof weatherV1ErrorCodes)[number];
export type WeatherV1Request = z.infer<typeof weatherV1RequestSchema>;
export type WeatherV1Success = z.infer<typeof weatherV1SuccessSchema>;
export type WeatherV1Data = WeatherV1Success['data'];
export type WeatherV1Error = z.infer<typeof weatherV1ErrorSchema>;
