import { use, useEffect, useState } from 'react';

import { RecommendationApplicationContext } from '@/features/recommendation/application/recommendation-application-context';
import { historyDays } from '@/features/recommendation/domain/outfit-history';
import { WardrobeApplicationContext } from '@/features/wardrobe/application/wardrobe-application-context';
import { closetWearCounts } from '@/features/wardrobe/domain/garment-type-ownership';

const none: ReadonlyMap<string, number> = new Map();

/**
 * Each owned Closet record's worn days, read from History whenever the Closet's items change
 * (the Closet refreshes them on focus). A personal record only: it never reaches a
 * recommendation, analytics or telemetry. While History is unreadable no count shows.
 */
export function useClosetWearCounts(): ReadonlyMap<string, number> {
  const history = use(RecommendationApplicationContext)?.outfitHistory;
  const wardrobe = use(WardrobeApplicationContext)?.state;
  const items = wardrobe?.status === 'ready' ? wardrobe.items : null;
  const [counts, setCounts] = useState(none);

  useEffect(() => {
    if (!history || !items) return;
    let live = true;
    history.list().then(
      (records) => {
        // A day with several looks counts a piece once.
        if (live) setCounts(closetWearCounts(items, historyDays(records).map(({ looks }) =>
          looks.flatMap(({ outfit }) => Object.values(outfit.garments)))));
      },
      () => { if (live) setCounts(none); },
    );
    return () => { live = false; };
  }, [history, items]);

  return counts;
}
