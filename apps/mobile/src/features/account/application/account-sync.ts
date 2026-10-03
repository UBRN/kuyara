import { mergeAtFirstLink, type MergeCounts, type MergeResult } from '@/features/account/domain/account-merge';
import {
  landedOutfitHistory,
  landedWardrobeItem,
  type AccountRows,
  type SyncedProfile,
} from '@/features/account/domain/account-rows';
import {
  applyPulledByDay,
  applyPulledById,
  applyPulledProfile,
  nextCursor,
  pendingRows,
  type LocalSyncRow,
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
  profile: SyncedProfile | null;
  wardrobeItems: readonly PulledSyncRow<WardrobeItem>[];
  dressingDayChoices: readonly PulledSyncRow<DressingDayChoice>[];
  dressingDayDepartures: readonly PulledSyncRow<DressingDayDeparture>[];
  outfitHistory: readonly PulledSyncRow<OutfitHistoryRecord>[];
  /** Includes arrivals rejected by the remote parser, so an unknown row never stalls the cursor. */
  arrivals: readonly Readonly<{ serverUpdatedAt: string | null }>[];
}>;

export type AccountRowsSourcePort = Readonly<{
  read: () => Promise<LocalAccountRows>;
  cursor: () => Promise<string | null>;
  /** One transaction writes winners, marks rows to send pending and saves the cursor. */
  applyFirstLink: (merge: MergeResult, cursor: string | null) => Promise<void>;
  /** Compare identity and updatedAt again inside the write transaction before clearing. */
  clearPendingIfUnchanged: (returned: AccountRows) => Promise<void>;
  /** One transaction rechecks pending, lands only settled rows without setting pending, and advances the cursor. */
  writePulled: (rows: AccountRows, cursor: string | null) => Promise<void>;
}>;

export type AccountRemotePort = Readonly<{
  /** Returns validated domain rows and the last server arrival, including refused rows. */
  pullSnapshot: (userId: string, syncConsent: boolean) => Promise<Readonly<{ rows: AccountRows; cursor: string | null }>>;
  /** Map to remote DTOs without device fields; upsert by UUID (choices and departures by day key) and return acknowledged versions. */
  upload: (userId: string, rows: AccountRows) => Promise<AccountRows>;
  /** Parses each remote row once, retaining every arrival in `arrivals`. */
  pull: (userId: string, cursor: string | null, syncConsent: boolean) => Promise<PulledAccountRows>;
}>;

const values = (local: LocalAccountRows): AccountRows => ({
  profile: local.profile?.row ?? null,
  wardrobeItems: local.wardrobeItems.map(({ row }) => row),
  dressingDayChoices: local.dressingDayChoices.map(({ row }) => row),
  dressingDayDepartures: local.dressingDayDepartures.map(({ row }) => row),
  outfitHistory: local.outfitHistory.map(({ row }) => row),
});

function pending(local: LocalAccountRows, syncConsent: boolean): AccountRows {
  return {
    profile: local.profile?.pendingSync ? local.profile.row : null,
    wardrobeItems: syncConsent ? pendingRows(local.wardrobeItems) : [],
    dressingDayChoices: syncConsent ? pendingRows(local.dressingDayChoices) : [],
    dressingDayDepartures: syncConsent ? pendingRows(local.dressingDayDepartures) : [],
    outfitHistory: syncConsent ? pendingRows(local.outfitHistory) : [],
  };
}

const hasRows = (rows: AccountRows) => rows.profile !== null || rows.wardrobeItems.length > 0
  || rows.dressingDayChoices.length > 0 || rows.dressingDayDepartures.length > 0 || rows.outfitHistory.length > 0;

export function createAccountSyncFlow(source: AccountRowsSourcePort, remote: AccountRemotePort, now: () => string) {
  const uploadPending = async (userId: string, syncConsent: boolean) => {
    const rows = pending(await source.read(), syncConsent);
    if (hasRows(rows)) await source.clearPendingIfUnchanged(await remote.upload(userId, rows));
  };
  return {
    async firstLink(userId: string, syncConsent: boolean): Promise<MergeCounts> {
      const local = values(await source.read());
      const account = await remote.pullSnapshot(userId, syncConsent);
      const merge = mergeAtFirstLink(local, account.rows, { syncConsent, now: now() });
      await source.applyFirstLink(merge, account.cursor);
      await uploadPending(userId, syncConsent);
      return merge.counts;
    },
    async sync(userId: string, syncConsent: boolean): Promise<void> {
      await uploadPending(userId, syncConsent);
      const cursor = await source.cursor();
      const pulled = await remote.pull(userId, cursor, syncConsent);
      const local = await source.read();
      await source.writePulled({
        profile: applyPulledProfile(local.profile ?? { pendingSync: false }, pulled.profile),
        wardrobeItems: syncConsent ? applyPulledById(local.wardrobeItems, pulled.wardrobeItems, landedWardrobeItem) : [],
        dressingDayChoices: syncConsent ? applyPulledByDay(local.dressingDayChoices, pulled.dressingDayChoices, (row) => row) : [],
        dressingDayDepartures: syncConsent ? applyPulledByDay(local.dressingDayDepartures, pulled.dressingDayDepartures, (row) => row) : [],
        outfitHistory: syncConsent ? applyPulledById(local.outfitHistory, pulled.outfitHistory, landedOutfitHistory) : [],
      }, nextCursor(cursor, pulled.arrivals));
    },
  };
}
