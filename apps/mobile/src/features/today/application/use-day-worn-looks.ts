import { useEffect, useRef, useState } from 'react';

import { useRecommendationApplication } from '@/features/recommendation/application/recommendation-application-context';
import {
  historyDayKey,
  type WornOutfit,
  type WornPieceColors,
} from '@/features/recommendation/domain/outfit-history';
import { outfitWornState } from '@/features/today/application/outfit-detail-state';

/**
 * ADR 0038: the dressing day's worn looks, read once per day, so outfit detail knows whether
 * the look on screen is already among them, and "Wore this today" records it. Tomorrow's
 * preview is read-only for the day's worn record. `onLogged` hears the look once the write
 * has succeeded.
 */
export function useDayWornLooks(
  look: WornOutfit | null,
  tomorrow: boolean,
  onLogged?: (look: WornOutfit) => void,
) {
  const { dressingDayKey, outfitHistory } = useRecommendationApplication();
  const [dayLooks, setDayLooks] = useState<{ key: string; looks: readonly WornOutfit[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  // A second press before React re-renders must not write or report again.
  const writing = useRef(false);
  const dayKey = dressingDayKey ? historyDayKey(dressingDayKey) : null;
  useEffect(() => {
    if (!dayKey || !outfitHistory) return;
    let live = true;
    void outfitHistory.day(dayKey).then(
      (records) => { if (live) setDayLooks({ key: dayKey, looks: records.map(({ outfit }) => outfit) }); },
      () => { if (live) setDayLooks(null); },
    );
    return () => { live = false; };
  }, [dayKey, outfitHistory]);

  // Each look worn in a day is recorded beside the day's earlier ones; the repository keeps the
  // same look to one record. The colours are the ones the detail board drew, so History draws
  // the look as it was seen.
  const wearThis = (pieceColors: WornPieceColors) => {
    if (!dayKey || !look || !outfitHistory || writing.current) return;
    writing.current = true;
    setBusy(true);
    setFailed(false);
    void outfitHistory.log(dayKey, look, pieceColors)
      .then((record) => {
        setDayLooks((day) => ({
          key: dayKey,
          looks: [...(day?.key === dayKey ? day.looks : []), record.outfit],
        }));
        onLogged?.(record.outfit);
      })
      .catch(() => setFailed(true))
      .finally(() => {
        writing.current = false;
        setBusy(false);
      });
  };

  const today = dayLooks?.key === dayKey ? dayLooks : null;
  return {
    worn: outfitWornState(tomorrow, today, look),
    busy,
    failed,
    /** Absent where nothing can be recorded: tomorrow's preview, or no day or history to record into. */
    wearThis: outfitHistory && dayKey && !tomorrow ? wearThis : undefined,
  };
}
