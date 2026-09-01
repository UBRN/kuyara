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
  entry_state: string;
  garment_type_id: string | null;
  color: string | null;
  color_family: string | null;
  thermal_level_override: string | null;
  water_protection_override: string | null;
  wind_protection_override: string | null;
  breathability_override: string | null;
  arm_coverage_override: string | null;
  leg_coverage_override: string | null;
  traction_suitability_override: string | null;
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
  entry_state,
  garment_type_id,
  color,
  color_family,
  thermal_level_override,
  water_protection_override,
  wind_protection_override,
  breathability_override,
  arm_coverage_override,
  leg_coverage_override,
  traction_suitability_override,
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
    entryState: row.entry_state,
    garmentTypeId: row.garment_type_id,
    color: row.color,
    colorFamily: row.color_family,
    thermalLevelOverride: row.thermal_level_override,
    waterProtectionOverride: row.water_protection_override,
    windProtectionOverride: row.wind_protection_override,
    breathabilityOverride: row.breathability_override,
    armCoverageOverride: row.arm_coverage_override,
    legCoverageOverride: row.leg_coverage_override,
    tractionSuitabilityOverride: row.traction_suitability_override,
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
            entry_state,
            garment_type_id,
            color,
            color_family,
            thermal_level_override,
            water_protection_override,
            wind_protection_override,
            breathability_override,
            arm_coverage_override,
            leg_coverage_override,
            traction_suitability_override,
            photo_relative_path,
            created_at,
            updated_at,
            deleted_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          record.id,
          record.localProfileId,
          record.name,
          record.category,
          record.entryState,
          record.garmentTypeId,
          record.color,
          record.colorFamily,
          record.thermalLevelOverride,
          record.waterProtectionOverride,
          record.windProtectionOverride,
          record.breathabilityOverride,
          record.armCoverageOverride,
          record.legCoverageOverride,
          record.tractionSuitabilityOverride,
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

  async listPendingPhotoCleanup(localProfileId: string): Promise<WardrobeItemRecord[]> {
    const rows = await this.database.getAllAsync<WardrobeItemRow>(
      `
        SELECT ${wardrobeItemColumns}
        FROM wardrobe_items AS pending
        WHERE pending.local_profile_id = ?
          AND pending.deleted_at IS NOT NULL
          AND pending.photo_relative_path IS NOT NULL
          AND NOT EXISTS (
            SELECT 1
            FROM wardrobe_items AS active
            WHERE active.deleted_at IS NULL
              AND active.photo_relative_path = pending.photo_relative_path
          )
        ORDER BY pending.deleted_at ASC, pending.id ASC
      `,
      [localProfileId],
    );

    return rows.map(mapRow);
  }

  async clearPendingPhotoCleanup(
    localProfileId: string,
    id: string,
    photoRelativePath: string,
  ): Promise<boolean> {
    const result = await this.database.runAsync(
      `
        UPDATE wardrobe_items
        SET photo_relative_path = NULL
        WHERE id = ?
          AND local_profile_id = ?
          AND deleted_at IS NOT NULL
          AND photo_relative_path = ?
          AND NOT EXISTS (
            SELECT 1
            FROM wardrobe_items AS active
            WHERE active.deleted_at IS NULL
              AND active.photo_relative_path = wardrobe_items.photo_relative_path
          )
      `,
      [id, localProfileId, photoRelativePath],
    );

    if (result.changes > 1) {
      throw new WardrobeDataSourceError('write-failed');
    }

    return result.changes === 1;
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
            entry_state = ?,
            garment_type_id = ?,
            color = ?,
            color_family = ?,
            thermal_level_override = ?,
            water_protection_override = ?,
            wind_protection_override = ?,
            breathability_override = ?,
            arm_coverage_override = ?,
            leg_coverage_override = ?,
            traction_suitability_override = ?,
            photo_relative_path = ?,
            updated_at = ?
          WHERE id = ? AND local_profile_id = ? AND deleted_at IS NULL
        `,
        [
          record.name,
          record.category,
          record.entryState,
          record.garmentTypeId,
          record.color,
          record.colorFamily,
          record.thermalLevelOverride,
          record.waterProtectionOverride,
          record.windProtectionOverride,
          record.breathabilityOverride,
          record.armCoverageOverride,
          record.legCoverageOverride,
          record.tractionSuitabilityOverride,
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
