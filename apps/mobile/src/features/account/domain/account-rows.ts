import type { DressStyle, StyleAesthetic } from '@kuyara/contracts';

import {
  sortedStyleAesthetics,
  type Gender,
  type Profile,
} from '@/features/profile/domain/profile';
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

/** Photos never sync: a pulled Closet row keeps the photo this phone already holds for it. */
export function landedWardrobeItem(pulled: WardrobeItem, local: WardrobeItem | null): WardrobeItem {
  return { ...pulled, photoRelativePath: local?.photoRelativePath ?? null };
}

/** A pulled History day keeps the mirror photo this phone holds for that day, under whichever id. */
export function landedOutfitHistory(
  pulled: OutfitHistoryRecord,
  local: OutfitHistoryRecord | null,
): OutfitHistoryRecord {
  return { ...pulled, photoPath: local?.photoPath ?? null };
}
