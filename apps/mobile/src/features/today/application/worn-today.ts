import type { RecommendedOutfit } from '@/features/recommendation/application/recommend-outfits';
import {
  historyDayKey,
  sameWornGarments,
  wornOutfitFrom,
  type OutfitHistoryRecord,
  type WornOutfit,
} from '@/features/recommendation/domain/outfit-history';

/** What Today draws of a worn look: its pieces and the colours detail drew them in. */
export type WornTodayLook = Pick<OutfitHistoryRecord, 'id' | 'outfit' | 'pieceColors'>;

/**
 * The look that leads Today (ADR 0038): the dressing day's latest live look by the time it was
 * marked, until the dressing day turns at 04:00. A look of any other day never leads.
 * Presentation only: it never reaches a recommendation.
 */
export function latestWornLook<Look extends Pick<OutfitHistoryRecord, 'dayKey' | 'wornAt' | 'deletedAt'>>(
  looks: readonly Look[],
  dressingDayKey: string,
): Look | null {
  const dayKey = historyDayKey(dressingDayKey);
  return looks.reduce<Look | null>((latest, look) => (
    look.dayKey === dayKey && look.deletedAt === null && (latest === null || look.wornAt >= latest.wornAt)
      ? look : latest
  ), null);
}

/** The outfit of the day a worn look dresses piece for piece, whose detail it opens, or null. */
export function wornLookOutfitId(look: WornOutfit, outfits: readonly RecommendedOutfit[]): string | null {
  return outfits.find((outfit) => sameWornGarments(wornOutfitFrom(outfit), look))?.optionId ?? null;
}
