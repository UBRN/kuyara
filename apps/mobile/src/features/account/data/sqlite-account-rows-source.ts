import { z, type ZodType } from 'zod';

import {
  pendingUpload,
  rowCount,
  type AccountRowsSourcePort,
  type LocalAccountRows,
} from '@/features/account/application/account-sync';
import { unlinked, type AccountLink } from '@/features/account/domain/account-link';
import type { MergeResult } from '@/features/account/domain/account-merge';
import {
  profileFieldsToLand,
  type AccountProfile,
  type AccountRows,
  type SyncedProfile,
} from '@/features/account/domain/account-rows';
import { canonicalServerInstant } from '@/features/account/domain/server-instant';
import { pullCursorAt, type LocalSyncRow, type PullCursor } from '@/features/account/domain/sync-rules';
import {
  breathabilitySchema,
  colorFamilySchema,
  coverageSchema,
  thermalLevelSchema,
  tractionSuitabilitySchema,
  waterProtectionSchema,
  windProtectionSchema,
} from '@/features/catalog/domain/garment-taxonomy';
import {
  dressStyleSchema,
  genderSchema,
  orderStyleAesthetics,
  sortedStyleAesthetics,
} from '@/features/profile/domain/profile';
import { parseDressingDayChoice, type DressingDayChoice } from '@/features/recommendation/domain/dressing-day-choice';
import {
  departureDayKeySchema,
  departureTimeZoneSchema,
  type DressingDayDeparture,
} from '@/features/recommendation/domain/dressing-day-departure';
import {
  bareHistoryDayKeySchema,
  wornOutfitSchema,
  wornPieceColorsFor,
  type OutfitHistoryRecord,
} from '@/features/recommendation/domain/outfit-history';
import { closetColorChoiceFromColumns } from '@/features/wardrobe/domain/closet-color-options';
import {
  garmentTypeIdFromColumn,
  isWardrobeItemCategory,
  wardrobeEntryStateSchema,
  type WardrobeItem,
} from '@/features/wardrobe/domain/wardrobe-item';
import { offsetIsoInstantSchema, utcIsoTimestampSchema, uuidV4Schema } from '@/domain/record-identity';
import type {
  SqliteBindValue,
  SqliteDatabase,
  SqliteExecutor,
  SqliteTransactionOptions,
} from '@/infrastructure/sqlite/sqlite-database';

// The account sync's view of the five synced tables and the device account link (ADR 0041
// sections 3 and 4). It reads every row, soft-deleted ones included, with its pending flag, and
// writes only what sync owns: the synced columns, the clocks and the flag. Device-only columns
// (photo paths, `local_profile_id`, birth date, consents and settings) are never written from
// the account; a row new to this phone takes this phone's profile and no photo. Every write goes
// through the shared transaction helper the repositories use, a large one in transactions of a
// few hundred rows (`writeInBatches`). Sync's bookkeeping (flags,
// link, cursor) tells no database write listener. A pull or first link that lands account rows
// tells them once, so the Closet, History and Profile read the phone again; the lifecycle starts
// no pass for it, because a landed row is settled, not waiting.

type Flag = Readonly<{ pending_sync: number }>;

type ProfileRow = Flag & Readonly<{
  id: string; display_name: string | null; gender: string | null; dress_style: string | null;
  style_aesthetics: string | null; created_at: string; updated_at: string;
}>;

type WardrobeRow = Flag & Readonly<{
  id: string; local_profile_id: string; name: string | null; category: string; entry_state: string;
  garment_type_id: string | null; color: string | null; color_family: string | null;
  color_option_id: string | null; color_custom_hex: string | null; thermal_level_override: string | null;
  water_protection_override: string | null; wind_protection_override: string | null;
  breathability_override: string | null; arm_coverage_override: string | null;
  leg_coverage_override: string | null; traction_suitability_override: string | null;
  photo_relative_path: string | null; created_at: string; updated_at: string; deleted_at: string | null;
}>;

type ChoiceRow = Flag & Readonly<{
  id: string; local_profile_id: string; day_key: string; formality: string; source: string;
  style_aesthetics: string | null; created_at: string; updated_at: string; deleted_at: string | null;
}>;

type DepartureRow = Flag & Readonly<{
  id: string; local_profile_id: string; day_key: string; departure_at: string; time_zone: string;
  created_at: string; updated_at: string; deleted_at: string | null;
}>;

