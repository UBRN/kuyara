import { z } from 'zod';

import { dressingDayKeySchema } from '@/features/recommendation/domain/dressing-day-choice';
import { wardrobeDayKey } from '@/features/weather/domain/wardrobe-day';

export const departureDayKeySchema = dressingDayKeySchema;
export const departureTimeZoneSchema = z.string().min(1).refine((value) => {
  if (!/^[A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9_+-]+)+$/.test(value)) return false;
  try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; }
  catch { return false; }
});

/**
 * The dressing day a departure belongs to, read on the device clock: the same clock as the
 * controller's `localDayKey`, which is the only dressing-day clock. The departure's own
 * `timeZone` bounds its coverage window and plays no part in the key, so a place in another
 * zone cannot file the departure under a day Today never reads.
 */
export function departureDressingDayKey(departureAt: string): string | null {
  const instant = Date.parse(departureAt);
  if (!Number.isFinite(instant)) return null;
  const date = new Date(instant);
  return wardrobeDayKey({
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
    hour: date.getHours(),
  });
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
