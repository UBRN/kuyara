import type { DressStyle, StyleAesthetic } from '@kuyara/contracts';

import type { SupportedLanguage } from '@/domain/preferences';
import type { RecommendationApplicationInput } from '@/features/recommendation/application/recommendation-application-controller';
import type { WeatherSnapshot } from '@/features/weather/domain/weather';

/**
 * The input a recommendation is generated from, or null while there is nothing to compose for:
 * no ready weather snapshot, or no clothing preference from the profile. A departure is part
 * of it only while one shapes the day. `now` is read last, and only for an input.
 */
export function generationInput({
  weather, clothingPreference, day, departureAt, dressStyle, styleAesthetics, locale, now,
}: Readonly<{
  weather: Readonly<{ status: string; snapshot?: WeatherSnapshot | null }>;
  clothingPreference: RecommendationApplicationInput['clothingPreference'] | null;
  day: Readonly<{
    key: string;
    variant: RecommendationApplicationInput['dayVariant'];
    kind: RecommendationApplicationInput['dayKind'];
  }>;
  departureAt: string | null;
  dressStyle: DressStyle;
  styleAesthetics: readonly StyleAesthetic[];
  locale: SupportedLanguage;
  now: () => string;
}>): RecommendationApplicationInput | null {
  if (weather.status !== 'ready' || !weather.snapshot || !clothingPreference) return null;
  return {
    snapshot: weather.snapshot,
    // The requirement engine reads the local day and the hours left in it from here, not
    // from the snapshot's observation time.
    now: now(),
    ...(departureAt ? { departureAt } : {}),
    clothingPreference,
    dressStyle,
    styleAesthetics,
    dayVariant: day.variant,
    dayKind: day.kind,
    localDayKey: day.key,
    locale,
  };
}
