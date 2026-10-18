import type { RecommendationSnapshot } from '@/features/recommendation/application/recommendation-repository';
import { dressingDayKind } from '@/features/recommendation/domain/local-day';
import { assignedOutfitGarments } from '@/features/recommendation/domain/outfit-model';
import { archetypeLabel } from '@/features/recommendation/localization/recommendation-messages';
import { dressingDayBounds, isEveningDressingDayKey } from '@/features/weather/domain/wardrobe-day';
import type { TemperatureUnit } from '@/localization/device-locale';
import { messages, type SupportedLanguage } from '@/localization/messages';
import { formatWholeTemperature } from '@/presentation/format-temperature';

/**
 * ADR 0042 section 3: what the Siri outfit card reads from the App Group, because JavaScript
 * does not run during a Siri call. A derived feed, never read back into the app. Every string
 * is already localized, so a wording change ships as a JavaScript update; a field is only ever
 * added, and removing or retyping one takes a new version.
 */
export type OutfitSummary = Readonly<{
  version: 1;
  language: SupportedLanguage;
  /** The device zone the bounds were computed in; Swift reads the summary as stale in another. */
  timeZone: string;
  validFrom: string;
  validUntil: string;
  spokenLine: string;
  labels: Readonly<{ chosenFor?: string; anotherOption: string }>;
  /** Today's order, kuyara's first pick first; empty when the day has no outfit. */
  outfits: readonly Readonly<{ optionId: string; name: string; pieces: readonly string[] }>[];
}>;

/** The most outfits the card steps through: the snapshot's offer. */
const summaryOutfitLimit = 3;

/**
 * The summary of a saved snapshot, bounded by the snapshot's own dressing day on the device's
 * zone, or null when the snapshot has no dressing day or the zone is unknown. It carries no
 * location, identity, Closet, provider or AI text.
 */
export function outfitSummary(input: Readonly<{
  snapshot: Pick<RecommendationSnapshot, 'localDayKey' | 'paletteWeather' | 'recommendation'>;
  language: SupportedLanguage;
  temperatureUnit: TemperatureUnit;
  timeZone: string;
}>): OutfitSummary | null {
  const { snapshot, language } = input;
  const key = snapshot.localDayKey;
  const bounds = key === null ? null : dressingDayBounds(key, input.timeZone);
  if (key === null || bounds === null) return null;
  const copy = messages[language];
  const dayKind = dressingDayKind(key);
  const outfits = (snapshot.recommendation.status === 'recommended' ? snapshot.recommendation.outfits : [])
    .slice(0, summaryOutfitLimit)
    .map((outfit) => ({
      optionId: outfit.optionId,
      name: archetypeLabel(copy.recommendation, outfit.archetypeId, dayKind),
      pieces: assignedOutfitGarments(outfit).map(({ garment }) =>
        copy.catalog[`catalog.garment_type.${garment.garmentTypeId}.name`]),
    }));
  const first = outfits[0];
  const spoken = isEveningDressingDayKey(key) ? copy.siri.spokenEvening : copy.siri.spokenDay;
  const weather = snapshot.paletteWeather;

  return {
    version: 1,
    language,
    timeZone: input.timeZone,
    validFrom: bounds.start,
    validUntil: bounds.end,
    spokenLine: first ? spoken({ outfit: first.name, pieces: first.pieces }) : copy.siri.noOutfit,
    labels: {
      ...(weather ? {
        chosenFor: copy.siri.chosenFor({
          temperature: formatWholeTemperature(weather.temperatureC, language, input.temperatureUnit),
          condition: copy.weather.conditions[weather.condition],
        }),
      } : {}),
      anotherOption: copy.siri.anotherOption,
    },
    outfits,
  };
}
