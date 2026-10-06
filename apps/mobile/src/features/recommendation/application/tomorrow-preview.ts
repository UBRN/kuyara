import type { AiRecommendV1Request } from '@kuyara/contracts';

import type { SupportedLanguage } from '@/domain/preferences';
import {
  recommendOutfits,
  type OutfitRecommendationInput,
  type OutfitRecommendationSuccess,
} from '@/features/recommendation/application/recommend-outfits';
import type {
  RecommendationSnapshot,
  RecommendationSnapshotInput,
} from '@/features/recommendation/application/recommendation-repository';
import type { RecommendationContext } from '@/features/recommendation/data/worker-ai-recommendation-mapper';
import { forecastBoundedCoverage, outfitCoverage } from '@/features/recommendation/domain/outfit-coverage';
import type { WornOutfit } from '@/features/recommendation/domain/outfit-history';
import type { WeatherSnapshot } from '@/features/weather/domain/weather';
import { defaultDressStyle, sameStyleAesthetics } from '@/features/profile/domain/profile';

/**
 * Whether the forecast describes the whole coverage window an outfit chosen for `departureAt`
 * would promise. Tomorrow's preview is chosen only then: an outfit for hours the forecast does
 * not reach would be a guess.
 */
export function forecastCoversWindow(snapshot: WeatherSnapshot, departureAt: string): boolean {
  const coverage = outfitCoverage(departureAt, snapshot.timeZone);
  if (!coverage) return false;
  return forecastBoundedCoverage(coverage, snapshot.hourly)?.end === coverage.end &&
    snapshot.hourly.some(({ forecastAt }) => Date.parse(forecastAt) <= Date.parse(coverage.start));
}

/**
 * Whether a stored preview still answers the question asked: the same dressing day, place,
 * gender, dress style and sorted styles. The one owner of that comparison, so what Today shows
 * and what the morning reuses cannot drift apart.
 */
export function previewAnswersQuestion(
  preview: RecommendationSnapshot,
  question: Readonly<{
    localDayKey: string | undefined;
    locationKey: string;
    clothingPreference: string;
    dressStyle: RecommendationSnapshot['dressStyle'];
    styleAesthetics: readonly string[];
  }>,
): boolean {
  return preview.localDayKey === question.localDayKey &&
    preview.locationKey === question.locationKey &&
    preview.clothingPreference === question.clothingPreference &&
    preview.dressStyle === question.dressStyle &&
    sameStyleAesthetics(preview.styleAesthetics, question.styleAesthetics);
}

/**
 * The reuse rule: when the dressing day a preview was chosen for arrives, its selection stands
 * in for a new one only if nothing the selection depended on has moved. The place, gender,
 * resolved formality, sorted styles, catalog version and day variant must match, the weather
 * must still ask for exactly the same requirements, and every pick must still be among the
 * options this generation offers (so a shown, excluded or newly worn option asks again). Only
 * a stylist's selection is reused; a deterministic preview leaves the day to its own chain.
 */
export function reusablePreviewRecommendation(
  preview: RecommendationSnapshot | null,
  context: RecommendationContext,
  locationKey: string,
): OutfitRecommendationSuccess | null {
  if (!preview || !('options' in context)) return null;
  const recommendation = preview.recommendation;
  const offered = new Set(context.options.map(({ optionId }) => optionId));
  const same = previewAnswersQuestion(preview, {
    localDayKey: context.localDayKey,
    locationKey,
    clothingPreference: context.clothingPreference,
    dressStyle: context.dressStyle ?? defaultDressStyle,
    styleAesthetics: context.styleAesthetics ?? [],
  }) &&
    preview.catalogVersion === context.catalogVersion &&
    preview.dayVariant === context.dayVariant &&
    JSON.stringify(recommendation.requirements.requirements) === JSON.stringify(context.requirements);
  return same && recommendation.generationMode !== 'deterministic-fallback' &&
    recommendation.outfits.every(({ optionId }) => offered.has(optionId))
    ? recommendation
    : null;
}

