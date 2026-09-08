import { z } from 'zod';

import { ianaTimeZoneSchema, weatherV1RequestSchema } from './weather-v1.ts';

export const placeSearchV1Path = '/v1/places/search' as const;
export const placeSearchMaxResults = 5;
export const placeIdSchema = z.string().regex(/^place\.[1-9][0-9]{0,15}(?![\s\S])/);
export const manualLocationIdSchema = z.union([
  z.string().regex(/^sample\.[a-z][a-z0-9-]{0,63}(?![\s\S])/),
  placeIdSchema,
]);
export const locationDisplayNameSchema = z.string().trim().min(1).max(200);

export const placeSearchV1RequestSchema = z.object({
  query: z.string().trim().min(2).max(100),
  limit: z.number().int().min(1).max(placeSearchMaxResults),
  language: z.enum(['tr', 'en']),
}).strict();

export const placeSearchResultSchema = z.object({
  id: placeIdSchema,
  displayName: locationDisplayNameSchema,
  region: z.string().trim().min(1).max(400),
  latitudeE2: weatherV1RequestSchema.shape.latitudeE2,
  longitudeE2: weatherV1RequestSchema.shape.longitudeE2,
  timeZone: ianaTimeZoneSchema.nullable(),
}).strict();

export const placeSearchV1SuccessSchema = z.object({
  data: z.object({
    places: z.array(placeSearchResultSchema).max(placeSearchMaxResults),
    // Controlled attribution identifiers, as in weather's origin.sourceId.
    attribution: z.tuple([z.literal('open-meteo'), z.literal('geonames')]),
  }).strict(),
}).strict();

export const placeSearchV1ErrorSchema = z.object({
  error: z.object({
    code: z.enum([
      'invalid_request', 'not_found', 'method_not_allowed',
      'places_unavailable', 'internal_error', 'rate_limited',
    ]),
  }).strict(),
}).strict();

export type PlaceSearchV1Request = z.infer<typeof placeSearchV1RequestSchema>;
export type PlaceSearchResult = z.infer<typeof placeSearchResultSchema>;
export type PlaceSearchV1Data = z.infer<typeof placeSearchV1SuccessSchema>['data'];
export type PlaceSearchV1ErrorCode = z.infer<typeof placeSearchV1ErrorSchema>['error']['code'];
