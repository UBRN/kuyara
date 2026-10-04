import type { AccountRows } from '@/features/account/domain/account-rows';

const deletionMarkerWindowMs = 30 * 24 * 60 * 60 * 1000;

/**
 * The record rows a first link may send (ADR 0041 section 3): every live row, and the
 * soft-deletion markers of the last 30 days (a marker exactly 30 days old still goes).
 */
export function firstUploadRows(local: Omit<AccountRows, 'profile'>, now: string): Omit<AccountRows, 'profile'> {
  const oldest = Date.parse(now) - deletionMarkerWindowMs;
  const goes = (row: Readonly<{ deletedAt: string | null }>) =>
    row.deletedAt === null || Date.parse(row.deletedAt) >= oldest;
  return {
    wardrobeItems: local.wardrobeItems.filter(goes),
    dressingDayChoices: local.dressingDayChoices.filter(goes),
    dressingDayDepartures: local.dressingDayDepartures.filter(goes),
    outfitHistory: local.outfitHistory.filter(goes),
  };
}
