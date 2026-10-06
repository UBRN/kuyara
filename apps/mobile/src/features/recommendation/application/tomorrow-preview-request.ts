import type { DressStyle, StyleAesthetic } from '@kuyara/contracts';

import type { SupportedLanguage } from '@/domain/preferences';
import {
  localDayKey,
  localDayKind,
  localDayVariant,
  type RecommendationApplicationInput,
} from '@/features/recommendation/application/recommendation-application-controller';
import type { RecommendationSnapshot } from '@/features/recommendation/application/recommendation-repository';
import {
  forecastCoversWindow,
  previewAnswersQuestion,
  type TomorrowPreviewInput,
} from '@/features/recommendation/application/tomorrow-preview';
import { nextMorningAfterEvening, previewDepartureAt } from '@/features/recommendation/domain/local-day';
import type { OutfitCandidate } from '@/features/recommendation/domain/outfit-composition';

/**
 * The dressing day an evening previews, read only once today's input names the place's time
 * zone: the next morning and its key. Null for a day-period key.
 */
export function tomorrowOfEvening(
  dressingDayKey: string,
  today: RecommendationApplicationInput | null,
): Readonly<{ morning: Date; key: string }> | null {
  if (!today?.snapshot.timeZone) return null;
  const morning = nextMorningAfterEvening(dressingDayKey);
  return morning ? { morning, key: localDayKey(morning) } : null;
}

/** What tomorrow's question is asked with: the profile dress style and the Settings styles. */
export type TomorrowQuestion = Readonly<{
  dressStyle: DressStyle;
  styleAesthetics: readonly StyleAesthetic[];
}>;

/**
 * The selection tomorrow's preview asks for, or null while it may not ask yet: a foreground
 * open of Today in this evening dressing day wanted it, the evening question is answered,
 * today's outfit has settled, and the hourly forecast covers tomorrow's whole window. The
 * evening's own outfits are excluded, as the morning would exclude them.
 */
export function tomorrowPreviewRequest({
  dressingDayKey, wanted, eveningChoicePending, today, settledOutfits, question, locale, now,
}: Readonly<{
  dressingDayKey: string;
  wanted: boolean;
  eveningChoicePending: boolean;
  today: RecommendationApplicationInput | null;
  settledOutfits: readonly OutfitCandidate[] | null;
  question: TomorrowQuestion;
  locale: SupportedLanguage;
  now: () => string;
}>): TomorrowPreviewInput | null {
  const tomorrow = tomorrowOfEvening(dressingDayKey, today);
  if (!wanted || !tomorrow || !today || eveningChoicePending || !settledOutfits) return null;
  const departureAt = previewDepartureAt(dressingDayKey, today.snapshot.timeZone);
  if (!departureAt || !forecastCoversWindow(today.snapshot, departureAt)) return null;
  return {
    snapshot: today.snapshot,
    now: now(),
    departureAt,
    clothingPreference: today.clothingPreference,
    dressStyle: question.dressStyle,
    styleAesthetics: question.styleAesthetics,
    dayVariant: localDayVariant(tomorrow.morning),
    dayKind: localDayKind(tomorrow.morning),
    localDayKey: tomorrow.key,
    locale,
    excludedOutfits: settledOutfits,
  };
}

/**
 * The stored preview Today shows: only while it still answers tomorrow's question, the same
 * place, gender, dress style and styles. Otherwise it simply does not appear; the day's one
 * selection is not spent again.
 */
export function shownTomorrowPreview(
  preview: RecommendationSnapshot | null,
  dressingDayKey: string,
  today: RecommendationApplicationInput | null,
  question: TomorrowQuestion,
): RecommendationSnapshot | null {
  const tomorrow = tomorrowOfEvening(dressingDayKey, today);
  return preview && tomorrow && today && previewAnswersQuestion(preview, {
    localDayKey: tomorrow.key,
    locationKey: today.snapshot.locationKey,
    clothingPreference: today.clothingPreference,
    dressStyle: question.dressStyle,
    styleAesthetics: question.styleAesthetics,
  }) ? preview : null;
}
