import { useEffect } from 'react';

import { outfitSummary, type OutfitSummary } from '@/features/recommendation/application/outfit-summary';
import type { RecommendationSnapshot } from '@/features/recommendation/application/recommendation-repository';
import type { TemperatureUnit } from '@/localization/device-locale';
import type { SupportedLanguage } from '@/localization/messages';

/**
 * ADR 0042 section 3: summarises every saved snapshot Today shows for the Siri card, which cannot
 * run JavaScript, and again on a change of language, unit or zone. The state is the provider's
 * masked one, so tomorrow's preview is never written; without a ready snapshot nothing is
 * written, and the file's own bounds retire yesterday's summary.
 */
export function useOutfitSummaryFeed(input: Readonly<{
  state: Readonly<{ status: string; snapshot?: RecommendationSnapshot | null }>;
  language: SupportedLanguage;
  temperatureUnit: TemperatureUnit;
  timeZone: string;
  write: (summary: OutfitSummary) => void;
}>): void {
  const { language, temperatureUnit, timeZone, write } = input;
  const snapshot = input.state.status === 'ready' ? input.state.snapshot ?? null : null;
  useEffect(() => {
    if (!snapshot) return;
    const summary = outfitSummary({ snapshot, language, temperatureUnit, timeZone });
    if (summary) write(summary);
  }, [language, snapshot, temperatureUnit, timeZone, write]);
}
