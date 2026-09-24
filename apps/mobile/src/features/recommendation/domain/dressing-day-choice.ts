import { dressStyleSchema, type DressStyle } from '@kuyara/contracts';
import { z } from 'zod';

export const dressingDayChoiceSourceSchema = z.enum(['morning', 'chip', 'plan', 'random']);
export type DressingDayChoiceSource = z.infer<typeof dressingDayChoiceSourceSchema>;
export const dressingDayKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}(:evening)?$/);

export type DressingDayChoice = Readonly<{
  id: string;
  localProfileId: string;
  dayKey: string;
  formality: DressStyle;
  source: DressingDayChoiceSource;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}>;

export interface DressingDayChoiceRepository {
  get(localProfileId: string, dayKey: string): Promise<DressingDayChoice | null>;
  upsert(localProfileId: string, dayKey: string, formality: DressStyle,
    source: DressingDayChoiceSource): Promise<DressingDayChoice>;
}

export function resolvedFormality(
  choice: DressingDayChoice | null,
  profileDefault: DressStyle,
): DressStyle {
  return choice?.formality ?? profileDefault;
}

export function nextBareDressingDayKey(currentKey: string): string {
  const key = dressingDayKeySchema.parse(currentKey);
  const date = new Date(`${key.slice(0, 10)}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

export function parseDressingDayChoice(value: unknown): DressingDayChoice {
  return z.strictObject({
    id: z.uuid(),
    localProfileId: z.string().min(1),
    dayKey: dressingDayKeySchema,
    formality: dressStyleSchema,
    source: dressingDayChoiceSourceSchema,
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    deletedAt: z.iso.datetime().nullable(),
  }).parse(value);
}
