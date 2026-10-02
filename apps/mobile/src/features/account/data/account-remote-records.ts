import { dressStyleSchema } from '@kuyara/contracts';
import { z } from 'zod';

import { isUuidV4 } from '@/domain/record-identity';
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

export type RemoteProfileUpload = Readonly<{
  user_id: string;
  display_name: string | null;
  gender: string | null;
  dress_style: string | null;
  style_aesthetics: readonly string[];
  created_at: string;
  updated_at: string;
  deleted_at: null;
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
const rowId = z.string().refine(isUuidV4);
const clock = z.iso.datetime({ offset: true }).transform((value) => new Date(value).toISOString());
const serverInstant = z.string().transform((value, context) => {
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
  id: rowId,
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
  id: rowId,
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
  id: rowId,
  day_key: dressingDayKeySchema,
  departure_at: clock,
  time_zone: departureTimeZoneSchema,
  created_at: clock,
  updated_at: clock,
  deleted_at: clock.nullable(),
  server_updated_at: serverInstant,
});

export const remoteOutfitHistoryRowSchema = z.object({
  id: rowId,
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
