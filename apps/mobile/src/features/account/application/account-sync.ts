import { linkAfterFirstLink, type AccountLink } from '@/features/account/domain/account-link';
import { mergeAtFirstLink, type MergeResult } from '@/features/account/domain/account-merge';
import {
  deletionMarkerLanding,
  landRemoteRows,
  profileWithinConsent,
  type AccountProfile,
  type AccountRow,
  type AccountRows,
  type RemoteAccountRows,
  type SyncedProfile,
} from '@/features/account/domain/account-rows';
import {
  applyPulledByDay,
  applyPulledById,
  applyPulledProfile,
  nextCursor,
  pendingRows,
  type LocalSyncRow,
  type PullArrival,
  type PullCursor,
  type PulledSyncRow,
} from '@/features/account/domain/sync-rules';
import type { DressingDayChoice } from '@/features/recommendation/domain/dressing-day-choice';
import type { DressingDayDeparture } from '@/features/recommendation/domain/dressing-day-departure';
import type { OutfitHistoryRecord } from '@/features/recommendation/domain/outfit-history';
import type { WardrobeItem } from '@/features/wardrobe/domain/wardrobe-item';

export type LocalAccountRows = Readonly<{
  profile: LocalSyncRow<SyncedProfile> | null;
  wardrobeItems: readonly LocalSyncRow<WardrobeItem>[];
  dressingDayChoices: readonly LocalSyncRow<DressingDayChoice>[];
  dressingDayDepartures: readonly LocalSyncRow<DressingDayDeparture>[];
  outfitHistory: readonly LocalSyncRow<OutfitHistoryRecord>[];
}>;

export type PulledAccountRows = Readonly<{
  profile: AccountProfile | null;
  wardrobeItems: readonly PulledSyncRow<AccountRow<WardrobeItem>>[];
  dressingDayChoices: readonly PulledSyncRow<AccountRow<DressingDayChoice>>[];
  dressingDayDepartures: readonly PulledSyncRow<AccountRow<DressingDayDeparture>>[];
  outfitHistory: readonly PulledSyncRow<AccountRow<OutfitHistoryRecord>>[];
  /** Includes arrivals rejected by the remote parser, so an unknown row never stalls its table's cursor. */
  arrivals: readonly PullArrival[];
}>;

export type AccountRowsSourcePort = Readonly<{
  read: () => Promise<LocalAccountRows>;
  /** The device's account link: the linked user, the account the records joined, the pull cursor. */
  link: () => Promise<AccountLink>;
  saveLink: (link: AccountLink) => Promise<void>;
  /**
   * One transaction writes winners, marks rows to send pending and saves `link`, cursor included.
   * The rows of `local`, the rows the merge read (the profile, and the records under the consent,
   * `merge.syncConsent`), are settled: their pending flags clear while the row still holds the
   * identity and `updatedAt` read, so a deletion older than the marker window never uploads later.
   * A row written during the pull keeps its flag and its content: no winner lands over it, and it
   * uploads with the next pass. A profile that lacks dress style and style aesthetics writes only
   * the fields it carries.
   */
  applyFirstLink: (merge: MergeResult, link: AccountLink, local: AccountRows) => Promise<void>;
  /** Compare identity and updatedAt again inside the write transaction before clearing. */
  clearPendingIfUnchanged: (returned: AccountRows) => Promise<void>;
  /**
   * One transaction rechecks pending, lands only settled rows without setting pending, and
   * advances the cursor. A profile without dress style and style aesthetics leaves the phone's.
   */
  writePulled: (rows: AccountRows, cursor: PullCursor) => Promise<void>;
}>;

export type AccountRemotePort = Readonly<{
  /**
   * Returns validated domain rows, deletion markers among them, and each table's last server
   * arrival, including refused rows.
   */
  pullSnapshot: (userId: string, syncConsent: boolean) => Promise<Readonly<{ rows: RemoteAccountRows; cursor: PullCursor }>>;
  /**
   * Map to remote DTOs without device fields; upsert by user and UUID (choices and departures by
   * user and day key) and return acknowledged versions. A profile without dress style and style
   * aesthetics sends neither column, so the account's copy keeps what it has.
   */
  upload: (userId: string, rows: AccountRows) => Promise<AccountRows>;
  /** Reads each table from its own position; parses each remote row once, retaining every arrival in `arrivals`. */
  pull: (userId: string, cursor: PullCursor, syncConsent: boolean) => Promise<PulledAccountRows>;
}>;

const values = (local: LocalAccountRows): AccountRows => ({
  profile: local.profile?.row ?? null,
  wardrobeItems: local.wardrobeItems.map(({ row }) => row),
  dressingDayChoices: local.dressingDayChoices.map(({ row }) => row),
  dressingDayDepartures: local.dressingDayDepartures.map(({ row }) => row),
  outfitHistory: local.outfitHistory.map(({ row }) => row),
});

