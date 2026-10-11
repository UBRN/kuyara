import { use, useEffect, useState } from 'react';

import { RecommendationApplicationContext } from '@/features/recommendation/application/recommendation-application-context';
import { historyDayKey } from '@/features/recommendation/domain/outfit-history';
import { latestWornLook, type WornTodayLook } from '@/features/today/application/worn-today';

/**
 * The dressing day's latest worn look for Today's hero (ADR 0038), read again whenever History
 * records a look, and gone the moment the dressing day turns. A failed read draws kuyara's pick.
 */
export function useWornToday(): WornTodayLook | null {
  const application = use(RecommendationApplicationContext);
  const dressingDayKey = application?.dressingDayKey;
  const outfitHistory = application?.outfitHistory;
  const [read, setRead] = useState<Readonly<{ key: string; look: WornTodayLook | null }> | null>(null);
  useEffect(() => {
    if (!dressingDayKey || !outfitHistory) return undefined;
    let live = true;
    void outfitHistory.day(historyDayKey(dressingDayKey)).then(
      (looks) => { if (live) setRead({ key: dressingDayKey, look: latestWornLook(looks, dressingDayKey) }); },
      () => { if (live) setRead(null); },
    );
    return () => { live = false; };
  }, [dressingDayKey, outfitHistory]);
  return read && read.key === dressingDayKey ? read.look : null;
}
