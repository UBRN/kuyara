import { z } from 'zod';

import { dressingDayKeySchema } from '@/features/recommendation/domain/dressing-day-choice';

export const departureDayKeySchema = dressingDayKeySchema;
export const departureTimeZoneSchema = z.string().min(1).refine((value) => {
  if (!/^[A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9_+-]+)+$/.test(value)) return false;
  try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; }
  catch { return false; }
});

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
