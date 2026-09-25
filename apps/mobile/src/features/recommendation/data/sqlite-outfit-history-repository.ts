import { z } from 'zod';

import {
  bareHistoryDayKeySchema,
  wornOutfitSchema,
  type HistoryPhotoChange,
  type HistoryPhotoStorage,
  type OutfitHistoryRecord,
  type OutfitHistoryRepository,
  type WornOutfit,
} from '@/features/recommendation/domain/outfit-history';
import type { SqliteDatabase, SqliteExecutor } from '@/infrastructure/sqlite/sqlite-database';
import { isManagedHistoryPhotoPath } from '@/features/recommendation/data/history-photo-path';

type Row = Readonly<{
  id: string; local_profile_id: string; day_key: string; outfit_json: string;
  photo_path: string | null; worn_at: string; created_at: string;
  updated_at: string; deleted_at: string | null;
}>;

const uuidV4 = z.uuid().refine((value) => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));
const columns = 'id, local_profile_id, day_key, outfit_json, photo_path, worn_at, created_at, updated_at, deleted_at';

function mapRow(row: Row): OutfitHistoryRecord {
  return {
    id: uuidV4.parse(row.id),
    localProfileId: z.string().min(1).parse(row.local_profile_id),
    dayKey: bareHistoryDayKeySchema.parse(row.day_key),
    outfit: wornOutfitSchema.parse(JSON.parse(row.outfit_json)),
    photoPath: row.photo_path === null || isManagedHistoryPhotoPath(row.photo_path) ? row.photo_path : null,
    wornAt: z.iso.datetime().parse(row.worn_at),
    createdAt: z.iso.datetime().parse(row.created_at),
    updatedAt: z.iso.datetime().parse(row.updated_at),
    deletedAt: z.iso.datetime().nullable().parse(row.deleted_at),
  };
}

async function read(db: SqliteExecutor, profileId: string, dayKey: string): Promise<OutfitHistoryRecord | null> {
  const row = await db.getFirstAsync<Row>(`SELECT ${columns} FROM outfit_history
    WHERE local_profile_id = ? AND day_key = ? AND deleted_at IS NULL`, [profileId, dayKey]);
  return row ? mapRow(row) : null;
}

export class SqliteOutfitHistoryRepository implements OutfitHistoryRepository {
  private readonly db: SqliteDatabase;
  private readonly createId: () => string;
  private readonly now: () => string;
  private readonly photos: HistoryPhotoStorage;

  constructor(
    db: SqliteDatabase, createId: () => string, now: () => string, photos: HistoryPhotoStorage,
  ) {
    this.db = db;
    this.createId = createId;
    this.now = now;
    this.photos = photos;
  }

  get(profileId: string, dayKey: string): Promise<OutfitHistoryRecord | null> {
    bareHistoryDayKeySchema.parse(dayKey);
    return read(this.db, profileId, dayKey);
  }

  async list(profileId: string): Promise<readonly OutfitHistoryRecord[]> {
    const rows = await this.db.getAllAsync<Row>(`SELECT ${columns} FROM outfit_history
      WHERE local_profile_id = ? AND deleted_at IS NULL ORDER BY day_key DESC`, [profileId]);
    return rows.map(mapRow);
  }

  async lastSeven(profileId: string): Promise<readonly OutfitHistoryRecord[]> {
    const rows = await this.db.getAllAsync<Row>(`SELECT ${columns} FROM outfit_history
      WHERE local_profile_id = ? AND deleted_at IS NULL ORDER BY day_key DESC LIMIT 7`, [profileId]);
    return rows.map(mapRow);
  }

  async log(profileId: string, dayKey: string, outfit: WornOutfit,
    photo: HistoryPhotoChange = { kind: 'keep' }): Promise<OutfitHistoryRecord> {
    bareHistoryDayKeySchema.parse(dayKey);
    const validated = wornOutfitSchema.parse(outfit);
    const timestamp = z.iso.datetime().parse(this.now());
    const copied = photo.kind === 'replace' ? await this.photos.copyStaged(photo.stagedUri) : null;
    if (copied !== null && !isManagedHistoryPhotoPath(copied)) {
      await this.photos.deleteStored(copied);
      throw new Error('Invalid history photo path.');
    }
    const outcome: { oldPhotoPath: string | null; result: OutfitHistoryRecord | null } = {
      oldPhotoPath: null, result: null,
    };
    try {
      await this.db.withExclusiveTransactionAsync(async (transaction) => {
        const old = await read(transaction, profileId, dayKey);
        outcome.oldPhotoPath = old?.photoPath ?? null;
        const nextPath = photo.kind === 'keep' ? outcome.oldPhotoPath : copied;
        await transaction.runAsync(`INSERT INTO outfit_history
          (id, local_profile_id, day_key, outfit_json, photo_path, worn_at, created_at, updated_at, deleted_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)
          ON CONFLICT(local_profile_id, day_key) DO UPDATE SET
            outfit_json = excluded.outfit_json, photo_path = excluded.photo_path,
            worn_at = excluded.worn_at, updated_at = excluded.updated_at, deleted_at = NULL`,
        [uuidV4.parse(this.createId()), profileId, dayKey, JSON.stringify(validated), nextPath,
          timestamp, timestamp, timestamp]);
        outcome.result = await read(transaction, profileId, dayKey);
        if (!outcome.result) throw new Error('History write was not readable.');
      });
    } catch (error) {
      if (copied) await this.photos.deleteStored(copied).catch(() => {});
      throw error;
    }
    const result = outcome.result;
    if (!result) throw new Error('History write was not readable.');
    if (photo.kind === 'replace') {
      await this.photos.discardStaged(photo.stagedUri).catch(() => {});
    }
    if (outcome.oldPhotoPath && outcome.oldPhotoPath !== result.photoPath) {
      await this.photos.deleteStored(outcome.oldPhotoPath).catch(() => {});
    }
    return result;
  }

  async softDelete(profileId: string, dayKey: string): Promise<boolean> {
    bareHistoryDayKeySchema.parse(dayKey);
    const now = z.iso.datetime().parse(this.now());
    let oldPhotoPath: string | null = null;
    let changed = false;
    await this.db.withExclusiveTransactionAsync(async (transaction) => {
      const old = await read(transaction, profileId, dayKey);
      if (!old) return;
      const updated = await transaction.runAsync(`UPDATE outfit_history SET
        photo_path = NULL, deleted_at = ?, updated_at = ?
        WHERE local_profile_id = ? AND day_key = ? AND deleted_at IS NULL`,
      [now, now, profileId, dayKey]);
      changed = updated.changes > 0;
      if (changed) oldPhotoPath = old.photoPath;
    });
    if (oldPhotoPath) await this.photos.deleteStored(oldPhotoPath).catch(() => {});
    return changed;
  }
}