type HistoryRow = Flag & Readonly<{
  id: string; local_profile_id: string; day_key: string; outfit_json: string; piece_colors_json: string | null;
  photo_path: string | null; worn_at: string; created_at: string; updated_at: string; deleted_at: string | null;
}>;

type LinkRow = Readonly<{
  linked_user_id: string | null; last_linked_user_id: string | null; records_user_id: string | null;
  records_consent_recorded_at: string | null; last_pull_cursor: string | null; sign_in_card_dismissed: number;
}>;

const nullable = <Value>(schema: ZodType<Value>, value: unknown): Value | null => (value === null ? null : schema.parse(value));
const clocks = (row: Readonly<{ created_at: string; updated_at: string; deleted_at: string | null }>) => ({
  createdAt: utcIsoTimestampSchema.parse(row.created_at),
  updatedAt: utcIsoTimestampSchema.parse(row.updated_at),
  deletedAt: nullable(utcIsoTimestampSchema, row.deleted_at),
});

/** A stored row this build cannot read stays on the phone and out of sync, as the screens skip it. */
function readable<Row extends Flag, Item>(rows: readonly Row[], map: (row: Row) => Item): LocalSyncRow<Item>[] {
  return rows.flatMap((row) => {
    try {
      return [{ row: map(row), pendingSync: row.pending_sync === 1 }];
    } catch {
      return [];
    }
  });
}

function styleList(json: string | null): unknown {
  try {
    const parsed: unknown = JSON.parse(json ?? '[]');
    return parsed;
  } catch {
    return [];
  }
}

