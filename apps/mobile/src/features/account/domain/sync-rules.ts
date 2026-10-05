import type { AccountProfile, AccountRows } from '@/features/account/domain/account-rows';

// The ongoing sync rules of ADR 0041 section 4. The phone holds one flag per row, `pendingSync`,
// set by every local write; the server stamps each row on arrival, and that stamp (never a
// device clock) orders writes. These functions decide; the caller reads, writes and uploads.

/** A phone row with the flag the write path keeps. */
export type LocalSyncRow<Item> = Readonly<{ row: Item; pendingSync: boolean }>;

/** A pulled row that passed the remote boundary, with its arrival stamp in canonical form. */
export type PulledSyncRow<Item> = Readonly<{ row: Item; serverUpdatedAt: string }>;

type IdRow = Readonly<{ id: string; deletedAt: string | null }>;
type DayRow = IdRow & Readonly<{ dayKey: string }>;

const keyById = (row: IdRow) => row.id;
const keyByDay = (row: DayRow) => row.dayKey;

export function pendingRows<Item>(local: readonly LocalSyncRow<Item>[]): readonly Item[] {
  return local.filter((entry) => entry.pendingSync).map((entry) => entry.row);
}

/**
 * The rows a pull writes to the phone. Per key the latest arrival wins; it overwrites a row that
 * is not pending (a deletion marker is a write like any other) and never a pending row, whose
 * upload will settle it. A marker for a row the phone never held is not worth writing.
 */
function applyPulled<Item extends IdRow>(
  local: readonly LocalSyncRow<Item>[],
  pulled: readonly PulledSyncRow<Item>[],
  key: (row: Item) => string,
): readonly Item[] {
  const localByKey = new Map(local.map((entry) => [key(entry.row), entry]));
  const latest = new Map<string, Item>();
  for (const { row } of [...pulled].sort((a, b) => Number(a.serverUpdatedAt > b.serverUpdatedAt) - Number(a.serverUpdatedAt < b.serverUpdatedAt))) {
    latest.set(key(row), row);
  }
  const write: Item[] = [];
  for (const [rowKey, row] of latest) {
    const own = localByKey.get(rowKey);
    if (own?.pendingSync) continue;
    if (own === undefined && row.deletedAt !== null) continue;
    write.push(row);
  }
  return write;
}

export function applyPulledById<Item extends IdRow>(
  local: readonly LocalSyncRow<Item>[],
  pulled: readonly PulledSyncRow<Item>[],
): readonly Item[] {
  return applyPulled(local, pulled, keyById);
}

/**
 * Daily choices and departures are keyed by day: a same-day row under another id overwrites, and
 * the phone adopts its id. History holds several looks a day and is keyed by id.
 */
export function applyPulledByDay<Item extends DayRow>(
  local: readonly LocalSyncRow<Item>[],
  pulled: readonly PulledSyncRow<Item>[],
): readonly Item[] {
  return applyPulled(local, pulled, keyByDay);
}

/** The single profile row: a pull writes it unless the phone's own edit is still waiting. */
export function applyPulledProfile(
  local: Readonly<{ pendingSync: boolean }>,
  pulled: AccountProfile | null,
): AccountProfile | null {
  return local.pendingSync ? null : pulled;
}

/** A table a pull reads, named as in `AccountRows`. */
export type AccountTable = keyof AccountRows;

export const accountTables = [
  'profile', 'wardrobeItems', 'dressingDayChoices', 'dressingDayDepartures', 'outfitHistory',
] as const satisfies readonly AccountTable[];

/**
 * The pull cursor: for each table, the latest arrival seen there, null before any. A pull reads
 * the tables side by side and a long one can take seconds longer than a short one, so each table
 * keeps its own position: a late arrival in one table never moves another past a row that
 * committed there after it was read.
 */
export type PullCursor = Readonly<Record<AccountTable, string | null>>;

/** Every table at one position: none yet (null), or the single position an older build stored. */
export function pullCursorAt(position: string | null): PullCursor {
  return { profile: position, wardrobeItems: position, dressingDayChoices: position, dressingDayDepartures: position, outfitHistory: position };
}

/** An arrival a pull saw in `table`, refused rows included, so an unknown row never stalls its table. */
export type PullArrival = Readonly<{ table: AccountTable; serverUpdatedAt: string | null }>;

/** The pull cursor after `arrivals`: per table the latest arrival seen, never earlier than before. */
export function nextCursor(previous: PullCursor, arrivals: readonly PullArrival[]): PullCursor {
  const next = { ...previous };
  for (const { table, serverUpdatedAt } of arrivals) {
    const latest = next[table];
    if (serverUpdatedAt !== null && (latest === null || serverUpdatedAt > latest)) next[table] = serverUpdatedAt;
  }
  return next;
}
