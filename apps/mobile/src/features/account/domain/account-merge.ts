import {
  landedOutfitHistory,
  landedWardrobeItem,
  type AccountRows,
} from '@/features/account/domain/account-rows';
import { firstUploadRows } from '@/features/account/domain/first-upload';
import type { OutfitHistoryRecord } from '@/features/recommendation/domain/outfit-history';

export type MergeCounts = Readonly<{
  /** Live Closet pieces the account did not hold and now does. */
  piecesAdded: number;
  /** History days with a live look that the account did not hold and now does. */
  historyDaysAdded: number;
  /** Live Closet pieces this phone did not hold and now does. */
  piecesReceived: number;
  /** History days with a live look that this phone did not hold and now does. */
  historyDaysReceived: number;
}>;

export type MergeResult = Readonly<{
  /** Rows to write on the phone: the account's winners and the rows only the account holds. */
  writeToPhone: AccountRows;
  /** Rows to upload: the phone's rows the account does not settle. */
  sendToAccount: AccountRows;
  counts: MergeCounts;
}>;

type Row = Readonly<{ id: string; deletedAt: string | null }>;
type DayRow = Row & Readonly<{ dayKey: string }>;
type Merged<Item> = Readonly<{ write: readonly Item[]; send: readonly Item[]; added: number; received: number }>;

const isLive = (row: Row | null) => row !== null && row.deletedAt === null;

/** The Closet and History merge by ID and the account's copy wins (ADR 0041 section 4). */
function mergeById<Item extends Row>(
  candidates: readonly Item[],
  local: readonly Item[],
  remote: readonly Item[],
  land: (pulled: Item, local: Item | null) => Item,
): Merged<Item> {
  const localById = new Map(local.map((row) => [row.id, row]));
  const remoteIds = new Set(remote.map((row) => row.id));
  const write: Item[] = [];
  let received = 0;
  for (const row of remote) {
    const own = localById.get(row.id) ?? null;
    if (own === null && !isLive(row)) continue; // a deletion marker for a piece this phone never held
    write.push(land(row, own));
    if (isLive(row) && !isLive(own)) received += 1;
  }
  const send = candidates.filter((row) => !remoteIds.has(row.id));
  return { write, send, added: send.filter(isLive).length, received };
}

/**
 * Daily choices and departures are one row per day: when both hold the day, a live account record stays and
 * the phone adopts its id. An account deletion marker never overrides the phone: it yields to a
 * live record there, so the phone's day is not lost, and is otherwise not worth writing.
 */
function mergeByDay<Item extends DayRow>(
  candidates: readonly Item[],
  local: readonly Item[],
  remote: readonly Item[],
  land: (pulled: Item, local: Item | null) => Item,
): Merged<Item> {
  const localByDay = new Map(local.map((row) => [row.dayKey, row]));
  const remoteByDay = new Map(remote.map((row) => [row.dayKey, row]));
  const write: Item[] = [];
  let received = 0;
  for (const row of remote.filter(isLive)) {
    const own = localByDay.get(row.dayKey) ?? null;
    write.push(land(row, own));
    if (!isLive(own)) received += 1;
  }
  const send = candidates.filter((row) => {
    const account = remoteByDay.get(row.dayKey);
    return account === undefined || (!isLive(account) && isLive(row));
  });
  return { write, send, added: send.filter(isLive).length, received };
}

/**
 * A History day can hold several looks (ADR 0038), so looks merge by ID: both sides' looks of a
 * day stand side by side and the account's copy of the same look wins. The counts stay in days.
 */
function mergeHistory(
  candidates: readonly OutfitHistoryRecord[],
  local: readonly OutfitHistoryRecord[],
  remote: readonly OutfitHistoryRecord[],
): Merged<OutfitHistoryRecord> {
  const merged = mergeById(candidates, local, remote, landedOutfitHistory);
  const liveDays = (rows: readonly OutfitHistoryRecord[]) => new Set(rows.filter(isLive).map((row) => row.dayKey));
  const newDays = (rows: readonly OutfitHistoryRecord[], held: readonly OutfitHistoryRecord[]) => {
    const heldDays = liveDays(held);
    return [...liveDays(rows)].filter((dayKey) => !heldDays.has(dayKey)).length;
  };
  return { ...merged, added: newDays(merged.send, remote), received: newDays(merged.write, local) };
}

const keep = <Item>(pulled: Item) => pulled;

/**
 * The first link of a phone to an account, and a sign-in with a different account than the last
 * one, pull the account's rows and merge them with the phone's before anything is uploaded
 * (ADR 0041 sections 4 and 6). Every live row goes, so changes the previous account had not
 * synced yet join the new one. Pure: the caller reads both sides,
 * writes `writeToPhone`, uploads `sendToAccount` and shows `counts`. Without the sync consent
 * only the profile is settled; its four fields come from the account when it has them.
 */
export function mergeAtFirstLink(
  local: AccountRows,
  remote: AccountRows,
  options: Readonly<{ syncConsent: boolean; now: string }>,
): MergeResult {
  const writeProfile = remote.profile;
  const sendProfile = remote.profile === null ? local.profile : null;
  if (!options.syncConsent) {
    const none = { wardrobeItems: [], dressingDayChoices: [], dressingDayDepartures: [], outfitHistory: [] };
    return {
      writeToPhone: { profile: writeProfile, ...none },
      sendToAccount: { profile: sendProfile, ...none },
      counts: { piecesAdded: 0, historyDaysAdded: 0, piecesReceived: 0, historyDaysReceived: 0 },
    };
  }
  const candidates = firstUploadRows(local, options);
  const closet = mergeById(candidates.wardrobeItems, local.wardrobeItems, remote.wardrobeItems, landedWardrobeItem);
  const choices = mergeByDay(candidates.dressingDayChoices, local.dressingDayChoices, remote.dressingDayChoices, keep);
  const departures = mergeByDay(candidates.dressingDayDepartures, local.dressingDayDepartures, remote.dressingDayDepartures, keep);
  const history = mergeHistory(candidates.outfitHistory, local.outfitHistory, remote.outfitHistory);
  return {
    writeToPhone: {
      profile: writeProfile,
      wardrobeItems: closet.write,
      dressingDayChoices: choices.write,
      dressingDayDepartures: departures.write,
      outfitHistory: history.write,
    },
    sendToAccount: {
      profile: sendProfile,
      wardrobeItems: closet.send,
      dressingDayChoices: choices.send,
      dressingDayDepartures: departures.send,
      outfitHistory: history.send,
    },
    counts: {
      piecesAdded: closet.added,
      historyDaysAdded: history.added,
      piecesReceived: closet.received,
      historyDaysReceived: history.received,
    },
  };
}