function profileOf(row: ProfileRow): SyncedProfile {
  return {
    displayName: row.display_name,
    gender: genderSchema.safeParse(row.gender).data ?? null,
    dressStyle: dressStyleSchema.safeParse(row.dress_style).data ?? null,
    styleAesthetics: sortedStyleAesthetics(styleList(row.style_aesthetics)),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function wardrobeItemOf(row: WardrobeRow): WardrobeItem {
  if (!isWardrobeItemCategory(row.category)) throw new Error('Unknown category.');
  const colorFamily = nullable(colorFamilySchema, row.color_family);
  return {
    id: uuidV4Schema.parse(row.id),
    localProfileId: row.local_profile_id,
    name: row.name,
    category: row.category,
    entryState: wardrobeEntryStateSchema.parse(row.entry_state),
    garmentTypeId: garmentTypeIdFromColumn(row.garment_type_id),
    color: row.color,
    colorFamily,
    colorChoice: closetColorChoiceFromColumns(row.color_option_id, row.color_custom_hex, colorFamily),
    thermalLevelOverride: nullable(thermalLevelSchema, row.thermal_level_override),
    waterProtectionOverride: nullable(waterProtectionSchema, row.water_protection_override),
    windProtectionOverride: nullable(windProtectionSchema, row.wind_protection_override),
    breathabilityOverride: nullable(breathabilitySchema, row.breathability_override),
    armCoverageOverride: nullable(coverageSchema, row.arm_coverage_override),
    legCoverageOverride: nullable(coverageSchema, row.leg_coverage_override),
    tractionSuitabilityOverride: nullable(tractionSuitabilitySchema, row.traction_suitability_override),
    photoRelativePath: row.photo_relative_path,
    ...clocks(row),
  };
}

function choiceOf(row: ChoiceRow): DressingDayChoice {
  const styleAesthetics: unknown = JSON.parse(row.style_aesthetics ?? 'null');
  return parseDressingDayChoice({
    id: row.id, localProfileId: row.local_profile_id, dayKey: row.day_key, formality: row.formality,
    source: row.source, styleAesthetics,
    createdAt: row.created_at, updatedAt: row.updated_at, deletedAt: row.deleted_at,
  });
}

function departureOf(row: DepartureRow): DressingDayDeparture {
  return {
    id: uuidV4Schema.parse(row.id),
    localProfileId: row.local_profile_id,
    dayKey: departureDayKeySchema.parse(row.day_key),
    departureAt: offsetIsoInstantSchema.parse(row.departure_at),
    timeZone: departureTimeZoneSchema.parse(row.time_zone),
    ...clocks(row),
  };
}

function historyOf(row: HistoryRow): OutfitHistoryRecord {
  const outfit = wornOutfitSchema.parse(JSON.parse(row.outfit_json));
  let pieceColors: OutfitHistoryRecord['pieceColors'] = null;
  try {
    const colors: unknown = JSON.parse(row.piece_colors_json ?? 'null');
    pieceColors = colors === null ? null : wornPieceColorsFor(outfit, colors);
  } catch {
    // Colours only draw History; an unreadable value is none, as the repository reads it.
  }
  return {
    id: uuidV4Schema.parse(row.id),
    localProfileId: row.local_profile_id,
    dayKey: bareHistoryDayKeySchema.parse(row.day_key),
    outfit,
    pieceColors,
    photoPath: row.photo_path,
    wornAt: utcIsoTimestampSchema.parse(row.worn_at),
    ...clocks(row),
  };
}

const storedPosition = z.string().nullable();
const storedCursorSchema = z.object({
  profile: storedPosition,
  wardrobeItems: storedPosition,
  dressingDayChoices: storedPosition,
  dressingDayDepartures: storedPosition,
  outfitHistory: storedPosition,
});

/**
 * `last_pull_cursor` holds each table's position as a JSON object. A value without the object
 * is the one position an older build stored for every table, and reads as that position for
 * each; an unreadable value reads as none, so the next pull reads every row again and lands it
 * idempotently.
 */
function cursorOf(stored: string | null): PullCursor {
  if (stored === null) return pullCursorAt(null);
  if (!stored.startsWith('{')) return pullCursorAt(canonicalServerInstant(stored));
  try {
    return storedCursorSchema.parse(JSON.parse(stored));
  } catch {
    return pullCursorAt(null);
  }
}

const storedCursor = (cursor: PullCursor): string => JSON.stringify(cursor);

const linkOf = (row: LinkRow | null): AccountLink => (row === null ? unlinked : {
  userId: row.linked_user_id,
  lastUserId: row.last_linked_user_id,
  recordsUserId: row.records_user_id,
  recordsConsentRecordedAt: row.records_consent_recorded_at,
  cursor: cursorOf(row.last_pull_cursor),
});

const noRecords = { wardrobeItems: [], dressingDayChoices: [], dressingDayDepartures: [], outfitHistory: [] } as const;

const syncedTables = ['wardrobe_items', 'dressing_day_choices', 'dressing_day_departures', 'outfit_history'] as const;

/**
 * One synced table: how a row is found (by id, or by day for the day-keyed tables) and the
 * columns sync writes, in order. Everything else in the row belongs to the phone.
 */
type TableWrite<Item> = Readonly<{
  table: (typeof syncedTables)[number];
  byDay: boolean;
  columns: readonly string[];
  values: (item: Item) => readonly SqliteBindValue[];
}>;

const wardrobeWrite: TableWrite<WardrobeItem> = {
  table: 'wardrobe_items',
  byDay: false,
  columns: ['name', 'category', 'entry_state', 'garment_type_id', 'color', 'color_family', 'color_option_id',
    'color_custom_hex', 'thermal_level_override', 'water_protection_override', 'wind_protection_override',
    'breathability_override', 'arm_coverage_override', 'leg_coverage_override', 'traction_suitability_override'],
  values: (item) => [item.name, item.category, item.entryState, item.garmentTypeId, item.color, item.colorFamily,
    item.colorChoice?.kind === 'option' ? item.colorChoice.id : null,
    item.colorChoice?.kind === 'custom' ? item.colorChoice.hex : null,
    item.thermalLevelOverride, item.waterProtectionOverride, item.windProtectionOverride, item.breathabilityOverride,
    item.armCoverageOverride, item.legCoverageOverride, item.tractionSuitabilityOverride],
};

const choiceWrite: TableWrite<DressingDayChoice> = {
  table: 'dressing_day_choices',
  byDay: true,
  columns: ['formality', 'source', 'style_aesthetics'],
  values: (choice) => [choice.formality, choice.source,
    choice.styleAesthetics === null ? null : JSON.stringify(orderStyleAesthetics(choice.styleAesthetics))],
};

const departureWrite: TableWrite<DressingDayDeparture> = {
  table: 'dressing_day_departures',
  byDay: true,
  columns: ['departure_at', 'time_zone'],
  values: (departure) => [departure.departureAt, departure.timeZone],
};

const historyWrite: TableWrite<OutfitHistoryRecord> = {
  table: 'outfit_history',
  byDay: false,
  columns: ['day_key', 'outfit_json', 'piece_colors_json', 'worn_at'],
  values: (record) => [record.dayKey, JSON.stringify(record.outfit),
    record.pieceColors === null ? null : JSON.stringify(record.pieceColors), record.wornAt],
};

type Keyed = Readonly<{ id: string; dayKey?: string; createdAt: string; updatedAt: string; deletedAt: string | null }>;

const where = (byDay: boolean) => (byDay ? 'local_profile_id = ? AND day_key = ?' : 'id = ?');
const whereValues = (byDay: boolean, profileId: string, row: Keyed) =>
  (byDay ? [profileId, row.dayKey ?? ''] : [row.id]);

/**
 * Lands one account row as a settled row (pending cleared), in one statement: inserted when the
 * phone lacks it, else written over the phone's copy unless that copy is pending, which waits to
 * upload and whose later arrival wins on the account. A day-keyed row is found by its day and
 * adopts the account's id. A row the phone cannot store (a constraint this build enforces) is
 * skipped, so one row never stalls every later pass; any other write failure throws.
 */
async function land<Item extends Keyed>(
  db: SqliteExecutor, write: TableWrite<Item>, profileId: string, row: Item,
): Promise<void> {
  const columns = ['id', 'local_profile_id', ...(write.byDay ? ['day_key'] : []), ...write.columns,
    'created_at', 'updated_at', 'deleted_at', 'pending_sync'];
  const overwritten = [...write.columns, 'id', 'created_at', 'updated_at', 'deleted_at', 'pending_sync'];
  try {
    await db.runAsync(`INSERT INTO ${write.table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})
      ON CONFLICT (${write.byDay ? 'local_profile_id, day_key' : 'id'}) DO UPDATE
      SET ${overwritten.map((column) => `${column} = excluded.${column}`).join(', ')}
      WHERE ${write.table}.pending_sync = 0`,
    [row.id, profileId, ...(write.byDay ? [row.dayKey ?? ''] : []), ...write.values(row),
      row.createdAt, row.updatedAt, row.deletedAt, 0]);
  } catch (error) {
    // Only a constraint failure is skipped: the phone keeps what it had, and the next first link
    // can bring the row again. Any other failure (a full disk, an I/O error) fails the whole pass,
    // so its pull cursor stays where it was.
    if (!(error instanceof Error && /constraint failed/i.test(error.message))) throw error;
  }
}

/** The account's profile fields on the phone, as `profileFieldsToLand` decides, unless an edit waits. */
async function landProfile(db: SqliteExecutor, profile: AccountProfile): Promise<void> {
  const fields = profileFieldsToLand(profile);
  const columns: (readonly [string, SqliteBindValue])[] = [['display_name', fields.displayName]];
  if (fields.gender !== undefined) columns.push(['gender', fields.gender]);
  if (fields.dressStyle !== undefined) columns.push(['dress_style', fields.dressStyle]);
  if (fields.styleAesthetics !== undefined) {
    columns.push(['style_aesthetics', JSON.stringify(orderStyleAesthetics(fields.styleAesthetics))]);
  }
  await db.runAsync(`UPDATE local_profiles SET ${columns.map(([column]) => `${column} = ?`).join(', ')}, pending_sync = 0
    WHERE singleton_key = 1 AND pending_sync = 0`, columns.map(([, value]) => value));
}

async function profileIdOf(db: SqliteExecutor): Promise<string> {
  const row = await db.getFirstAsync<Readonly<{ id: string }>>('SELECT id FROM local_profiles WHERE singleton_key = 1');
  if (row === null) throw new Error('No local profile.');
  return row.id;
}

/** One row's write inside a batched write (`writeInBatches`). */
type RowWrite = (db: SqliteExecutor) => Promise<void>;

/** This phone's profile id, read at most once and only when a record row needs it. */
function profileIdReader(database: SqliteExecutor): () => Promise<string> {
  let id: Promise<string> | null = null;
  return () => (id ??= profileIdOf(database));
}

const recordTables = (rows: AccountRows): readonly (readonly [TableWrite<never>, readonly Keyed[]])[] => [
  [wardrobeWrite, rows.wardrobeItems], [choiceWrite, rows.dressingDayChoices],
  [departureWrite, rows.dressingDayDepartures], [historyWrite, rows.outfitHistory],
];

/** Landing every row of `rows` that is not waiting to upload, one write per row. */
function landWrites(rows: AccountRows, profileId: () => Promise<string>): RowWrite[] {
  const { profile } = rows;
  const landEach = <Item extends Keyed>(write: TableWrite<Item>, items: readonly Item[]) =>
    items.map((row) => async (db: SqliteExecutor) => land(db, write, await profileId(), row));
  return [
    ...(profile === null ? [] : [(db: SqliteExecutor) => landProfile(db, profile)]),
    ...landEach(wardrobeWrite, rows.wardrobeItems),
    ...landEach(choiceWrite, rows.dressingDayChoices),
    ...landEach(departureWrite, rows.dressingDayDepartures),
    ...landEach(historyWrite, rows.outfitHistory),
  ];
}

/** Marking or clearing the flag of each row of `rows` by its identity; `updatedAt` too when `matchVersion`. */
function flagWrites(rows: AccountRows, profileId: () => Promise<string>, pending: 0 | 1, matchVersion: boolean): RowWrite[] {
  const version = matchVersion ? ' AND updated_at = ?' : '';
  const { profile } = rows;
  return [
    ...(profile === null ? [] : [async (db: SqliteExecutor) => {
      await db.runAsync(`UPDATE local_profiles SET pending_sync = ? WHERE singleton_key = 1${version}`,
        [pending, ...(matchVersion ? [profile.updatedAt] : [])]);
    }]),
    ...recordTables(rows).flatMap(([write, items]) => items.map((row) => async (db: SqliteExecutor) => {
      await db.runAsync(`UPDATE ${write.table} SET pending_sync = ? WHERE ${where(write.byDay)}${version}`,
        [pending, ...whereValues(write.byDay, await profileId(), row), ...(matchVersion ? [row.updatedAt] : [])]);
    })),
  ];
}

async function saveLinkIn(db: SqliteExecutor, link: AccountLink): Promise<void> {
  await db.runAsync(`UPDATE device_account_link SET linked_user_id = ?, last_linked_user_id = ?,
    records_user_id = ?, records_consent_recorded_at = ?, last_pull_cursor = ? WHERE singleton_key = 1`,
  [link.userId, link.lastUserId, link.recordsUserId, link.recordsConsentRecordedAt, storedCursor(link.cursor)]);
}

/**
 * Rows written per transaction. Each statement crosses to the native side, and a transaction holds
 * the write lock every other write of the app waits for, at most the database's 5-second busy
 * wait; a few hundred rows stay well inside it, where an account of thousands would not.
 */
const rowsPerTransaction = 250;

/** Sync's bookkeeping: kept from the database write listeners. */
const quiet: SqliteTransactionOptions = { notifyWrites: false };
/** Account rows landing on the phone: the screens read again. */
const landing = (rows: AccountRows): SqliteTransactionOptions => ({ notifyWrites: rowCount(rows) > 0 });

export type SqliteAccountRowsSource = AccountRowsSourcePort & Readonly<{
  /**
   * Whether a row waits to upload: exactly what `read` gives a pass to upload, the profile and,
   * under the consent, the four record tables, so a stored row this build cannot read never
   * starts a pass it would not send.
   */
  hasPending: (records: boolean) => Promise<boolean>;
  /** Deletion (ADR 0041 section 7): the link cleared and every pending flag reset, one transaction. */
  resetAfterDeletion: () => Promise<void>;
  cardDismissed: () => Promise<boolean>;
  dismissCard: () => Promise<void>;
}>;

export function createSqliteAccountRowsSource(database: SqliteDatabase): SqliteAccountRowsSource {
  const all = <Row>(table: string, columns: string, id: string) => database.getAllAsync<Row>(
    `SELECT ${columns}, pending_sync FROM ${table} WHERE local_profile_id = ? ORDER BY rowid`, [id]);
  const write = (task: (transaction: SqliteExecutor) => Promise<void>, options = quiet) =>
    database.withExclusiveTransactionAsync(task, options);
  /**
   * `rows` in transactions of `rowsPerTransaction`, then `finish` in the last one, which alone
   * tells the listeners as `options` says. A failure part way keeps what earlier transactions
   * wrote and skips `finish`, so the link or cursor `finish` saves stays where it was and the pass
   * runs again: every row write lands, settles or flags the same way twice.
   */
  async function writeInBatches(rows: readonly RowWrite[], finish: RowWrite, options: SqliteTransactionOptions) {
    const batches: (readonly RowWrite[])[] = [];
    for (let start = 0; start < rows.length; start += rowsPerTransaction) {
      batches.push(rows.slice(start, start + rowsPerTransaction));
    }
    const last = batches.pop() ?? [];
    for (const batch of batches) {
      await write(async (transaction) => { for (const row of batch) await row(transaction); });
    }
    await write(async (transaction) => {
      for (const row of last) await row(transaction);
      await finish(transaction);
    }, options);
  }

  async function read(): Promise<LocalAccountRows> {
    const profile = await database.getFirstAsync<ProfileRow>(`SELECT id, display_name, gender, dress_style,
      style_aesthetics, created_at, updated_at, pending_sync FROM local_profiles WHERE singleton_key = 1`);
    if (profile === null) {
      return { profile: null, wardrobeItems: [], dressingDayChoices: [], dressingDayDepartures: [], outfitHistory: [] };
    }
    return {
      profile: readable([profile], profileOf)[0] ?? null,
      wardrobeItems: readable(await all<WardrobeRow>('wardrobe_items', `id, local_profile_id, name, category,
        entry_state, garment_type_id, color, color_family, color_option_id, color_custom_hex,
        thermal_level_override, water_protection_override, wind_protection_override, breathability_override,
        arm_coverage_override, leg_coverage_override, traction_suitability_override, photo_relative_path,
        created_at, updated_at, deleted_at`, profile.id), wardrobeItemOf),
      dressingDayChoices: readable(await all<ChoiceRow>('dressing_day_choices', `id, local_profile_id, day_key,
        formality, source, style_aesthetics, created_at, updated_at, deleted_at`, profile.id), choiceOf),
      dressingDayDepartures: readable(await all<DepartureRow>('dressing_day_departures', `id, local_profile_id,
        day_key, departure_at, time_zone, created_at, updated_at, deleted_at`, profile.id), departureOf),
      outfitHistory: readable(await all<HistoryRow>('outfit_history', `id, local_profile_id, day_key, outfit_json,
        piece_colors_json, photo_path, worn_at, created_at, updated_at, deleted_at`, profile.id), historyOf),
    };
  }

  return {
    read,
    async link() {
      return linkOf(await database.getFirstAsync<LinkRow>('SELECT * FROM device_account_link WHERE singleton_key = 1'));
    },
    saveLink: (link) => write((transaction) => saveLinkIn(transaction, link)),
    applyFirstLink(merge: MergeResult, link: AccountLink, local: AccountRows) {
      const profileId = profileIdReader(database);
      // The merge settles the profile it read and, under the consent, every record it read: the
      // account's copy lands over it, and what it does not send never uploads. A row written
      // since the read (another identity or `updatedAt`) keeps its flag, so the account's copy
      // does not land over it and the edit uploads with the next pass. The link is saved last, so
      // a first link that stops part way runs again whole.
      return writeInBatches([
        ...flagWrites(merge.syncConsent ? local : { ...noRecords, profile: local.profile }, profileId, 0, true),
        ...landWrites(merge.writeToPhone, profileId),
        ...flagWrites(merge.sendToAccount, profileId, 1, false),
      ], (transaction) => saveLinkIn(transaction, link), landing(merge.writeToPhone));
    },
    clearPendingIfUnchanged(returned) {
      return writeInBatches(flagWrites(returned, profileIdReader(database), 0, true), async () => {}, quiet);
    },
    writePulled(rows, cursor) {
      return writeInBatches(landWrites(rows, profileIdReader(database)), async (transaction) => {
        await transaction.runAsync('UPDATE device_account_link SET last_pull_cursor = ? WHERE singleton_key = 1', [storedCursor(cursor)]);
      }, landing(rows));
    },
    async hasPending(records) {
      // A cheap check first: nothing flagged at all means nothing to read.
      const tables = ['local_profiles', ...(records ? syncedTables : [])];
      const row = await database.getFirstAsync<Readonly<{ pending: number }>>(
        `SELECT ${tables.map((table) => `EXISTS (SELECT 1 FROM ${table} WHERE pending_sync = 1)`).join(' OR ')} AS pending`);
      return row?.pending === 1 && pendingUpload(await read(), records) !== null;
    },
    resetAfterDeletion() {
      return write(async (transaction) => {
        for (const table of ['local_profiles', ...syncedTables]) {
          await transaction.runAsync(`UPDATE ${table} SET pending_sync = 0 WHERE pending_sync = 1`);
        }
        await saveLinkIn(transaction, unlinked);
      });
    },
    async cardDismissed() {
      const row = await database.getFirstAsync<LinkRow>('SELECT * FROM device_account_link WHERE singleton_key = 1');
      return row?.sign_in_card_dismissed === 1;
    },
    dismissCard() {
      return write(async (transaction) => {
        await transaction.runAsync('UPDATE device_account_link SET sign_in_card_dismissed = 1 WHERE singleton_key = 1');
      });
    },
  };
}
