import { dressStyleSchema } from '@kuyara/contracts';
import { z } from 'zod';

import { offsetIsoInstantSchema, uuidV4Schema } from '@/domain/record-identity';
import {
  breathabilitySchema,
  colorFamilySchema,
  coverageSchema,
  structuralCategorySchema,
  thermalLevelSchema,
  tractionSuitabilitySchema,
  waterProtectionSchema,
  windProtectionSchema,
} from '@/features/catalog/domain/garment-taxonomy';
import { canonicalServerInstant } from '@/features/account/domain/server-instant';
import { genderSchema, styleAestheticsSchema } from '@/features/profile/domain/profile';
import {
  dailyStyleAestheticsSchema,
  dressingDayChoiceSourceSchema,
  dressingDayKeySchema,
} from '@/features/recommendation/domain/dressing-day-choice';
import { departureTimeZoneSchema } from '@/features/recommendation/domain/dressing-day-departure';
import { bareHistoryDayKeySchema, wornOutfitSchema } from '@/features/recommendation/domain/outfit-history';
import { wardrobeEntryStateSchema } from '@/features/wardrobe/domain/wardrobe-item';

// What one phone sends to a synced table. The column names are the SQLite names, snake_case and
// one to one; `user_id` is the owner. The device-only columns (`local_profile_id`, the photo
// paths, `birth_date`, the consents and every device setting) have no field here, and the
// server-written `server_updated_at` is never sent.

/**
 * Dress style and style aesthetics are present only when the profile carries them (the sync
 * consent): an upsert leaves a column it does not send as the account holds it.
 */
export type RemoteProfileUpload = Readonly<{
  user_id: string;
  display_name: string | null;
  gender: string | null;
  dress_style?: string | null;
  style_aesthetics?: readonly string[];
  created_at: string;
  updated_at: string;
  deleted_at: null;
}>;

/**
 * A soft-deleted row goes to the account without its content (ADR 0041 section 3): the id, the
 * day for the day-keyed tables, the owner and the clocks. The server clears any content anyway.
 */
export type RemoteDeletionMarkerUpload = Readonly<{
  id: string;
  user_id: string;
  day_key?: string;
  created_at: string;
  updated_at: string;
  deleted_at: string;
}>;

export type RemoteWardrobeItemUpload = Readonly<{
  id: string;
  user_id: string;
  name: string | null;
  category: string;
  entry_state: string;
  garment_type_id: string | null;
  color: string | null;
  color_family: string | null;
  color_option_id: string | null;
  color_custom_hex: string | null;
  thermal_level_override: string | null;
  water_protection_override: string | null;
  wind_protection_override: string | null;
  breathability_override: string | null;
  arm_coverage_override: string | null;
  leg_coverage_override: string | null;
  traction_suitability_override: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}>;

export type RemoteDressingDayChoiceUpload = Readonly<{
  id: string;
  user_id: string;
  day_key: string;
  formality: string;
  source: string;
  style_aesthetics: readonly string[] | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}>;

export type RemoteDressingDayDepartureUpload = Readonly<{
  id: string;
  user_id: string;
  day_key: string;
  departure_at: string;
  time_zone: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}>;

export type RemoteOutfitHistoryUpload = Readonly<{
  id: string;
  user_id: string;
  day_key: string;
  outfit_json: unknown;
  piece_colors_json: unknown;
  worn_at: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}>;

// What a pull returns is untrusted. Columns a newer server adds are ignored; a value this build
// does not know (an enum member, a catalog id) fails the schema, and the row is refused. The
// client clocks come back in Postgres form and are read as the instant they name.
const clock = offsetIsoInstantSchema.transform((value) => new Date(value).toISOString());
/** A server arrival instant in canonical form; an unreadable one fails the row. */
export const serverInstant = z.string().transform((value, context) => {
  const canonical = canonicalServerInstant(value);
  if (canonical === null) context.addIssue({ code: 'custom', message: 'Invalid server instant.' });
  return canonical ?? '';
});
const optionalText = z.string().nullable();

