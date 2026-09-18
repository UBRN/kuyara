import { z } from 'zod';

import {
  weatherConditionCodes,
  weatherLocalDateKey,
  weatherV1SuccessSchema,
} from './weather-v1.ts';

// /v2 exists only because builds 8 and 9 parse every /v1 response with strict schemas, so an
// added key breaks them (see shipped-shape.test.mjs). The route carries the whole v1 payload
// plus `daily`, with the same origin and attribution semantics, and it shares v1's request and
// error schemas: `weatherV1RequestSchema` is still the strict request the Worker owns, and
// `weatherV1ErrorSchema` is still the error body. Only the success shape is new.
export const weatherV2Path = '/v2/weather' as const;

// Seven is the contract ceiling, not the product decision: mobile draws five, and the extra
// room means going to seven later is a mobile change, not another route.
export const weatherDailyForecastMaximumEntries = 7;

const localDateKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u);

const dailyWeatherSchema = z.object({
  dateKey: localDateKeySchema,
  condition: z.enum(weatherConditionCodes),
  minimumTemperatureCelsius: z.number(),
  maximumTemperatureCelsius: z.number(),
  precipitationProbability: z.number().min(0).max(1),
  // Nullable, never absent and never invented: a provider that reports no amount yields null
  // and the row shows the chance alone.
  precipitationMillimetres: z.number().min(0).nullable(),
});

const weatherV2DataSchema = weatherV1SuccessSchema.shape.data.extend({
  daily: z.array(dailyWeatherSchema).min(1).max(weatherDailyForecastMaximumEntries),
}).superRefine((value, context) => {
  // The array bounds already cap the length; this is the ordering, the local-day anchor and
  // each entry's own range. Date keys are `YYYY-MM-DD`, so a string compare is a date compare.
  const localDay = weatherLocalDateKey(value.current.observedAt, value.timeZone);
  const ordered = value.daily.every((entry, index) => (
    entry.minimumTemperatureCelsius <= entry.maximumTemperatureCelsius &&
    (index === 0
      ? entry.dateKey === localDay
      : value.daily[index - 1].dateKey < entry.dateKey)
  ));
  if (!ordered) {
    context.addIssue({
      code: 'custom',
      message: 'Daily forecasts must be ordered and start on the local day of the observation.',
      path: ['daily'],
    });
  }

  // Today appears twice in the payload: as the card's low and high, and as the first daily
  // row. They come from the same upstream day, so a response where they disagree is one the
  // screen would contradict itself on.
  const [today] = value.daily;
  if (
    today !== undefined && (
      today.minimumTemperatureCelsius !== value.minimumTemperatureCelsius ||
      today.maximumTemperatureCelsius !== value.maximumTemperatureCelsius
    )
  ) {
    context.addIssue({
      code: 'custom',
      message: 'The first daily entry must carry the same low and high as the snapshot.',
      path: ['daily', 0],
    });
  }
});

export const weatherV2SuccessSchema = z.object({
  data: weatherV2DataSchema,
});

export type WeatherV2Success = z.infer<typeof weatherV2SuccessSchema>;
export type WeatherV2Data = WeatherV2Success['data'];
export type WeatherDailyForecast = WeatherV2Data['daily'][number];
