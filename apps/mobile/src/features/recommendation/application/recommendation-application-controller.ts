import type { AiRecommendV1Request, DressStyle } from '@kuyara/contracts';

import {
  failureCategoryFromErrorKind,
  type FailureCategory,
} from '@/domain/failure-category';
import {
  ANALYTICS_SCHEMA_VERSION,
} from '@/features/analytics/domain/analytics-events';
import { generationModeProperty, triggerReasonProperty } from '@/features/analytics/domain/analytics-mappers';
import type { CaptureAnalyticsEvent } from '@/features/analytics/domain/product-analytics';
import {
  recommendOutfits,
  type OutfitRecommendationInput,
  type OutfitRecommendationSuccess,
} from '@/features/recommendation/application/recommend-outfits';
import type {
  RecommendationRepository,
  RecommendationSnapshot,
} from '@/features/recommendation/data/recommendation-repository';
import { WorkerAiClientError } from '@/features/recommendation/data/worker-ai-client';
import {
  aiRequestFromContext,
  createRecommendationContext,
  type RecommendationContext,
} from '@/features/recommendation/data/worker-ai-recommendation-mapper';

export type RecommendationRefreshTrigger =
  | 'first-recommendation'
  | 'stale-weather-refreshed'
  | 'active-location-changed'
  | 'clothing-preference-changed'
  | 'dress-style-changed'
  | 'local-day-changed'
  | 'explicit';

export type RecommendationSignals = Readonly<{
  weatherSnapshotId: string;
  locationKey: string;
  clothingPreference: string;
  dressStyle: DressStyle;
  localDayKey: string | null;
}>;

export type RecommendationApplicationInput = OutfitRecommendationInput & Readonly<{
  localDayKey: string;
}>;

export function recommendationRefreshTrigger(
  previous: RecommendationSignals | null,
  current: RecommendationSignals,
  staleRefreshSnapshotId: string | null,
): RecommendationRefreshTrigger | null {
  if (
    staleRefreshSnapshotId &&
    staleRefreshSnapshotId !== current.weatherSnapshotId
  ) return 'stale-weather-refreshed';
  if (!previous) return 'first-recommendation';
  if (previous.locationKey !== current.locationKey) {
    return 'active-location-changed';
  }
  if (previous.clothingPreference !== current.clothingPreference) {
    return 'clothing-preference-changed';
  }
  if (previous.dressStyle !== current.dressStyle) return 'dress-style-changed';
  if (previous.localDayKey !== current.localDayKey) return 'local-day-changed';
  return null;
}

export type RecommendationApplicationState =
  | Readonly<{ status: 'loading' }>
  | Readonly<{
      status: 'ready';
      snapshot: RecommendationSnapshot | null;
      isRefreshing: boolean;
      lastFailure: FailureCategory | null;
    }>;

// The Worker client is the only error this feature can classify. Its kinds are
// 'invalid-request' | 'network' | 'service' | 'invalid-response'; it has no rate-limit
// kind today, so a throttled Worker arrives as 'service' and classifies as 'unavailable'.
// Anything else thrown here (a composition invariant, a repository throw, a bare Error)
// is 'unknown'.
function recommendationFailureCategory(error: unknown): FailureCategory {
  return error instanceof WorkerAiClientError
    ? failureCategoryFromErrorKind(error.kind)
    : 'unknown';
}

// The routed client of ADR 0034 section 1: it answers with the picks and with the tier that
// produced them, named as the generation mode the snapshot stores.
type AiClient = Readonly<{
  recommendRouted(
    request: AiRecommendV1Request,
  ): Promise<OutfitRecommendationSuccess>;
}>;

type Dependencies = Readonly<{
  loadRepository: () => Promise<RecommendationRepository>;
  client: AiClient;
  // Optional: `recommendation_regenerated` fires on every completed attempt in `refreshOnce`,
  // which already knows the trigger (passed into `refresh()`) and the exact outcome branch
  // taken; a no-op default keeps existing composition and tests unchanged.
  captureAnalyticsEvent?: CaptureAnalyticsEvent;
}>;

type Listener = () => void;

export function localDayVariant(date: Date = new Date()): number {
  const dayOfYear = Math.floor(
    (Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) -
      Date.UTC(date.getFullYear(), 0, 0)) /
      (24 * 60 * 60 * 1000),
  );
  return dayOfYear % 7;
}

export function localDayKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function previousDayOptionIds(
  snapshot: RecommendationSnapshot | null,
  currentLocalDayKey: string,
): readonly string[] {
  if (
    !snapshot?.localDayKey ||
    snapshot.localDayKey === currentLocalDayKey ||
    snapshot.recommendation.outfits.length !== 3
  ) return [];
  return snapshot.recommendation.outfits.map(({ optionId }) => optionId);
}

export class RecommendationApplicationController {
  private state: RecommendationApplicationState = { status: 'loading' };
  private repository: RecommendationRepository | null = null;
  private initializationPromise: Promise<void> | null = null;
  private readonly refreshes = new Map<string, Promise<RecommendationSnapshot | null>>();
  private latestRequestKey: string | null = null;
  private readonly listeners = new Set<Listener>();
  private readonly localProfileId: string;
  private readonly dependencies: Dependencies;
  private readonly captureAnalyticsEvent: CaptureAnalyticsEvent;

  constructor(localProfileId: string, dependencies: Dependencies) {
    this.localProfileId = localProfileId;
    this.dependencies = dependencies;
    this.captureAnalyticsEvent = dependencies.captureAnalyticsEvent ?? (() => undefined);
  }

