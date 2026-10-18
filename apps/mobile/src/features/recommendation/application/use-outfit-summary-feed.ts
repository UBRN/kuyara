import { useEffect } from 'react';

import { outfitSummary, type OutfitSummary } from '@/features/recommendation/application/outfit-summary';
import type { RecommendationSnapshot } from '@/features/recommendation/application/recommendation-repository';
import type { SiriCardSwitch } from '@/features/recommendation/application/siri-card-switch';
import type { TemperatureUnit } from '@/localization/device-locale';
import type { SupportedLanguage } from '@/localization/messages';

/**
 * ADR 0042 section 3: summarises every saved snapshot Today shows for the Siri card, which cannot
 * run JavaScript, and again on a change of language, unit or zone. The state is the provider's
 * masked one, so tomorrow's preview is never written; without a ready snapshot nothing is
 * written, and the file's own bounds retire yesterday's summary. A change of the remote switch
 * (section 7) rewrites it too; until the switch is known nothing is written.
 */
export function useOutfitSummaryFeed(input: Readonly<{
  state: Readonly<{ status: string; snapshot?: RecommendationSnapshot | null }>;
  language: SupportedLanguage;
  temperatureUnit: TemperatureUnit;
  timeZone: string;
  siriCard: SiriCardSwitch | null;
  write: (summary: OutfitSummary) => void;
}>): void {
  const { language, siriCard, temperatureUnit, timeZone, write } = input;
  const snapshot = input.state.status === 'ready' ? input.state.snapshot ?? null : null;
  useEffect(() => {
    if (!snapshot || !siriCard) return;
    const summary = outfitSummary({ snapshot, language, temperatureUnit, timeZone, siriCard });
    if (summary) write(summary);
  }, [language, siriCard, snapshot, temperatureUnit, timeZone, write]);
}
