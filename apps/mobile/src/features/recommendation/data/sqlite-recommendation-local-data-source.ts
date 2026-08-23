import {
  RecommendationDataSourceError,
  type RecommendationLocalDataSource,
  type RecommendationSnapshotRecord,
} from '@/features/recommendation/data/recommendation-local-data-source';
import type { SqliteDatabase } from '@/infrastructure/sqlite/sqlite-database';

type RecommendationSnapshotRow = Readonly<{
  id: string;
  local_profile_id: string;
  weather_snapshot_id: string;
  location_key: string;
  generation_mode: string;
  context_json: string;
  outfits_json: string;
  created_at: string;
  updated_at: string;
}>;

function mapRow(row: RecommendationSnapshotRow): RecommendationSnapshotRecord {
  return {
    id: row.id,
    localProfileId: row.local_profile_id,
    weatherSnapshotId: row.weather_snapshot_id,
    locationKey: row.location_key,
    generationMode: row.generation_mode,
    contextJson: row.context_json,
    outfitsJson: row.outfits_json,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class SqliteRecommendationLocalDataSource implements RecommendationLocalDataSource {
  private readonly database: SqliteDatabase;

  constructor(database: SqliteDatabase) {
    this.database = database;
  }

  async getSnapshot(localProfileId: string): Promise<RecommendationSnapshotRecord | null> {
    const row = await this.database.getFirstAsync<RecommendationSnapshotRow>(
      `SELECT * FROM recommendation_snapshots WHERE local_profile_id = ?`,
      [localProfileId],
    );
    return row ? mapRow(row) : null;
  }

  async replaceSnapshot(
    record: RecommendationSnapshotRecord,
  ): Promise<RecommendationSnapshotRecord> {
    let result: RecommendationSnapshotRecord | null = null;
    await this.database.withExclusiveTransactionAsync(async (transaction) => {
      await transaction.runAsync(
        `INSERT INTO recommendation_snapshots (
          id, local_profile_id, weather_snapshot_id, location_key, generation_mode,
          context_json, outfits_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(local_profile_id) DO UPDATE SET
          weather_snapshot_id = excluded.weather_snapshot_id,
          location_key = excluded.location_key,
          generation_mode = excluded.generation_mode,
          context_json = excluded.context_json,
          outfits_json = excluded.outfits_json,
          updated_at = excluded.updated_at`,
        [
          record.id,
          record.localProfileId,
          record.weatherSnapshotId,
          record.locationKey,
          record.generationMode,
          record.contextJson,
          record.outfitsJson,
          record.createdAt,
          record.updatedAt,
        ],
      );
      const row = await transaction.getFirstAsync<RecommendationSnapshotRow>(
        `SELECT * FROM recommendation_snapshots WHERE local_profile_id = ?`,
        [record.localProfileId],
      );
      result = row ? mapRow(row) : null;
    });
    if (!result) throw new RecommendationDataSourceError();
    return result;
  }
}
