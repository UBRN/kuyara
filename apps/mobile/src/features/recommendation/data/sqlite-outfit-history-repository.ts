import { z } from 'zod';

import {
  bareHistoryDayKeySchema,
  wornOutfitSchema,
  wornPieceColorsFor,
  type HistoryPhotoChange,
  type HistoryPhotoStorage,
  type OutfitHistoryRecord,
  type OutfitHistoryRepository,
  type WornOutfit,
  type WornPieceColors,
} from '@/features/recommendation/domain/outfit-history';
import type { SqliteDatabase, SqliteExecutor } from '@/infrastructure/sqlite/sqlite-database';
import { isManagedHistoryPhotoPath } from '@/features/recommendation/data/history-photo-path';

type Row = Readonly<{
  id: string; local_profile_id: string; day_key: string; outfit_json: string;
  piece_colors_json: string | null; photo_path: string | null; worn_at: string; created_at: string;
  updated_at: string; deleted_at: string | null;
}>;

const uuidV4 = z.uuid().refine((value) => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));
const columns = `id, local_profile_id, day_key, outfit_json, piece_colors_json, photo_path, worn_at,
  created_at, updated_at, deleted_at`;

/**
 * File cleanup is best effort and always follows the database step, which has already decided
 * the outcome: a photo that cannot be removed is a leftover the Closet never reads (a missing
 * file does not break it), so the failure is dropped rather than masking that outcome.
 */
function bestEffort(cleanup: Promise<unknown>): Promise<void> {
  return cleanup.then(() => undefined, () => undefined);
}

/**
 * The stored piece colours as the record carries them. They only colour History, so a value
 * that is missing (every day recorded before migration 24) or unreadable is dropped to null
 * here, the day is drawn in the fixed scheme, and the rest of the row still reads.
 */
function storedPieceColors(outfit: WornOutfit, json: string | null): WornPieceColors | null {
  if (json === null) return null;
  try {
    return wornPieceColorsFor(outfit, JSON.parse(json));
  } catch {
    return null;
  }
}

function mapRow(row: Row): OutfitHistoryRecord {
  const outfit = wornOutfitSchema.parse(JSON.parse(row.outfit_json));
  return {
    id: uuidV4.parse(row.id),
    localProfileId: z.string().min(1).parse(row.local_profile_id),
    dayKey: bareHistoryDayKeySchema.parse(row.day_key),
    outfit,
    pieceColors: storedPieceColors(outfit, row.piece_colors_json),
    photoPath: row.photo_path === null || isManagedHistoryPhotoPath(row.photo_path) ? row.photo_path : null,
    wornAt: z.iso.datetime().parse(row.worn_at),
    createdAt: z.iso.datetime().parse(row.created_at),
    updatedAt: z.iso.datetime().parse(row.updated_at),
    deletedAt: z.iso.datetime().nullable().parse(row.deleted_at),
  };
}

function validRows(rows: readonly Row[]): OutfitHistoryRecord[] {
  const records: OutfitHistoryRecord[] = [];
  for (const row of rows) {
    try {
      records.push(mapRow(row));
    } catch {
      // One invalid record must not hide the other days in history.
    }
  }
  return records;
}

async function readRow(db: SqliteExecutor, profileId: string, dayKey: string): Promise<Row | null> {
  return db.getFirstAsync<Row>(`SELECT ${columns} FROM outfit_history
    WHERE local_profile_id = ? AND day_key = ? AND deleted_at IS NULL`, [profileId, dayKey]);
}

/** A row that no longer validates is absent for the reader, as it is in `list`. */
async function read(db: SqliteExecutor, profileId: string, dayKey: string): Promise<OutfitHistoryRecord | null> {
  const row = await readRow(db, profileId, dayKey);
  if (!row) return null;
  try {
    return mapRow(row);
  } catch {
    return null;
  }
}

