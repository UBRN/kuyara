import type { DressStyle } from '@kuyara/contracts';
import { useReducer } from 'react';

import { useRecommendationApplication } from '@/features/recommendation/application/recommendation-application-context';
import { outfitCoverage } from '@/features/recommendation/domain/outfit-coverage';
import { askAgainSheetReducer, closedAskAgainSheet } from '@/features/today/application/today-sheets';
import { systemNow } from '@/infrastructure/system-clock';

/**
 * "Ask the stylist again" (O2, O3): one sheet that hands the day type and the departure to the
 * application in one call, then says what Today is choosing for until the new outfit settles.
 * Without the place's time zone there is no departure to read, so the sheet does not exist.
 */
export function useAskAgainSheet(timeZone: string | null) {
  const { reask } = useRecommendationApplication();
  const [sheet, dispatch] = useReducer(askAgainSheetReducer, closedAskAgainSheet);

  const confirm = async ({ formality, departureAt }: Readonly<{ formality: DressStyle; departureAt: string | null }>) => {
    if (sheet.busy || !timeZone || !reask) return;
    dispatch({ type: 'confirmSaving' });
    await (async () => {
      const { settled } = await reask({ formality, departureAt, timeZone });
      const choosingWindow = outfitCoverage(departureAt ?? systemNow(), timeZone);
      dispatch({ type: 'confirmSaved', choosingWindow });
      void settled.finally(() => dispatch({ type: 'choosingSettled', choosingWindow }));
    })().catch(() => dispatch({ type: 'confirmFailed', at: Date.now() }));
  };

  return {
    /** The clock the sheet was opened at, or null while it is closed. */
    openedAt: sheet.openedAt,
    busy: sheet.busy,
    error: sheet.error,
    choosingWindow: sheet.choosingWindow,
    // The sheet opens on the clock it was pressed at; its window is read against it.
    open: () => dispatch({ type: 'opened', at: Date.now() }),
    dismiss: () => dispatch({ type: 'dismissed' }),
    confirm: (choice: Readonly<{ formality: DressStyle; departureAt: string | null }>) => { void confirm(choice); },
  };
}
