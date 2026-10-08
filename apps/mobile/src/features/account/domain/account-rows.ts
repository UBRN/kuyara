import type { DressStyle, StyleAesthetic } from '@kuyara/contracts';

import type { Gender } from '@/features/profile/domain/profile';
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

/**
 * The rows the account holds that this build could not read (a newer version wrote them): its
 * profile, the Closet and History by id, daily choices and departures by day. None lands on the
 * phone, and a first link sends nothing over them, so the account's copy wins (ADR 0041 sections
 * 3 and 4).
 */
export type RefusedAccountRows = Readonly<{
  profile: boolean;
  wardrobeItems: readonly string[];
  dressingDayChoices: readonly string[];
  dressingDayDepartures: readonly string[];
  outfitHistory: readonly string[];
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
 * dropped. Whole rows pass through. The phone's rows are indexed once, then each row lands.
 */
export function deletionMarkerLanding<Item extends MarkedRow>(
  local: readonly Item[],
  identity: Identity,
): (row: AccountRow<Item>) => Item[] {
  const localByKey = new Map(local.map((row) => [identityOf(row, identity), row]));
  return (row) => {
    if (!isDeletionMarker(row)) return [row];
    const own = localByKey.get(identityOf(row, identity));
    if (own === undefined) return [];
    const { createdAt, deletedAt, id, updatedAt } = row;
    return [{ ...own, id, createdAt, updatedAt, deletedAt }];
  };
}

/** `deletionMarkerLanding` over every row of one table. */
export function landDeletionMarkers<Item extends MarkedRow>(
  rows: readonly AccountRow<Item>[],
  local: readonly Item[],
  identity: Identity,
): Item[] {
  return rows.flatMap(deletionMarkerLanding(local, identity));
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

/**
 * The consent fields `profile` carries, both or neither: a profile carries them only under the
 * sync consent (`profileWithinConsent`). The one presence check for both directions.
 */
export function consentFieldsOf(profile: AccountProfile): Pick<SyncedProfile, ConsentProfileFields> | null {
  const { dressStyle, styleAesthetics } = profile;
  return dressStyle !== undefined && styleAesthetics !== undefined ? { dressStyle, styleAesthetics } : null;
}

/**
 * The profile fields that cross to or from the account: display name and gender always, dress
 * style and style aesthetics only under the sync consent. The one owner of that rule; it copies
 * field by field, so no device-only field (birth date, consents, settings) ever crosses with it.
 */
export function profileWithinConsent(profile: AccountProfile, syncConsent: boolean): AccountProfile {
  const { createdAt, displayName, gender, updatedAt } = profile;
  const consentFields = syncConsent ? consentFieldsOf(profile) : null;
  return { displayName, gender, ...consentFields, createdAt, updatedAt };
}

/** The phone's profile fields an account profile writes; a field left out keeps the phone's value. */
export type LandedProfileFields = Readonly<{
  displayName: string | null;
  gender?: Gender;
  dressStyle?: DressStyle;
  styleAesthetics?: readonly StyleAesthetic[];
}>;

/**
 * What an account profile, pulled or merged, writes on the phone. The display name always, as
 * the account holds it, so a name cleared on another phone clears here too. Gender and dress
 * style only as a value, never clearing the phone's, because product logic needs both. Dress
 * style and style aesthetics only when the profile carries the consent fields.
 */
export function profileFieldsToLand(profile: AccountProfile): LandedProfileFields {
  const consentFields = consentFieldsOf(profile);
  return {
    displayName: profile.displayName,
    ...(profile.gender === null ? {} : { gender: profile.gender }),
    ...(consentFields !== null && consentFields.dressStyle !== null ? { dressStyle: consentFields.dressStyle } : {}),
    ...(consentFields === null ? {} : { styleAesthetics: consentFields.styleAesthetics }),
  };
}
