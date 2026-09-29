import { weatherLocalDateKey } from '@kuyara/contracts';

import { WeatherProviderError } from './weather-provider-error.ts';

/** A provider timestamp normalised to UTC ISO; an unparseable one is an invalid provider response. */
export function isoTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) throw new WeatherProviderError('invalid_response');
  return date.toISOString();
}

/** The place's local calendar day for a timestamp; an unparseable one is an invalid provider response. */
export function localDateKey(timestamp: string, timeZone: string): string {
  const dateKey = weatherLocalDateKey(timestamp, timeZone);
  if (dateKey === null) throw new WeatherProviderError('invalid_response');
  return dateKey;
}
