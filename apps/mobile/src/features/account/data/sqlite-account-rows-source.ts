import type { ZodType } from 'zod';

import {
  pendingUpload,
  type AccountRowsSourcePort,
  type LocalAccountRows,
} from '@/features/account/application/account-sync';
import { unlinked, type AccountLink } from '@/features/account/domain/account-link';
import type { MergeResult } from '@/features/account/domain/account-merge';
import type { AccountProfile, AccountRows, SyncedProfile } from '@/features/account/domain/account-rows';
import type { LocalSyncRow } from '@/features/account/domain/sync-rules';
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
// the account; a row new to this phone takes this phone's profile and no photo. Every write is
// one transaction through the shared helper the repositories use, and none of them tells the
// database write listeners: sync's own bookkeeping never schedules another sync pass.

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

const linkOf = (row: LinkRow | null): AccountLink => (row === null ? unlinked : {
  userId: row.linked_user_id,
  lastUserId: row.last_linked_user_id,
  recordsUserId: row.records_user_id,
  recordsConsentRecordedAt: row.records_consent_recorded_at,
  cursor: row.last_pull_cursor,
});

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
 * Lands one account row as a settled row (pending cleared). A pending row is left alone unless
 * `overPending` (the first link, where the account's copy wins). A day-keyed row adopts the
 * account's id. A row the phone cannot store (a constraint this build enforces) is skipped, so
 * one row never stalls every later pass.
 */
async function land<Item extends Keyed>(
  db: SqliteExecutor, write: TableWrite<Item>, profileId: string, row: Item, overPending: boolean,
): Promise<void> {
  const own = await db.getFirstAsync<Flag>(
    `SELECT pending_sync FROM ${write.table} WHERE ${where(write.byDay)}`, whereValues(write.byDay, profileId, row));
  if (own?.pending_sync === 1 && !overPending) return;
  const content = write.values(row);
  try {
    if (own !== null) {
      const assignments = [...write.columns, 'id', 'created_at', 'updated_at', 'deleted_at']
        .map((column) => `${column} = ?`).join(', ');
      await db.runAsync(`UPDATE ${write.table} SET ${assignments}, pending_sync = 0 WHERE ${where(write.byDay)}`,
        [...content, row.id, row.createdAt, row.updatedAt, row.deletedAt, ...whereValues(write.byDay, profileId, row)]);
    } else {
      const columns = ['id', 'local_profile_id', ...(write.byDay ? ['day_key'] : []), ...write.columns,
        'created_at', 'updated_at', 'deleted_at', 'pending_sync'];
      await db.runAsync(`INSERT INTO ${write.table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
        [row.id, profileId, ...(write.byDay ? [row.dayKey ?? ''] : []), ...content,
          row.createdAt, row.updatedAt, row.deletedAt, 0]);
    }
  } catch {
    // Skipped: the phone keeps what it had, and the next first link can bring the row again.
  }
}

/**
 * The account's profile fields on the phone. Display name always; gender and dress style only
 * as a value, never clearing the phone's, because product logic needs both; style aesthetics
 * and dress style only when the profile carries them (the consent).
 */
async function landProfile(db: SqliteExecutor, profile: AccountProfile, overPending: boolean): Promise<void> {
  const consent = profile.dressStyle !== undefined && profile.styleAesthetics !== undefined;
  await db.runAsync(`UPDATE local_profiles SET display_name = ?, gender = COALESCE(?, gender)
    ${consent ? ', dress_style = COALESCE(?, dress_style), style_aesthetics = ?' : ''}, pending_sync = 0
    WHERE singleton_key = 1 ${overPending ? '' : 'AND pending_sync = 0'}`,
  [profile.displayName, profile.gender,
    ...(consent ? [profile.dressStyle ?? null, JSON.stringify(orderStyleAesthetics(profile.styleAesthetics ?? []))] : [])]);
}

async function profileIdOf(db: SqliteExecutor): Promise<string> {
  const row = await db.getFirstAsync<Readonly<{ id: string }>>('SELECT id FROM local_profiles WHERE singleton_key = 1');
  if (row === null) throw new Error('No local profile.');
  return row.id;
}

async function landAll(db: SqliteExecutor, rows: AccountRows, overPending: boolean): Promise<void> {
  if (rows.profile !== null) await landProfile(db, rows.profile, overPending);
  const hasRecords = rows.wardrobeItems.length + rows.dressingDayChoices.length
    + rows.dressingDayDepartures.length + rows.outfitHistory.length > 0;
  if (!hasRecords) return;
  const profileId = await profileIdOf(db);
  for (const item of rows.wardrobeItems) await land(db, wardrobeWrite, profileId, item, overPending);
  for (const choice of rows.dressingDayChoices) await land(db, choiceWrite, profileId, choice, overPending);
  for (const departure of rows.dressingDayDepartures) await land(db, departureWrite, profileId, departure, overPending);
  for (const record of rows.outfitHistory) await land(db, historyWrite, profileId, record, overPending);
}

/** Marks or clears the flag of each row of `rows` by its identity; `updatedAt` when `matchVersion`. */
async function setPending(db: SqliteExecutor, rows: AccountRows, pending: 0 | 1, matchVersion: boolean): Promise<void> {
  const version = matchVersion ? ' AND updated_at = ?' : '';
  if (rows.profile !== null) {
    await db.runAsync(`UPDATE local_profiles SET pending_sync = ? WHERE singleton_key = 1${version}`,
      [pending, ...(matchVersion ? [rows.profile.updatedAt] : [])]);
  }
  const tables: readonly (readonly [TableWrite<never>, readonly Keyed[]])[] = [
    [wardrobeWrite, rows.wardrobeItems], [choiceWrite, rows.dressingDayChoices],
    [departureWrite, rows.dressingDayDepartures], [historyWrite, rows.outfitHistory],
  ];
  if (tables.every(([, items]) => items.length === 0)) return;
  const profileId = await profileIdOf(db);
  for (const [write, items] of tables) {
    for (const row of items) {
      await db.runAsync(`UPDATE ${write.table} SET pending_sync = ? WHERE ${where(write.byDay)}${version}`,
        [pending, ...whereValues(write.byDay, profileId, row), ...(matchVersion ? [row.updatedAt] : [])]);
    }
  }
}

async function saveLinkIn(db: SqliteExecutor, link: AccountLink): Promise<void> {
  await db.runAsync(`UPDATE device_account_link SET linked_user_id = ?, last_linked_user_id = ?,
    records_user_id = ?, records_consent_recorded_at = ?, last_pull_cursor = ? WHERE singleton_key = 1`,
  [link.userId, link.lastUserId, link.recordsUserId, link.recordsConsentRecordedAt, link.cursor]);
}

/** Sync's own writes: kept from the database write listeners, so they never start another pass. */
const quiet: SqliteTransactionOptions = { notifyWrites: false };

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
  const write = (task: (transaction: SqliteExecutor) => Promise<void>) => database.withExclusiveTransactionAsync(task, quiet);

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
      return write(async (transaction) => {
        // Under the consent the merge settles every record it read: what it does not send never
        // uploads. A row written since the read (another identity or `updatedAt`) keeps its flag.
        if (merge.syncConsent) await setPending(transaction, { ...local, profile: null }, 0, true);
        await landAll(transaction, merge.writeToPhone, true);
        await setPending(transaction, merge.sendToAccount, 1, false);
        await saveLinkIn(transaction, link);
      });
    },
    clearPendingIfUnchanged(returned) {
      return write((transaction) => setPending(transaction, returned, 0, true));
    },
    writePulled(rows, cursor) {
      return write(async (transaction) => {
        await landAll(transaction, rows, false);
        await transaction.runAsync('UPDATE device_account_link SET last_pull_cursor = ? WHERE singleton_key = 1', [cursor]);
      });
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