export type TomorrowPreviewStore = Readonly<{
  /** True once per profile and dressing day: the one selection that day may run. */
  claim(localProfileId: string, dayKey: string): Promise<boolean>;
  /** The valid preview for exactly this day, or null for anything else, unreadable included. */
  get(localProfileId: string, dayKey: string): Promise<RecommendationSnapshot | null>;
  save(localProfileId: string, input: RecommendationSnapshotInput): Promise<RecommendationSnapshot>;
}>;

type Dependencies = Readonly<{
  store: TomorrowPreviewStore;
  // The offered options and the AI request for an input, built exactly as today's generation
  // builds them (`createRecommendationContextWithPool`, then `aiRequestFromContext`).
  compose: (input: TomorrowPreviewInput) => Readonly<{
    context: RecommendationContext;
    request: AiRecommendV1Request | null;
  }>;
  client: Readonly<{
    recommendRouted(
      request: AiRecommendV1Request,
      options?: Readonly<{ locale?: SupportedLanguage }>,
    ): Promise<OutfitRecommendationSuccess>;
  }>;
  loadRecentWorn?: () => Promise<readonly WornOutfit[]>;
}>;

export type TomorrowPreviewInput = OutfitRecommendationInput & Readonly<{
  localDayKey: string;
  locale?: SupportedLanguage;
}>;

type Listener = () => void;

/**
 * Tomorrow's outfit, chosen once in the evening through the same chain and the same validation
 * as today's, and kept apart from it: it never touches today's snapshot, phase or failure, and
 * it records no analytics. A failed stylist answer falls back to the deterministic three, and a
 * failure past that leaves no preview rather than an error.
 */
export class TomorrowPreviewController {
  private snapshot: RecommendationSnapshot | null = null;
  // One selection per day key for the life of the controller: a repeated ask joins the first.
  private readonly attempts = new Map<string, Promise<void>>();
  private readonly listeners = new Set<Listener>();
  private readonly localProfileId: string;
  private readonly dependencies: Dependencies;

  constructor(localProfileId: string, dependencies: Dependencies) {
    this.localProfileId = localProfileId;
    this.dependencies = dependencies;
  }

  getSnapshot = (): RecommendationSnapshot | null => this.snapshot;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Reads the stored preview for a day, so a restart shows it without selecting again. */
  async load(dayKey: string): Promise<void> {
    const stored = await this.dependencies.store.get(this.localProfileId, dayKey).catch(() => null);
    if (stored) this.set(stored);
  }

  /** Selects the day's preview unless one exists or the day's single claim is already spent. */
  ensure(input: TomorrowPreviewInput): Promise<void> {
    if (this.snapshot?.localDayKey === input.localDayKey) return Promise.resolve();
    const existing = this.attempts.get(input.localDayKey);
    if (existing) return existing;
    const run = this.select(input);
    this.attempts.set(input.localDayKey, run);
    return run;
  }

  private async select(input: TomorrowPreviewInput): Promise<void> {
    const { store } = this.dependencies;
    try {
      if (!(await store.claim(this.localProfileId, input.localDayKey))) {
        await this.load(input.localDayKey);
        return;
      }
      const recentWorn = await this.dependencies.loadRecentWorn?.() ?? [];
      const generationInput = { ...input, recentWorn };
      const { context, request } = this.dependencies.compose(generationInput);
      let recommendation: OutfitRecommendationSuccess | null = null;
      if (request) {
        recommendation = await this.dependencies.client
          .recommendRouted(request, { locale: input.locale ?? 'en' })
          .catch(() => null);
      }
      if (!recommendation) {
        const fallback = recommendOutfits(generationInput);
        if (fallback.status !== 'recommended') return;
        recommendation = fallback;
      }
      this.set(await store.save(this.localProfileId, {
        weatherSnapshotId: input.snapshot.id,
        locationKey: input.snapshot.locationKey,
        context: recommendation.insightSentence && recommendation.insightLocale
          ? { ...context, insightSentence: recommendation.insightSentence,
            insightLocale: recommendation.insightLocale }
          : context,
        recommendation,
      }));
    } catch {
      // No preview is shown; today's outfit and its state are untouched.
    }
  }

  private set(snapshot: RecommendationSnapshot): void {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener();
  }
}
