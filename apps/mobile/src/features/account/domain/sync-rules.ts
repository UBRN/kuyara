import { syncedProfileOf, type SyncedProfile } from '@/features/account/domain/account-rows';
import type { Profile } from '@/features/profile/domain/profile';

// The ongoing sync rules of ADR 0041 section 4. The phone holds one flag per row, `pendingSync`,
// set by every local write; the server stamps each row on arrival, and that stamp (never a
// device clock) orders writes. These functions decide; the caller reads, writes and uploads.

/** A phone row with the flag the write path keeps. */
export type LocalSyncRow<Item> = Readonly<{ row: Item; pendingSync: boolean }>;

/** A pulled row that passed the remote boundary, with its arrival stamp in canonical form. */
export type PulledSyncRow<Item> = Readonly<{ row: Item; serverUpdatedAt: string }>;

export type UploadOutcome = 'uploaded' | 'nothing-pending' | 'failed';

type IdRow = Readonly<{ id: string; deletedAt: string | null }>;
type DayRow = IdRow & Readonly<{ dayKey: string }>;

export const keyById = (row: IdRow) => row.id;
export const keyByDay = (row: DayRow) => row.dayKey;

export function pendingRows<Item>(local: readonly LocalSyncRow<Item>[]): readonly Item[] {
  return local.filter((entry) => entry.pendingSync).map((entry) => entry.row);
}

/** A sync pass uploads before it pulls, and a failed upload skips the pull: nothing pending is lost. */
export function mayPullAfter(upload: UploadOutcome): boolean {
  return upload !== 'failed';
}

/**
 * The rows a pull writes to the phone. Per key the latest arrival wins; it overwrites a row that
 * is not pending (a deletion marker is a write like any other) and never a pending row, whose
 * upload will settle it. A marker for a row the phone never held is not worth writing. A pulled
 * row lands through `land`, which keeps what never syncs (the photo).
 */
function applyPulled<Item extends IdRow>(
  local: readonly LocalSyncRow<Item>[],
  pulled: readonly PulledSyncRow<Item>[],
  key: (row: Item) => string,
  land: (pulled: Item, local: Item | null) => Item,
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
    write.push(land(row, own?.row ?? null));
  }
  return write;
}

export function applyPulledById<Item extends IdRow>(
  local: readonly LocalSyncRow<Item>[],
  pulled: readonly PulledSyncRow<Item>[],
  land: (pulled: Item, local: Item | null) => Item,
): readonly Item[] {
  return applyPulled(local, pulled, keyById, land);
}

/**
 * Daily choices and departures are keyed by day: a same-day row under another id overwrites, and
 * the phone adopts its id. History holds several looks a day and is keyed by id.
 */
export function applyPulledByDay<Item extends DayRow>(
  local: readonly LocalSyncRow<Item>[],
  pulled: readonly PulledSyncRow<Item>[],
  land: (pulled: Item, local: Item | null) => Item,
): readonly Item[] {
  return applyPulled(local, pulled, keyByDay, land);
}

/** The single profile row: a pull writes it unless the phone's own edit is still waiting. */
export function applyPulledProfile(
  local: Readonly<{ pendingSync: boolean }>,
  pulled: SyncedProfile | null,
): SyncedProfile | null {
  return local.pendingSync ? null : pulled;
}

/**
 * The rows whose pending flag clears after an upload: the server returned the row with the same
 * `updated_at` the phone holds now. A row edited during the upload has moved on and stays pending.
 * Match by the row's identity: `keyById` for the Closet and History, `keyByDay` for daily choices
 * and departures, where the server may hold the day under another id.
 */
export function pendingCleared<Item extends Readonly<{ updatedAt: string }>>(
  local: readonly Item[],
  returned: readonly Item[],
  key: (row: Item) => string,
): readonly Item[] {
  const returnedAt = new Map(returned.map((row) => [key(row), row.updatedAt]));
  return local.filter((row) => returnedAt.get(key(row)) === row.updatedAt);
}

/** The pull cursor: the latest arrival seen, refused rows included, and never earlier than before. */
export function nextCursor(
  previous: string | null,
  pulled: readonly Readonly<{ serverUpdatedAt: string | null }>[],
): string | null {
  return pulled.reduce<string | null>(
    (latest, { serverUpdatedAt }) =>
      serverUpdatedAt !== null && (latest === null || serverUpdatedAt > latest) ? serverUpdatedAt : latest,
    previous,
  );
}

/** Only a write to one of the four synced profile fields sets the profile's pending flag. */
export function syncedProfileFieldsChanged(before: Profile, after: Profile): boolean {
  const a = syncedProfileOf(before);
  const b = syncedProfileOf(after);
  return a.displayName !== b.displayName || a.gender !== b.gender || a.dressStyle !== b.dressStyle
    || a.styleAesthetics.join() !== b.styleAesthetics.join();
}
