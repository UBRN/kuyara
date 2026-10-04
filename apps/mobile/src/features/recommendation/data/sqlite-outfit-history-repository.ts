import { z } from 'zod';

import { utcIsoTimestampSchema, uuidV4Schema } from '@/domain/record-identity';
import {
  bareHistoryDayKeySchema,
  sameWornGarments,
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
    id: uuidV4Schema.parse(row.id),
    localProfileId: z.string().min(1).parse(row.local_profile_id),
    dayKey: bareHistoryDayKeySchema.parse(row.day_key),
    outfit,
    pieceColors: storedPieceColors(outfit, row.piece_colors_json),
    photoPath: row.photo_path === null || isManagedHistoryPhotoPath(row.photo_path) ? row.photo_path : null,
    wornAt: utcIsoTimestampSchema.parse(row.worn_at),
    createdAt: utcIsoTimestampSchema.parse(row.created_at),
    updatedAt: utcIsoTimestampSchema.parse(row.updated_at),
    deletedAt: utcIsoTimestampSchema.nullable().parse(row.deleted_at),
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

const live = `FROM outfit_history WHERE local_profile_id = ? AND deleted_at IS NULL`;

async function readDay(db: SqliteExecutor, profileId: string, dayKey: string): Promise<OutfitHistoryRecord[]> {
  return validRows(await db.getAllAsync<Row>(`SELECT ${columns} ${live} AND day_key = ?
    ORDER BY worn_at ASC`, [profileId, dayKey]));
}

async function readLook(db: SqliteExecutor, profileId: string, id: string): Promise<Row | null> {
  return db.getFirstAsync<Row>(`SELECT ${columns} ${live} AND id = ?`, [profileId, id]);
}

/** The stored photo of a row, valid or not, so a delete still cleans it up. */
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

  day(profileId: string, dayKey: string): Promise<readonly OutfitHistoryRecord[]> {
    bareHistoryDayKeySchema.parse(dayKey);
    return readDay(this.db, profileId, dayKey);
  }

  async list(profileId: string): Promise<readonly OutfitHistoryRecord[]> {
    const rows = await this.db.getAllAsync<Row>(`SELECT ${columns} ${live}
      ORDER BY day_key DESC, worn_at ASC`, [profileId]);
    return validRows(rows);
  }

  async lastSeven(profileId: string): Promise<readonly OutfitHistoryRecord[]> {
    const rows = await this.db.getAllAsync<Row>(`SELECT ${columns} ${live}
      ORDER BY day_key DESC, worn_at DESC`, [profileId]);
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
    const timestamp = utcIsoTimestampSchema.parse(this.now());
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
        // The same look twice in one day is one record: it stays as it is, and only a photo
        // change reaches it. Any other look is a new record beside the day's earlier ones.
        const same = (await readDay(transaction, profileId, dayKey))
          .find((look) => sameWornGarments(look.outfit, validated));
        if (same && photo.kind === 'keep') {
          outcome.result = same;
          return;
        }
        let id: string;
        if (same) {
          id = same.id;
          outcome.oldPhotoPath = same.photoPath;
          await transaction.runAsync(`UPDATE outfit_history SET photo_path = ?, updated_at = ?,
            pending_sync = 1 WHERE id = ?`, [copied, timestamp, id]);
        } else {
          id = uuidV4Schema.parse(this.createId());
          await transaction.runAsync(`INSERT INTO outfit_history
            (id, local_profile_id, day_key, outfit_json, piece_colors_json, photo_path, worn_at, created_at,
              updated_at, deleted_at, pending_sync)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 1)`,
          [id, profileId, dayKey, JSON.stringify(validated), colors === null ? null : JSON.stringify(colors),
            copied, timestamp, timestamp, timestamp]);
        }
        const row = await readLook(transaction, profileId, id);
        outcome.result = row ? mapRow(row) : null;
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

  /**
   * The deleted row keeps naming its photo until the file is gone, as a deleted Closet piece
   * does, so a removal that fails now is retried by `cleanupPendingPhotos`.
   */
  async softDelete(profileId: string, id: string): Promise<boolean> {
    const now = utcIsoTimestampSchema.parse(this.now());
    let changed = false;
    await this.db.withExclusiveTransactionAsync(async (transaction) => {
      const old = await readLook(transaction, profileId, id);
      if (!old) return;
      // An unmanaged name is never handed to a file delete, so it is not kept for one either.
      const updated = await transaction.runAsync(`UPDATE outfit_history SET
        photo_path = ?, deleted_at = ?, updated_at = ?, pending_sync = 1
        WHERE local_profile_id = ? AND id = ? AND deleted_at IS NULL`,
      [managedPhotoPath(old), now, now, profileId, id]);
      changed = updated.changes > 0;
    });
    if (changed) await this.cleanupPendingPhotos(profileId, id);
    return changed;
  }

  /**
   * Removes each deleted look's photo that no live look names, then clears the name. Clearing
   * it is device housekeeping, not an edit, so the record's time and sync flag stay as they are.
   * A file that still cannot be removed keeps its name for the next cleanup.
   */
  async cleanupPendingPhotos(profileId: string, id?: string): Promise<void> {
    const pending = await this.db.getAllAsync<Pick<Row, 'id' | 'photo_path'>>(`SELECT id, photo_path
      FROM outfit_history AS pending
      WHERE pending.local_profile_id = ? AND pending.deleted_at IS NOT NULL AND pending.photo_path IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM outfit_history AS active
          WHERE active.deleted_at IS NULL AND active.photo_path = pending.photo_path)
      ORDER BY pending.deleted_at ASC, pending.id ASC`, [profileId]);
    for (const row of pending) {
      if ((id && row.id !== id) || !row.photo_path || !isManagedHistoryPhotoPath(row.photo_path)) continue;
      const path = row.photo_path;
      const removed = await this.photos.deleteStored(path).then(() => true, () => false);
      if (!removed) continue;
      await bestEffort(this.db.runAsync(`UPDATE outfit_history SET photo_path = NULL
        WHERE local_profile_id = ? AND id = ? AND deleted_at IS NOT NULL AND photo_path = ?`,
      [profileId, row.id, path]));
    }
  }
}
