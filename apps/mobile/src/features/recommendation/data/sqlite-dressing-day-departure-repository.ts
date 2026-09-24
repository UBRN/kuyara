import { z } from 'zod';

import {
  departureDayKeySchema,
  departureTimeZoneSchema,
  type DressingDayDeparture,
  type DressingDayDepartureRepository,
} from '@/features/recommendation/domain/dressing-day-departure';
import type { SqliteDatabase, SqliteExecutor } from '@/infrastructure/sqlite/sqlite-database';
import { wardrobeDayWindow } from '@/features/weather/domain/wardrobe-day';

type Row = Readonly<{
  id: string; local_profile_id: string; day_key: string; departure_at: string;
  time_zone: string; created_at: string; updated_at: string; deleted_at: string | null;
}>;
const columns = 'id, local_profile_id, day_key, departure_at, time_zone, created_at, updated_at, deleted_at';

async function read(db: SqliteExecutor, profileId: string, dayKey: string): Promise<DressingDayDeparture | null> {
  const row = await db.getFirstAsync<Row>(`SELECT ${columns} FROM dressing_day_departures
    WHERE local_profile_id = ? AND day_key = ? AND deleted_at IS NULL`, [profileId, dayKey]);
  return row ? {
    id: z.uuid().parse(row.id), localProfileId: row.local_profile_id,
    dayKey: departureDayKeySchema.parse(row.day_key),
    departureAt: z.iso.datetime({ offset: true }).parse(row.departure_at),
    timeZone: departureTimeZoneSchema.parse(row.time_zone),
    createdAt: z.iso.datetime().parse(row.created_at),
    updatedAt: z.iso.datetime().parse(row.updated_at),
    deletedAt: z.iso.datetime().nullable().parse(row.deleted_at),
  } : null;
}

export class SqliteDressingDayDepartureRepository implements DressingDayDepartureRepository {
  private readonly db: SqliteDatabase;
  private readonly createId: () => string;
  private readonly now: () => string;

  constructor(db: SqliteDatabase, createId: () => string, now: () => string) {
    this.db = db;
    this.createId = createId;
    this.now = now;
  }

  get(profileId: string, dayKey: string): Promise<DressingDayDeparture | null> {
    departureDayKeySchema.parse(dayKey);
    return read(this.db, profileId, dayKey);
  }

  async upsert(profileId: string, dayKey: string, departureAt: string,
    timeZone: string): Promise<DressingDayDeparture> {
    departureDayKeySchema.parse(dayKey);
    z.iso.datetime({ offset: true }).parse(departureAt);
    departureTimeZoneSchema.parse(timeZone);
    if (wardrobeDayWindow(departureAt, timeZone)?.key !== dayKey) {
      throw new Error('Departure day does not match its dressing day.');
    }
    const now = z.iso.datetime().parse(this.now());
    let result: DressingDayDeparture | null = null;
    await this.db.withExclusiveTransactionAsync(async (transaction) => {
      await transaction.runAsync(`INSERT INTO dressing_day_departures
        (id, local_profile_id, day_key, departure_at, time_zone, created_at, updated_at, deleted_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, NULL)
        ON CONFLICT(local_profile_id, day_key) DO UPDATE SET
          departure_at = excluded.departure_at, time_zone = excluded.time_zone,
          updated_at = excluded.updated_at, deleted_at = NULL`,
      [z.uuid().parse(this.createId()), profileId, dayKey, departureAt, timeZone, now, now]);
      result = await read(transaction, profileId, dayKey);
    });
    if (!result) throw new Error('Departure write was not readable.');
    return result;
  }

  async clear(profileId: string, dayKey: string): Promise<boolean> {
    departureDayKeySchema.parse(dayKey);
    const now = z.iso.datetime().parse(this.now());
    const result = await this.db.runAsync(`UPDATE dressing_day_departures
      SET deleted_at = ?, updated_at = ?
      WHERE local_profile_id = ? AND day_key = ? AND deleted_at IS NULL`,
    [now, now, profileId, dayKey]);
    return result.changes > 0;
  }
}
