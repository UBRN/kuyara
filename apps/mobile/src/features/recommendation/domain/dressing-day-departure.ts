import { z } from 'zod';

import { isValidTimeZone } from '@/domain/intl-format';
import { dressingDayKeySchema } from '@/features/recommendation/domain/dressing-day-choice';
import { localDayKey } from '@/features/recommendation/domain/local-day';

export const departureDayKeySchema = dressingDayKeySchema;
// The zone always comes from the active place, so it accepts every name the weather layer
// accepts (Intl decides: UTC, GMT and CET as well as Europe/Istanbul) and refuses only the
// numeric offsets Intl also takes, which name no place.
export const departureTimeZoneSchema = z.string().min(1)
  .refine((value) => !/^[+-]/.test(value) && isValidTimeZone(value));

/**
 * The dressing day a departure belongs to, read on the device clock: the same clock as
 * `localDayKey` in `recommendation/domain/local-day.ts`, which owns the dressing-day rule.
 * The departure's own `timeZone` bounds its coverage window and plays no part in the key, so a place in another
 * zone cannot file the departure under a day Today never reads.
 */
export function departureDressingDayKey(departureAt: string): string | null {
  const instant = Date.parse(departureAt);
  if (!Number.isFinite(instant)) return null;
  return localDayKey(new Date(instant));
}

export type DressingDayDeparture = Readonly<{
  id: string;
  localProfileId: string;
  dayKey: string;
  departureAt: string;
  timeZone: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}>;

export interface DressingDayDepartureRepository {
  get(localProfileId: string, dayKey: string): Promise<DressingDayDeparture | null>;
  upsert(localProfileId: string, dayKey: string, departureAt: string,
    timeZone: string): Promise<DressingDayDeparture>;
  clear(localProfileId: string, dayKey: string): Promise<boolean>;
}
