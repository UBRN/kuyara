import { dressStyleSchema, type DressStyle, type StyleAesthetic } from '@kuyara/contracts';
import { z } from 'zod';

import { utcIsoTimestampSchema, uuidV4Schema } from '@/domain/record-identity';
import { styleAestheticsSchema } from '@/features/profile/domain/profile';

export const dressingDayChoiceSourceSchema = z.enum(['morning', 'chip', 'plan', 'random']);
export type DressingDayChoiceSource = z.infer<typeof dressingDayChoiceSourceSchema>;
export const dressingDayKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}(:evening)?$/);

export type DressingDayChoice = Readonly<{
  id: string;
  localProfileId: string;
  dayKey: string;
  formality: DressStyle;
  source: DressingDayChoiceSource;
  styleAesthetics: readonly StyleAesthetic[] | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}>;

export interface DressingDayChoiceRepository {
  get(localProfileId: string, dayKey: string): Promise<DressingDayChoice | null>;
  upsert(localProfileId: string, dayKey: string, formality: DressStyle,
    source: DressingDayChoiceSource, styleAesthetics?: readonly StyleAesthetic[] | null): Promise<DressingDayChoice>;
}

/** A day's styles follow the rule of the profile's styles. */
export const dailyStyleAestheticsSchema = styleAestheticsSchema;

export function resolvedStyleAesthetics(
  choice: DressingDayChoice | null,
  settingsDefault: readonly StyleAesthetic[],
): readonly StyleAesthetic[] {
  return choice?.styleAesthetics?.length ? choice.styleAesthetics : settingsDefault;
}

export function resolvedFormality(
  choice: DressingDayChoice | null,
  profileDefault: DressStyle,
): DressStyle {
  return choice?.formality ?? profileDefault;
}

export function parseDressingDayChoice(value: unknown): DressingDayChoice {
  return z.strictObject({
    id: uuidV4Schema,
    localProfileId: z.string().min(1),
    dayKey: dressingDayKeySchema,
    formality: dressStyleSchema,
    source: dressingDayChoiceSourceSchema,
    styleAesthetics: dailyStyleAestheticsSchema.nullable(),
    createdAt: utcIsoTimestampSchema,
    updatedAt: utcIsoTimestampSchema,
    deletedAt: utcIsoTimestampSchema.nullable(),
  }).parse(value);
}
