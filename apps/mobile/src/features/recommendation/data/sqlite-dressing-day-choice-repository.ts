import type { DressStyle, StyleAesthetic } from '@kuyara/contracts';

import {
  dressingDayChoiceSourceSchema,
  dressingDayKeySchema,
  dailyStyleAestheticsSchema,
  parseDressingDayChoice,
  type DressingDayChoice,
  type DressingDayChoiceRepository,
  type DressingDayChoiceSource,
} from '@/features/recommendation/domain/dressing-day-choice';
import type { SqliteDatabase, SqliteExecutor } from '@/infrastructure/sqlite/sqlite-database';

type Row = Readonly<{
  id: string;
  local_profile_id: string;
  day_key: string;
  formality: string;
  source: string;
  style_aesthetics: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}>;

async function read(db: SqliteExecutor, profileId: string, dayKey: string): Promise<DressingDayChoice | null> {
  const row = await db.getFirstAsync<Row>(
    `SELECT id, local_profile_id, day_key, formality, source, style_aesthetics, created_at, updated_at, deleted_at
     FROM dressing_day_choices WHERE local_profile_id = ? AND day_key = ? AND deleted_at IS NULL`,
    [profileId, dayKey],
  );
  return row ? parseDressingDayChoice({
    id: row.id, localProfileId: row.local_profile_id, dayKey: row.day_key,
    formality: row.formality, source: row.source,
    styleAesthetics: row.style_aesthetics === null ? null : JSON.parse(row.style_aesthetics),
    createdAt: row.created_at,
    updatedAt: row.updated_at, deletedAt: row.deleted_at,
  }) : null;
}

export class SqliteDressingDayChoiceRepository implements DressingDayChoiceRepository {
  private readonly database: SqliteDatabase;
  private readonly createId: () => string;
  private readonly now: () => string;

  constructor(
    database: SqliteDatabase,
    createId: () => string,
    now: () => string,
  ) {
    this.database = database;
    this.createId = createId;
    this.now = now;
  }

  get(profileId: string, dayKey: string): Promise<DressingDayChoice | null> {
    if (!dressingDayKeySchema.safeParse(dayKey).success) return Promise.reject(new Error('Invalid day key.'));
    return read(this.database, profileId, dayKey);
  }

  async upsert(profileId: string, dayKey: string, formality: DressStyle,
    source: DressingDayChoiceSource, styleAesthetics?: readonly StyleAesthetic[] | null): Promise<DressingDayChoice> {
    if (!dressingDayKeySchema.safeParse(dayKey).success ||
        !dressingDayChoiceSourceSchema.safeParse(source).success ||
        (styleAesthetics != null && !dailyStyleAestheticsSchema.safeParse(styleAesthetics).success))
      throw new Error('Invalid choice.');
    const sortedStyles = styleAesthetics == null ? null : JSON.stringify([...styleAesthetics].sort());
    let choice: DressingDayChoice | null = null;
    await this.database.withExclusiveTransactionAsync(async (transaction) => {
      const now = this.now();
      await transaction.runAsync(
        `INSERT INTO dressing_day_choices
         (id, local_profile_id, day_key, formality, source, style_aesthetics, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)
         ON CONFLICT(local_profile_id, day_key) DO UPDATE SET
           formality = excluded.formality, source = excluded.source,
           style_aesthetics = CASE WHEN ? THEN excluded.style_aesthetics ELSE dressing_day_choices.style_aesthetics END,
           updated_at = excluded.updated_at, deleted_at = NULL`,
        [this.createId(), profileId, dayKey, formality, source, sortedStyles, now, now,
          styleAesthetics === undefined ? 0 : 1],
      );
      choice = await read(transaction, profileId, dayKey);
    });
    if (!choice) throw new Error('The dressing day choice could not be read.');
    return choice;
  }
}
