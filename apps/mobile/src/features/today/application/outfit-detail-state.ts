import { zonedClock, zonedDateKey } from '@/domain/intl-format';
import type {
  OutfitRecommendationResult,
  RecommendedOutfit,
} from '@/features/recommendation/application/recommend-outfits';
import type { RecommendationApplicationState } from '@/features/recommendation/application/recommendation-application-controller';
import type { RecommendationSnapshot } from '@/features/recommendation/application/recommendation-repository';
import {
  wornAlready,
  wornOutfitFrom,
  type WornOutfit,
} from '@/features/recommendation/domain/outfit-history';
import { moreIdeas } from '@/features/today/application/today-state';
import { activeLocationRecommendation, todayFreshness, type TodayScreenState } from '@/features/today/model';
import type { WeatherApplicationState } from '@/features/weather/application/weather-application-controller';
import { isBeforeDayStart } from '@/features/weather/domain/wardrobe-day';
import { activeLocationSnapshot, weatherFreshness, type DailyWeather, type WeatherSnapshot } from '@/features/weather/domain/weather';
import type { ClosetSeedPiece } from '@/features/wardrobe/application/closet-seed';
import type { WardrobeEntryState } from '@/features/wardrobe/domain/wardrobe-item';

/**
 * The empty Closet's offer on detail: `offer` shows "Add this to my Closet", whose tap asks
 * once whether the pieces are owned or wanted; `busy` is that answer being saved, `failed`
 * offers it again with the failure, `added` names how many pieces went in.
 */
export type ClosetSeedOffer = Readonly<{
  status: 'offer' | 'busy' | 'failed' | 'added';
  addedCount: number;
  onSeed: (pieces: readonly ClosetSeedPiece[], entryState: WardrobeEntryState) => void;
}>;

/** The seeding the detail route has started: running, failed, or done with its count. */
export type ClosetSeedProgress = Readonly<{ status: 'busy' | 'failed' } | { status: 'added'; count: number }>;

/**
 * Whether today's worn looks hold this outfit (`this`), only others (`other`), none, or are not
 * read yet (`unknown`). A day can hold several looks (ADR 0038).
 */
export type OutfitWornState = 'this' | 'other' | 'none' | 'unknown';

/**
 * The forecast row a stored preview was chosen for, or null when the forecast has none, so
 * neither the strip nor its detail ever shows an outfit without the weather it was chosen for.
 */
export function tomorrowForecastDay(preview: RecommendationSnapshot, weather: WeatherSnapshot): DailyWeather | null {
  const departure = preview.coverageStart ? Date.parse(preview.coverageStart) : NaN;
  const dateKey = Number.isFinite(departure)
    ? zonedDateKey(departure, weather.timeZone) : preview.localDayKey;
  if (!dateKey) return null;
  return weather.daily?.find((day) => day.dateKey === dateKey) ?? null;
}

/**
 * Whether the preview's day is the morning the place's clock is already in: between midnight
 * and 04:00 the coming morning is "This morning". The strip and the detail title both read it.
 */
export function previewIsThisMorning(now: number, timeZone: string, dateKey: string): boolean {
  return isBeforeDayStart(zonedClock(now, timeZone).hour) && zonedDateKey(now, timeZone) === dateKey;
}

/** Tomorrow's detail is titled "This morning" while its forecast day is the place's current morning. */
export function tomorrowDetailIsThisMorning(state: TodayScreenState, now: number): boolean {
  return state.kind === 'loaded' && state.forecastDay != null &&
    previewIsThisMorning(now, state.snapshot.weather.timeZone, state.forecastDay.dateKey);
}

/** Detail of the evening preview reads its own outfit and the active place's forecast. */
export function tomorrowDetailState(
  weather: WeatherApplicationState,
  preview: RecommendationSnapshot | null,
  now: string,
): TodayScreenState {
  if (weather.status !== 'ready' || !preview || !weather.activeLocation) return { kind: 'unavailable' };
  const placeSnapshot = activeLocationSnapshot(weather.snapshot, weather.activeLocation);
  if (!placeSnapshot) return { kind: 'unavailable' };
  const forecastDay = tomorrowForecastDay(preview, placeSnapshot);
  if (!forecastDay || !activeLocationRecommendation(preview, weather.activeLocation)) {
    return { kind: 'unavailable' };
  }
  return {
    kind: 'loaded',
    snapshot: {
      weather: placeSnapshot,
      activeLocation: weather.activeLocation,
      freshness: todayFreshness(weatherFreshness(placeSnapshot.fetchedAt, now)),
      recommendation: preview.recommendation,
      coverageStart: preview.coverageStart,
      coverageEnd: preview.coverageEnd,
    },
    isRefreshing: weather.isRefreshing,
    refreshFailed: weather.refreshFailure !== null,
    forecastDay,
  };
}