/** The stored photo of the day's row, valid or not, so an overwrite or delete still cleans it up. */
function managedPhotoPath(row: Row | null): string | null {
  return row && row.photo_path !== null && isManagedHistoryPhotoPath(row.photo_path) ? row.photo_path : null;
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
    return validRows(rows);
  }

  async lastSeven(profileId: string): Promise<readonly OutfitHistoryRecord[]> {
    const rows = await this.db.getAllAsync<Row>(`SELECT ${columns} FROM outfit_history
      WHERE local_profile_id = ? AND deleted_at IS NULL ORDER BY day_key DESC`, [profileId]);
    return validRows(rows).slice(0, 7);
  }

  async log(profileId: string, dayKey: string, outfit: WornOutfit,
    photo: HistoryPhotoChange, pieceColors: WornPieceColors | null,
  ): Promise<OutfitHistoryRecord> {
    // A write replaces the stored colours, so one that does not state them would erase them.
    if (pieceColors === undefined) throw new Error('History write must state its piece colours.');
    bareHistoryDayKeySchema.parse(dayKey);
    const validated = wornOutfitSchema.parse(outfit);
    // Colours that do not fit the outfit are not stored: the day is still recorded, drawn in
    // the fixed scheme. A new outfit for the day always replaces the old outfit's colours.
    const colors = pieceColors === null ? null : wornPieceColorsFor(validated, pieceColors);
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
        outcome.oldPhotoPath = managedPhotoPath(await readRow(transaction, profileId, dayKey));
        const nextPath = photo.kind === 'keep' ? outcome.oldPhotoPath : copied;
        await transaction.runAsync(`INSERT INTO outfit_history
          (id, local_profile_id, day_key, outfit_json, piece_colors_json, photo_path, worn_at, created_at,
            updated_at, deleted_at, pending_sync)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 1)
          ON CONFLICT(local_profile_id, day_key) DO UPDATE SET
            outfit_json = excluded.outfit_json, piece_colors_json = excluded.piece_colors_json,
            photo_path = excluded.photo_path,
            worn_at = excluded.worn_at, updated_at = excluded.updated_at, deleted_at = NULL,
            pending_sync = 1`,
        [uuidV4.parse(this.createId()), profileId, dayKey, JSON.stringify(validated),
          colors === null ? null : JSON.stringify(colors), nextPath,
          timestamp, timestamp, timestamp]);
        outcome.result = await read(transaction, profileId, dayKey);
        if (!outcome.result) throw new Error('History write was not readable.');
      });
    } catch (error) {
      if (copied) await bestEffort(this.photos.deleteStored(copied));
      throw error;
    }
    const result = outcome.result;
    if (!result) throw new Error('History write was not readable.');
    if (photo.kind === 'replace') {
      await bestEffort(this.photos.discardStaged(photo.stagedUri));
    }
    if (outcome.oldPhotoPath && outcome.oldPhotoPath !== result.photoPath) {
      await bestEffort(this.photos.deleteStored(outcome.oldPhotoPath));
    }
    return result;
  }

  async softDelete(profileId: string, dayKey: string): Promise<boolean> {
    bareHistoryDayKeySchema.parse(dayKey);
    const now = z.iso.datetime().parse(this.now());
    let oldPhotoPath: string | null = null;
    let changed = false;
    await this.db.withExclusiveTransactionAsync(async (transaction) => {
      const old = await readRow(transaction, profileId, dayKey);
      if (!old) return;
      const updated = await transaction.runAsync(`UPDATE outfit_history SET
        photo_path = NULL, deleted_at = ?, updated_at = ?, pending_sync = 1
        WHERE local_profile_id = ? AND day_key = ? AND deleted_at IS NULL`,
      [now, now, profileId, dayKey]);
      changed = updated.changes > 0;
      if (changed) oldPhotoPath = managedPhotoPath(old);
    });
    if (oldPhotoPath) await bestEffort(this.photos.deleteStored(oldPhotoPath));
    return changed;
  }
}
