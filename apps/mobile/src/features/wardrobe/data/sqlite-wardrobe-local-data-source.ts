import type { WardrobeItemRecord } from '@/features/wardrobe/data/wardrobe-item-record';
import {
  WardrobeDataSourceError,
  type CreateWardrobeItemRecord,
  type UpdateWardrobeItemRecord,
  type WardrobeLocalDataSource,
} from '@/features/wardrobe/data/wardrobe-local-data-source';
import type {
  SqliteDatabase,
  SqliteExecutor,
} from '@/infrastructure/sqlite/sqlite-database';

type WardrobeItemRow = Readonly<{
  id: string;
  local_profile_id: string;
  name: string | null;
  category: string;
  color: string | null;
  photo_relative_path: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}>;

const wardrobeItemColumns = `
  id,
  local_profile_id,
  name,
  category,
  color,
  photo_relative_path,
  created_at,
  updated_at,
  deleted_at
`;

function mapRow(row: WardrobeItemRow): WardrobeItemRecord {
  return {
    id: row.id,
    localProfileId: row.local_profile_id,
    name: row.name,
    category: row.category,
    color: row.color,
    photoRelativePath: row.photo_relative_path,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

async function readItem(
  database: SqliteExecutor,
  localProfileId: string,
  id: string,
  includeDeleted: boolean,
): Promise<WardrobeItemRecord | null> {
  const deletedClause = includeDeleted ? '' : 'AND deleted_at IS NULL';
  const row = await database.getFirstAsync<WardrobeItemRow>(
    `
      SELECT ${wardrobeItemColumns}
      FROM wardrobe_items
      WHERE id = ? AND local_profile_id = ? ${deletedClause}
    `,
    [id, localProfileId],
  );

  return row ? mapRow(row) : null;
}

export class SqliteWardrobeLocalDataSource implements WardrobeLocalDataSource {
  private readonly database: SqliteDatabase;

  constructor(database: SqliteDatabase) {
    this.database = database;
  }

  async createItem(record: CreateWardrobeItemRecord): Promise<WardrobeItemRecord> {
    let created: WardrobeItemRecord | null = null;

    await this.database.withExclusiveTransactionAsync(async (transaction) => {
      const result = await transaction.runAsync(
        `
          INSERT INTO wardrobe_items (
            id,
            local_profile_id,
            name,
            category,
            color,
            photo_relative_path,
            created_at,
            updated_at,
            deleted_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          record.id,
          record.localProfileId,
          record.name,
          record.category,
          record.color,
          record.photoRelativePath,
          record.createdAt,
          record.updatedAt,
          record.deletedAt,
        ],
      );

      if (result.changes !== 1) {
        throw new WardrobeDataSourceError('write-failed');
      }

      created = await readItem(
        transaction,
        record.localProfileId,
        record.id,
        true,
      );
    });

    if (!created) {
      throw new WardrobeDataSourceError('write-failed');
    }

    return created;
  }

  getActiveItem(localProfileId: string, id: string): Promise<WardrobeItemRecord | null> {
    return readItem(this.database, localProfileId, id, false);
  }

  getItemIncludingDeleted(
    localProfileId: string,
    id: string,
  ): Promise<WardrobeItemRecord | null> {
    return readItem(this.database, localProfileId, id, true);
  }

  async listActiveItems(localProfileId: string): Promise<WardrobeItemRecord[]> {
    const rows = await this.database.getAllAsync<WardrobeItemRow>(
      `
        SELECT ${wardrobeItemColumns}
        FROM wardrobe_items
        WHERE local_profile_id = ? AND deleted_at IS NULL
        ORDER BY updated_at DESC, created_at DESC, id ASC
      `,
      [localProfileId],
    );

    return rows.map(mapRow);
  }

  async updateActiveItem(
    record: UpdateWardrobeItemRecord,
  ): Promise<WardrobeItemRecord | null> {
    let updated: WardrobeItemRecord | null = null;

    await this.database.withExclusiveTransactionAsync(async (transaction) => {
      const result = await transaction.runAsync(
        `
          UPDATE wardrobe_items
          SET
            name = ?,
            category = ?,
            color = ?,
            photo_relative_path = ?,
            updated_at = ?
          WHERE id = ? AND local_profile_id = ? AND deleted_at IS NULL
        `,
        [
          record.name,
          record.category,
          record.color,
          record.photoRelativePath,
          record.updatedAt,
          record.id,
          record.localProfileId,
        ],
      );

      if (result.changes === 0) {
        return;
      }

      if (result.changes !== 1) {
        throw new WardrobeDataSourceError('write-failed');
      }

      updated = await readItem(transaction, record.localProfileId, record.id, false);
    });

    return updated;
  }

  async softDeleteActiveItem(
    localProfileId: string,
    id: string,
    deletedAt: string,
  ): Promise<WardrobeItemRecord | null> {
    let deleted: WardrobeItemRecord | null = null;

    await this.database.withExclusiveTransactionAsync(async (transaction) => {
      const result = await transaction.runAsync(
        `
          UPDATE wardrobe_items
          SET deleted_at = ?, updated_at = ?
          WHERE id = ? AND local_profile_id = ? AND deleted_at IS NULL
        `,
        [deletedAt, deletedAt, id, localProfileId],
      );

      if (result.changes === 0) {
        return;
      }

      if (result.changes !== 1) {
        throw new WardrobeDataSourceError('write-failed');
      }

      deleted = await readItem(transaction, localProfileId, id, true);
    });

    return deleted;
  }
}
