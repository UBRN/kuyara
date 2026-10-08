import {
  profileWithinConsent,
  type AccountProfile,
  type AccountRows,
  type RefusedAccountRows,
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

/**
 * Where the phone's profile came from at a link: all four fields from the account, its name and
 * gender only (no consent, or the account held no dress style), or nothing (the account held no
 * profile, so the phone's went to it, or this build cannot read the account's, so each keeps its
 * own). The result sheets pick their sentence by it.
 */
export type ProfileSource = 'account' | 'accountNameAndGender' | 'phone';

export type MergeResult = Readonly<{
  /** Rows to write on the phone: the account's winners and the rows only the account holds. */
  writeToPhone: AccountRows;
  /** Rows to upload: the phone's rows the account does not settle. */
  sendToAccount: AccountRows;
  counts: MergeCounts;
  profileFrom: ProfileSource;
  /**
   * The merge ran under the sync consent, so it settled the records: every record row it does
   * not send (a deletion older than the marker window) has nothing left to upload.
   */
  syncConsent: boolean;
}>;

type Row = Readonly<{ id: string; deletedAt: string | null }>;
type DayRow = Row & Readonly<{ dayKey: string }>;
type Merged<Item> = Readonly<{ write: readonly Item[]; send: readonly Item[]; added: number; received: number }>;

/** A row that exists and is not soft-deleted. */
export const isLiveRow = (row: Row | null) => row !== null && row.deletedAt === null;

/**
 * The History days with a live look: a day can hold several looks (ADR 0038), and the counts the
 * person reads are in days (ADR 0041 section 3).
 */
export const liveHistoryDays = (rows: readonly OutfitHistoryRecord[]): ReadonlySet<string> =>
  new Set(rows.filter(isLiveRow).map((row) => row.dayKey));

/** The Closet and History merge by ID and the account's copy wins (ADR 0041 section 4). */
function mergeById<Item extends Row>(
  candidates: readonly Item[],
  local: readonly Item[],
  remote: readonly Item[],
): Merged<Item> {
  const localById = new Map(local.map((row) => [row.id, row]));
  const remoteIds = new Set(remote.map((row) => row.id));
  const write: Item[] = [];
  let received = 0;
  for (const row of remote) {
    const own = localById.get(row.id) ?? null;
    if (own === null && !isLiveRow(row)) continue; // a deletion marker for a piece this phone never held
    write.push(row);
    if (isLiveRow(row) && !isLiveRow(own)) received += 1;
  }
  const send = candidates.filter((row) => !remoteIds.has(row.id));
  return { write, send, added: send.filter(isLiveRow).length, received };
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
): Merged<Item> {
  const localByDay = new Map(local.map((row) => [row.dayKey, row]));
  const remoteByDay = new Map(remote.map((row) => [row.dayKey, row]));
  const write: Item[] = [];
  let received = 0;
  for (const row of remote.filter(isLiveRow)) {
    const own = localByDay.get(row.dayKey) ?? null;
    write.push(row);
    if (!isLiveRow(own)) received += 1;
  }
  const send = candidates.filter((row) => {
    const account = remoteByDay.get(row.dayKey);
    return account === undefined || (!isLiveRow(account) && isLiveRow(row));
  });
  return { write, send, added: send.filter(isLiveRow).length, received };
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
  const merged = mergeById(candidates, local, remote);
  const newDays = (rows: readonly OutfitHistoryRecord[], held: readonly OutfitHistoryRecord[]) => {
    const heldDays = liveHistoryDays(held);
    return [...liveHistoryDays(rows)].filter((dayKey) => !heldDays.has(dayKey)).length;
  };
  return { ...merged, added: newDays(merged.send, remote), received: newDays(merged.write, local) };
}

/**
 * The profile at a first link. Display name and gender come from the account when it has a
 * profile, else the phone offers its own. Dress style and style aesthetics cross only under the
 * consent; then they come from the account too, unless the account holds no dress style (the
 * profile reached it without the consent, or the consent was withdrawn), when the phone's style
 * goes to the account rather than the account's empty one clearing the phone's.
 */
function mergeProfile(
  local: AccountProfile | null,
  remote: AccountProfile | null,
  syncConsent: boolean,
  refused: boolean,
): Readonly<{ write: AccountProfile | null; send: AccountProfile | null; from: ProfileSource }> {
  if (refused) return { write: null, send: null, from: 'phone' };
  if (remote === null) return { write: null, send: local && profileWithinConsent(local, syncConsent), from: 'phone' };
  const phoneStyleGoes = syncConsent && remote.dressStyle == null && local?.dressStyle != null;
  if (!phoneStyleGoes) {
    return { write: profileWithinConsent(remote, syncConsent), send: null, from: syncConsent ? 'account' : 'accountNameAndGender' };
  }
  return {
    write: profileWithinConsent(remote, false),
    send: { ...local, displayName: remote.displayName, gender: remote.gender },
    from: 'accountNameAndGender',
  };
}

/**
 * The first link of a phone to an account, and a sign-in with a different account than the last
 * one, pull the account's rows and merge them with the phone's before anything is uploaded
 * (ADR 0041 sections 4 and 6). Every live row goes, so changes the previous account had not
 * synced yet join the new one. Pure: the caller reads both sides,
 * writes `writeToPhone`, uploads `sendToAccount` and shows `counts`. Without the sync consent
 * only the profile's display name and gender are settled (`mergeProfile`). A phone row whose
 * account copy this build refused (`refused`) is not sent: the account's copy wins over it too.
 */
export function mergeAtFirstLink(
  local: AccountRows,
  remote: AccountRows,
  options: Readonly<{ syncConsent: boolean; now: string; refused: RefusedAccountRows }>,
): MergeResult {
  const { refused } = options;
  const profile = mergeProfile(local.profile, remote.profile, options.syncConsent, refused.profile);
  if (!options.syncConsent) {
    const none = { wardrobeItems: [], dressingDayChoices: [], dressingDayDepartures: [], outfitHistory: [] };
    return {
      writeToPhone: { profile: profile.write, ...none },
      sendToAccount: { profile: profile.send, ...none },
      counts: { piecesAdded: 0, historyDaysAdded: 0, piecesReceived: 0, historyDaysReceived: 0 },
      profileFrom: profile.from,
      syncConsent: false,
    };
  }
  const candidates = firstUploadRows(local, options.now);
  const notRefused = <Item>(rows: readonly Item[], keys: readonly string[], key: (row: Item) => string) =>
    rows.filter((row) => !keys.includes(key(row)));
  const closet = mergeById(notRefused(candidates.wardrobeItems, refused.wardrobeItems, (row) => row.id),
    local.wardrobeItems, remote.wardrobeItems);
  const choices = mergeByDay(notRefused(candidates.dressingDayChoices, refused.dressingDayChoices, (row) => row.dayKey),
    local.dressingDayChoices, remote.dressingDayChoices);
  const departures = mergeByDay(notRefused(candidates.dressingDayDepartures, refused.dressingDayDepartures, (row) => row.dayKey),
    local.dressingDayDepartures, remote.dressingDayDepartures);
  const history = mergeHistory(notRefused(candidates.outfitHistory, refused.outfitHistory, (row) => row.id),
    local.outfitHistory, remote.outfitHistory);
  return {
    writeToPhone: {
      profile: profile.write,
      wardrobeItems: closet.write,
      dressingDayChoices: choices.write,
      dressingDayDepartures: departures.write,
      outfitHistory: history.write,
    },
    sendToAccount: {
      profile: profile.send,
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
    profileFrom: profile.from,
    syncConsent: true,
  };
}
