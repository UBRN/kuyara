import type { AccountRows } from '@/features/account/domain/account-rows';

const deletionMarkerWindowMs = 30 * 24 * 60 * 60 * 1000;

/**
 * What the first sign-in sends (ADR 0041 section 3): every live row, and the soft-deletion
 * markers of the last 30 days (a marker exactly 30 days old still goes). Without the sync
 * consent only the profile goes; the departures are held back with the other day records
 * until it is settled whether they need the consent at all.
 */
export function firstUploadRows(
  local: AccountRows,
  { syncConsent, now }: Readonly<{ syncConsent: boolean; now: string }>,
): AccountRows {
  if (!syncConsent) {
    return {
      profile: local.profile, wardrobeItems: [], dressingDayChoices: [],
      dressingDayDepartures: [], outfitHistory: [],
    };
  }
  const oldest = Date.parse(now) - deletionMarkerWindowMs;
  const goes = (row: Readonly<{ deletedAt: string | null }>) =>
    row.deletedAt === null || Date.parse(row.deletedAt) >= oldest;
  return {
    profile: local.profile,
    wardrobeItems: local.wardrobeItems.filter(goes),
    dressingDayChoices: local.dressingDayChoices.filter(goes),
    dressingDayDepartures: local.dressingDayDepartures.filter(goes),
    outfitHistory: local.outfitHistory.filter(goes),
  };
}