/** How many rows `rows` holds across the five tables; none for null. */
export const rowCount = (rows: AccountRows | null) => rows === null ? 0 : (rows.profile ? 1 : 0)
  + rows.wardrobeItems.length + rows.dressingDayChoices.length + rows.dressingDayDepartures.length + rows.outfitHistory.length;

const hasRows = (rows: AccountRows) => rowCount(rows) > 0;

/**
 * What a pass uploads from this phone's rows: the pending profile, and under the consent the
 * pending records; null when nothing waits. The one answer to "is anything waiting", so the
 * write listener never starts a pass that would send nothing.
 */
export function pendingUpload(local: LocalAccountRows, syncConsent: boolean): AccountRows | null {
  const rows: AccountRows = {
    profile: local.profile?.pendingSync ? profileWithinConsent(local.profile.row, syncConsent) : null,
    wardrobeItems: syncConsent ? pendingRows(local.wardrobeItems) : [],
    dressingDayChoices: syncConsent ? pendingRows(local.dressingDayChoices) : [],
    dressingDayDepartures: syncConsent ? pendingRows(local.dressingDayDepartures) : [],
    outfitHistory: syncConsent ? pendingRows(local.outfitHistory) : [],
  };
  return hasRows(rows) ? rows : null;
}

/**
 * Pulled rows with their deletion markers landed on this phone's rows (`deletionMarkerLanding`),
 * each keeping its arrival stamp.
 */
function landedPulls<Item extends Readonly<{ id: string; createdAt: string; updatedAt: string; deletedAt: string | null }>>(
  pulled: readonly PulledSyncRow<AccountRow<Item>>[],
  local: readonly LocalSyncRow<Item>[],
  identity: 'id' | 'day',
): readonly PulledSyncRow<Item>[] {
  const land = deletionMarkerLanding(local.map(({ row }) => row), identity);
  return pulled.flatMap(({ row, serverUpdatedAt }) => land(row).map((landed) => ({ row: landed, serverUpdatedAt })));
}

/** What a first link reports for the result sheets: the domain's merge counts and the profile's source. */
export type FirstLinkOutcome = Pick<MergeResult, 'counts' | 'profileFrom'>;

export function createAccountSyncFlow(source: AccountRowsSourcePort, remote: AccountRemotePort, now: () => string) {
  const upload = async (userId: string, rows: AccountRows | null) => {
    if (rows !== null && hasRows(rows)) await source.clearPendingIfUnchanged(await remote.upload(userId, rows));
  };
  return {
    /** `givenAt`: the arrival of the `given` record the records join under, kept in the link. */
    async firstLink(userId: string, syncConsent: boolean, givenAt: string | null = null): Promise<FirstLinkOutcome> {
      const link = await source.link();
      const local = values(await source.read());
      const account = await remote.pullSnapshot(userId, syncConsent);
      const merge = mergeAtFirstLink(local, landRemoteRows(account.rows, local), { syncConsent, now: now() });
      await source.applyFirstLink(merge, linkAfterFirstLink(link, userId, syncConsent, account.cursor, givenAt), local);
      // Only what the merge chose: a deletion older than the marker window never goes.
      await upload(userId, merge.sendToAccount);
      return { counts: merge.counts, profileFrom: merge.profileFrom };
    },
    /**
     * Uploads what waits, then pulls and lands what arrived. Answers the phone's rows after the
     * pass, read again only when the pass changed them: a row written meanwhile starts a pass of
     * its own.
     */
    async sync(userId: string, syncConsent: boolean): Promise<LocalAccountRows> {
      const before = await source.read();
      const sent = pendingUpload(before, syncConsent);
      await upload(userId, sent);
      const { cursor } = await source.link();
      const pulled = await remote.pull(userId, cursor, syncConsent);
      // An upload clears flags, so the pull lands against a fresh read. Without one the rows read
      // before still serve: a row written during the pull is pending, and the landing rechecks
      // every row's flag inside its transaction and leaves a pending row alone.
      const local = sent === null ? before : await source.read();
      const landing: AccountRows = {
        profile: applyPulledProfile(
          local.profile ?? { pendingSync: false },
          pulled.profile && profileWithinConsent(pulled.profile, syncConsent),
        ),
        wardrobeItems: syncConsent ? applyPulledById(local.wardrobeItems,
          landedPulls(pulled.wardrobeItems, local.wardrobeItems, 'id')) : [],
        dressingDayChoices: syncConsent ? applyPulledByDay(local.dressingDayChoices,
          landedPulls(pulled.dressingDayChoices, local.dressingDayChoices, 'day')) : [],
        dressingDayDepartures: syncConsent ? applyPulledByDay(local.dressingDayDepartures,
          landedPulls(pulled.dressingDayDepartures, local.dressingDayDepartures, 'day')) : [],
        outfitHistory: syncConsent ? applyPulledById(local.outfitHistory,
          landedPulls(pulled.outfitHistory, local.outfitHistory, 'id')) : [],
      };
      await source.writePulled(landing, nextCursor(cursor, pulled.arrivals));
      return hasRows(landing) ? source.read() : local;
    },
  };
}