/**
 * The outfit a detail route is keyed by, and its 1-based place among the three, or one of
 * Today's "More ideas" with no place. The key is the outfit's stable option id, so a
 * regeneration cannot swap another outfit under the reader; an id the recommendation and its
 * pool no longer offer finds nothing.
 */
export function detailOutfit(
  recommendation: OutfitRecommendationResult | null,
  suggestionId: string | undefined,
  /** The provider's state, whose composed pool holds Today's "More ideas"; null reads none. */
  ideasFrom: RecommendationApplicationState | null = null,
): Readonly<{ outfit: RecommendedOutfit | null; position: 1 | 2 | 3 | null }> {
  const outfits = recommendation?.status === 'recommended' ? recommendation.outfits : [];
  const outfitIndex = outfits.findIndex(({ optionId }) => optionId === suggestionId);
  const outfit = outfits[outfitIndex] ?? null;
  if (outfit) return { outfit, position: (outfitIndex + 1) as 1 | 2 | 3 };
  // An idea holds no place among the three. The recommendation is the active place's, so a
  // previous place's pool offers nothing.
  const idea = recommendation && ideasFrom?.status === 'ready' && ideasFrom.snapshot
    ? moreIdeas(ideasFrom.pool, ideasFrom.snapshot).find(({ optionId }) => optionId === suggestionId)
    : undefined;
  return { outfit: idea ?? null, position: null };
}

/**
 * An outfit opened from Today's "More ideas": the composed pool's outfit stands alone in the
 * recommendation detail reads, as kuyara composed it on the device, so its source sentence and
 * missing badge say so, and the weather line is the deterministic one. Null for any id that is
 * not one of the state's ideas, including the outfits on screen.
 */
export function ideaDetail(
  state: TodayScreenState,
  suggestionId: string | undefined,
): TodayScreenState | null {
  if (state.kind !== 'loaded' || state.snapshot.recommendation.status !== 'recommended') return null;
  const outfit = state.snapshot.moreIdeas?.find(({ optionId }) => optionId === suggestionId);
  if (!outfit) return null;
  const { moreIdeas: _ideas, recommendation, ...snapshot } = state.snapshot;
  const { insightSentence: _sentence, insightLocale: _locale, ...settled } = recommendation;
  return {
    ...state,
    snapshot: {
      ...snapshot,
      recommendation: { ...settled, generationMode: 'deterministic-fallback', outfits: [outfit] },
    },
  };
}

/** The worn record for an outfit, or none when it does not parse. */
export function wornOutfitOrNull(...args: Parameters<typeof wornOutfitFrom>): WornOutfit | null {
  try {
    return wornOutfitFrom(...args);
  } catch {
    return null;
  }
}

/**
 * ADR 0038: the open outfit against the dressing day's worn looks. Tomorrow's preview and a
 * day not read yet say nothing.
 */
export function outfitWornState(
  tomorrow: boolean,
  dayWorn: Readonly<{ looks: readonly WornOutfit[] }> | null,
  thisWorn: WornOutfit | null,
): OutfitWornState {
  return tomorrow || !dayWorn || !thisWorn
    ? 'unknown'
    : dayWorn.looks.length === 0 ? 'none'
      : wornAlready(dayWorn.looks, thisWorn) ? 'this' : 'other';
}

/**
 * The empty Closet's offer: shown while the Closet is empty, and once more right after the
 * seeding filled it, to name how many pieces went in.
 */
export function closetSeedOffer(
  progress: ClosetSeedProgress | null,
  closetEmpty: boolean,
  onSeed: ClosetSeedOffer['onSeed'],
): ClosetSeedOffer | null {
  return progress?.status === 'added'
    ? { status: 'added', addedCount: progress.count, onSeed }
    : closetEmpty ? { status: progress?.status ?? 'offer', addedCount: 0, onSeed } : null;
}