export const remoteProfileRowSchema = z.object({
  display_name: optionalText,
  gender: genderSchema.nullable(),
  dress_style: dressStyleSchema.nullable(),
  style_aesthetics: styleAestheticsSchema,
  created_at: clock,
  updated_at: clock,
  deleted_at: z.null(),
  server_updated_at: serverInstant,
});

export const remoteWardrobeItemRowSchema = z.object({
  id: uuidV4Schema,
  name: optionalText,
  category: structuralCategorySchema,
  entry_state: wardrobeEntryStateSchema,
  garment_type_id: optionalText,
  color: optionalText,
  color_family: colorFamilySchema.nullable(),
  color_option_id: optionalText,
  color_custom_hex: optionalText,
  thermal_level_override: thermalLevelSchema.nullable(),
  water_protection_override: waterProtectionSchema.nullable(),
  wind_protection_override: windProtectionSchema.nullable(),
  breathability_override: breathabilitySchema.nullable(),
  arm_coverage_override: coverageSchema.nullable(),
  leg_coverage_override: coverageSchema.nullable(),
  traction_suitability_override: tractionSuitabilitySchema.nullable(),
  created_at: clock,
  updated_at: clock,
  deleted_at: clock.nullable(),
  server_updated_at: serverInstant,
});

export const remoteDressingDayChoiceRowSchema = z.object({
  id: uuidV4Schema,
  day_key: dressingDayKeySchema,
  formality: dressStyleSchema,
  source: dressingDayChoiceSourceSchema,
  style_aesthetics: dailyStyleAestheticsSchema.nullable(),
  created_at: clock,
  updated_at: clock,
  deleted_at: clock.nullable(),
  server_updated_at: serverInstant,
});

export const remoteDressingDayDepartureRowSchema = z.object({
  id: uuidV4Schema,
  day_key: dressingDayKeySchema,
  departure_at: clock,
  time_zone: departureTimeZoneSchema,
  created_at: clock,
  updated_at: clock,
  deleted_at: clock.nullable(),
  server_updated_at: serverInstant,
});

export const remoteOutfitHistoryRowSchema = z.object({
  id: uuidV4Schema,
  day_key: bareHistoryDayKeySchema,
  outfit_json: wornOutfitSchema,
  // Display colours only: an unreadable value draws the day in the fixed scheme instead of
  // refusing the row, as the SQLite read does.
  piece_colors_json: z.unknown(),
  worn_at: clock,
  created_at: clock,
  updated_at: clock,
  deleted_at: clock.nullable(),
  server_updated_at: serverInstant,
});

// A deletion marker as a pull returns it: the server keeps only the identity and the clocks of a
// soft-deleted row and clears every content column, so each content column is null or absent.
// A soft-deleted row that still carries content reads through the whole-row schema above.
const cleared = z.null().optional();
const markerClocks = {
  id: uuidV4Schema,
  created_at: clock,
  updated_at: clock,
  deleted_at: clock,
  server_updated_at: serverInstant,
};

export const remoteWardrobeItemMarkerSchema = z.object({
  ...markerClocks,
  name: cleared,
  category: cleared,
  entry_state: cleared,
  garment_type_id: cleared,
  color: cleared,
  color_family: cleared,
  color_option_id: cleared,
  color_custom_hex: cleared,
  thermal_level_override: cleared,
  water_protection_override: cleared,
  wind_protection_override: cleared,
  breathability_override: cleared,
  arm_coverage_override: cleared,
  leg_coverage_override: cleared,
  traction_suitability_override: cleared,
});

export const remoteDressingDayChoiceMarkerSchema = z.object({
  ...markerClocks,
  day_key: dressingDayKeySchema,
  formality: cleared,
  source: cleared,
  style_aesthetics: cleared,
});

export const remoteDressingDayDepartureMarkerSchema = z.object({
  ...markerClocks,
  day_key: dressingDayKeySchema,
  departure_at: cleared,
  time_zone: cleared,
});

export const remoteOutfitHistoryMarkerSchema = z.object({
  ...markerClocks,
  day_key: bareHistoryDayKeySchema,
  outfit_json: cleared,
  piece_colors_json: cleared,
  worn_at: cleared,
});
