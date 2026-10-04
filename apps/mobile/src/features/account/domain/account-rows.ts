import type { DressStyle, StyleAesthetic } from '@kuyara/contracts';

import {
  sortedStyleAesthetics,
  type Gender,
  type Profile,
} from '@/features/profile/domain/profile';
import type { DressingDayChoice } from '@/features/recommendation/domain/dressing-day-choice';
import type { DressingDayDeparture } from '@/features/recommendation/domain/dressing-day-departure';
import type { OutfitHistoryRecord } from '@/features/recommendation/domain/outfit-history';
import type { WardrobeItem } from '@/features/wardrobe/domain/wardrobe-item';

/** The four profile fields that reach the account (ADR 0041 section 3), with the row's clocks. */
export type SyncedProfile = Readonly<{
  displayName: string | null;
  gender: Gender | null;
  dressStyle: DressStyle | null;
  styleAesthetics: readonly StyleAesthetic[];
  createdAt: string;
  updatedAt: string;
}>;

type ConsentProfileFields = 'dressStyle' | 'styleAesthetics';

/**
 * The profile as it crosses to or from the account: display name and gender always, dress
 * style and style aesthetics only under the sync consent (ADR 0041 sections 3 and 10). An
 * absent field is one that does not cross: an upload leaves the account's copy alone and a pull
 * leaves the phone's.
 */
export type AccountProfile = Omit<SyncedProfile, ConsentProfileFields>
  & Partial<Pick<SyncedProfile, ConsentProfileFields>>;

/** Everything one side, the phone or the account, holds of the five synced tables. */
export type AccountRows = Readonly<{
  profile: AccountProfile | null;
  wardrobeItems: readonly WardrobeItem[];
  dressingDayChoices: readonly DressingDayChoice[];
  dressingDayDepartures: readonly DressingDayDeparture[];
  outfitHistory: readonly OutfitHistoryRecord[];
}>;

/**
 * A soft-deleted row as the account keeps it (ADR 0041 section 3): its id, its day for the
 * day-keyed tables and its clocks, with every content column cleared by the server.
 */
export type DeletionMarker = Readonly<{
  kind: 'deletionMarker';
  id: string;
  dayKey?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string;
}>;

/** A row of one of the four record tables as the account returns it: whole, or a deletion marker. */
export type AccountRow<Item> = Item | DeletionMarker;

/** The account's side before its deletion markers have landed on the phone's rows. */
export type RemoteAccountRows = Readonly<{
  profile: AccountProfile | null;
  wardrobeItems: readonly AccountRow<WardrobeItem>[];
  dressingDayChoices: readonly AccountRow<DressingDayChoice>[];
  dressingDayDepartures: readonly AccountRow<DressingDayDeparture>[];
  outfitHistory: readonly AccountRow<OutfitHistoryRecord>[];
}>;

export function isDeletionMarker(row: object): row is DeletionMarker {
  return 'kind' in row && row.kind === 'deletionMarker';
}

type MarkedRow = Readonly<{ id: string; createdAt: string; updatedAt: string; deletedAt: string | null }>;
type Identity = 'id' | 'day';

const identityOf = (row: Readonly<{ id: string; dayKey?: string }>, identity: Identity) =>
  identity === 'day' ? row.dayKey : row.id;

/**
 * A deletion marker carries no content, so it lands on the phone's row of the same identity (by
 * id, or by day for daily choices and departures) as that row soft-deleted, under the marker's
 * id and clocks. A marker for a row this phone does not hold has nothing to land on and is
 * dropped. Whole rows pass through.
 */
export function landDeletionMarkers<Item extends MarkedRow>(
  rows: readonly AccountRow<Item>[],
  local: readonly Item[],
  identity: Identity,
): Item[] {
  const localByKey = new Map(local.map((row) => [identityOf(row, identity), row]));
  return rows.flatMap((row) => {
    if (!isDeletionMarker(row)) return [row];
    const own = localByKey.get(identityOf(row, identity));
    if (own === undefined) return [];
    const { createdAt, deletedAt, id, updatedAt } = row;
    return [{ ...own, id, createdAt, updatedAt, deletedAt }];
  });
}

/** `landDeletionMarkers` for every record table of one side, against the phone's rows. */
export function landRemoteRows(remote: RemoteAccountRows, local: AccountRows): AccountRows {
  return {
    profile: remote.profile,
    wardrobeItems: landDeletionMarkers(remote.wardrobeItems, local.wardrobeItems, 'id'),
    dressingDayChoices: landDeletionMarkers(remote.dressingDayChoices, local.dressingDayChoices, 'day'),
    dressingDayDepartures: landDeletionMarkers(remote.dressingDayDepartures, local.dressingDayDepartures, 'day'),
    outfitHistory: landDeletionMarkers(remote.outfitHistory, local.outfitHistory, 'id'),
  };
}

export function syncedProfileOf(profile: Profile): SyncedProfile {
  return {
    displayName: profile.displayName,
    gender: profile.gender,
    dressStyle: profile.dressStyle,
    styleAesthetics: sortedStyleAesthetics(profile.styleAesthetics ?? []),
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  };
}

/**
 * The profile fields that cross to or from the account: display name and gender always, dress
 * style and style aesthetics only under the sync consent. The one owner of that rule; it copies
 * field by field, so no device-only field (birth date, consents, settings) ever crosses with it.
 */
export function profileWithinConsent(profile: AccountProfile, syncConsent: boolean): AccountProfile {
  const { createdAt, displayName, dressStyle, gender, styleAesthetics, updatedAt } = profile;
  return syncConsent && dressStyle !== undefined && styleAesthetics !== undefined
    ? { displayName, gender, dressStyle, styleAesthetics, createdAt, updatedAt }
    : { displayName, gender, createdAt, updatedAt };
}

/** Photos never sync: a pulled Closet row keeps the photo this phone already holds for it. */
export function landedWardrobeItem(pulled: WardrobeItem, local: WardrobeItem | null): WardrobeItem {
  return { ...pulled, photoRelativePath: local?.photoRelativePath ?? null };
}

/** Photos never sync: a pulled History look keeps the mirror photo this phone holds for it. */
export function landedOutfitHistory(
  pulled: OutfitHistoryRecord,
  local: OutfitHistoryRecord | null,
): OutfitHistoryRecord {
  return { ...pulled, photoPath: local?.photoPath ?? null };
}