  getSnapshot = (): RecommendationApplicationState => this.state;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  initialize(): Promise<void> {
    if (!this.initializationPromise) {
      this.initializationPromise = this.initializeOnce();
    }
    return this.initializationPromise;
  }

  refresh(
    trigger: RecommendationRefreshTrigger,
    input: RecommendationApplicationInput,
  ): Promise<RecommendationSnapshot | null> {
    let context: RecommendationContext;
    const generationInput = {
      ...input,
      excludedOptionIds: previousDayOptionIds(this.currentSnapshot(), input.localDayKey),
    };
    try {
      context = createRecommendationContext(generationInput, input.localDayKey);
    } catch (error) {
      this.setLastFailure(recommendationFailureCategory(error));
      return Promise.resolve(this.currentSnapshot());
    }
    const request = aiRequestFromContext(context);
    const key = JSON.stringify({
      weatherSnapshotId: input.snapshot.id,
      locationKey: input.snapshot.locationKey,
      context,
    });
    const existing = this.refreshes.get(key);
    if (existing) return existing;

    this.latestRequestKey = key;
    this.setRefreshing(true);
    const refresh = this.refreshOnce(key, context, request, generationInput, trigger).finally(() => {
      this.refreshes.delete(key);
      if (this.latestRequestKey === key) this.setRefreshing(false);
    });
    this.refreshes.set(key, refresh);
    return refresh;
  }

  private async initializeOnce(): Promise<void> {
    try {
      this.repository = await this.dependencies.loadRepository();
      const snapshot = await this.repository.getSnapshot(this.localProfileId);
      this.setReady({ status: 'ready', snapshot, isRefreshing: false, lastFailure: null });
    } catch (error) {
      this.setReady({
        status: 'ready',
        snapshot: null,
        isRefreshing: false,
        lastFailure: recommendationFailureCategory(error),
      });
    }
  }

  private async refreshOnce(
    key: string,
    context: RecommendationContext,
    request: AiRecommendV1Request | null,
    input: RecommendationApplicationInput,
    trigger: RecommendationRefreshTrigger,
  ): Promise<RecommendationSnapshot | null> {
    // The deterministic fallback composes from the same catalog and effectively always
    // succeeds, so an AI failure alone is not a failure the user sees. It is still the
    // root cause when something after it leaves the state without a snapshot, so it is
    // remembered here and preferred over a later, less specific throw.
    let recommendation: OutfitRecommendationSuccess | null = null;
    let aiFailure: FailureCategory | null = null;
    if (request) {
      try {
        // The routed client runs the shared validation gate inside its own chain, so what
        // comes back here is already a validated recommendation from whichever tier won.
        recommendation = await this.dependencies.client.recommendRouted(request);
      } catch (error) {
        aiFailure = recommendationFailureCategory(error);
      }
    }
    if (!recommendation) {
      try {
        const fallback = recommendOutfits(input);
        if (fallback.status !== 'recommended') {
          this.setLastFailure(aiFailure ?? 'unknown');
          this.captureRegenerated(trigger, this.currentSnapshot() !== null);
          return this.currentSnapshot();
        }
        recommendation = fallback;
      } catch (error) {
        this.setLastFailure(aiFailure ?? recommendationFailureCategory(error));
        this.captureRegenerated(trigger, this.currentSnapshot() !== null);
        return this.currentSnapshot();
      }
    }

    if (this.latestRequestKey !== key) return this.currentSnapshot();
    try {
      const snapshot = await this.requireRepository().saveSnapshot(
        this.localProfileId,
        {
          weatherSnapshotId: input.snapshot.id,
          locationKey: input.snapshot.locationKey,
          context,
          recommendation,
        },
      );
      if (this.latestRequestKey === key) {
        this.setReady({ status: 'ready', snapshot, isRefreshing: true, lastFailure: null });
      }
      this.captureAnalyticsEvent('recommendation_regenerated', {
        schema_version: ANALYTICS_SCHEMA_VERSION,
        trigger_reason: triggerReasonProperty(trigger),
        result: 'success',
        generation_mode: generationModeProperty(snapshot.generationMode),
      });
      return snapshot;
    } catch (error) {
      this.setLastFailure(aiFailure ?? recommendationFailureCategory(error));
      this.captureRegenerated(trigger, this.currentSnapshot() !== null);
      return this.currentSnapshot();
    }
  }

  // Taxonomy 5.5: both failure forms omit `generation_mode`, since no newly generated
  // result exists.
  private captureRegenerated(trigger: RecommendationRefreshTrigger, keptLastKnown: boolean): void {
    this.captureAnalyticsEvent('recommendation_regenerated', {
      schema_version: ANALYTICS_SCHEMA_VERSION,
      trigger_reason: triggerReasonProperty(trigger),
      result: keptLastKnown ? 'failure_kept_last_known' : 'failure_no_snapshot',
    });
  }

  private currentSnapshot(): RecommendationSnapshot | null {
    return this.state.status === 'ready' ? this.state.snapshot : null;
  }

  private requireRepository(): RecommendationRepository {
    if (!this.repository) throw new Error('Recommendation repository is unavailable.');
    return this.repository;
  }

  private setLastFailure(lastFailure: FailureCategory): void {
    if (this.state.status === 'ready') {
      this.setReady({ ...this.state, lastFailure });
    }
  }

  private setRefreshing(isRefreshing: boolean): void {
    if (this.state.status === 'ready') {
      this.setReady({ ...this.state, isRefreshing });
    }
  }

  private setReady(state: Extract<RecommendationApplicationState, { status: 'ready' }>): void {
    this.state = state;
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
