import type {
  AiRecommendV1Request,
  AiRecommendV1Success,
} from '@kuyara/contracts';

import {
  recommendOutfits,
  type OutfitRecommendationInput,
  type OutfitRecommendationSuccess,
} from '@/features/recommendation/application/recommend-outfits';
import type {
  RecommendationRepository,
  RecommendationSnapshot,
} from '@/features/recommendation/data/recommendation-repository';
import {
  aiRequestFromContext,
  createRecommendationContext,
  mapWorkerAiRecommendation,
  type RecommendationContext,
} from '@/features/recommendation/data/worker-ai-recommendation-mapper';
import type { WardrobeItem } from '@/features/wardrobe/domain/wardrobe-item';

export type RecommendationRefreshTrigger =
  | 'app-opened'
  | 'stale-weather-refreshed'
  | 'active-location-changed'
  | 'clothing-preference-changed'
  | 'wardrobe-changed'
  | 'explicit';

export type RecommendationSignals = Readonly<{
  weatherSnapshotId: string;
  locationKey: string;
  clothingPreference: string;
  wardrobeKey: string;
}>;

export function shouldRefreshRecommendation(
  trigger: RecommendationRefreshTrigger,
): boolean {
  return trigger !== 'app-opened';
}

export function recommendationRefreshTrigger(
  previous: RecommendationSignals | null,
  current: RecommendationSignals,
  staleRefreshSnapshotId: string | null,
): RecommendationRefreshTrigger | null {
  if (
    staleRefreshSnapshotId &&
    staleRefreshSnapshotId !== current.weatherSnapshotId
  ) return 'stale-weather-refreshed';
  if (!previous) return null;
  if (previous.locationKey !== current.locationKey) {
    return 'active-location-changed';
  }
  if (previous.clothingPreference !== current.clothingPreference) {
    return 'clothing-preference-changed';
  }
  if (previous.wardrobeKey !== current.wardrobeKey) return 'wardrobe-changed';
  return null;
}

export function recommendationWardrobeKey(
  items: readonly WardrobeItem[],
): string {
  return JSON.stringify([...items]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((item) => [
      item.id,
      item.category,
      item.garmentTypeId,
      item.colorFamily,
      item.thermalLevelOverride,
      item.waterProtectionOverride,
      item.windProtectionOverride,
      item.breathabilityOverride,
      item.armCoverageOverride,
      item.legCoverageOverride,
      item.tractionSuitabilityOverride,
      item.deletedAt,
    ]));
}

export type RecommendationApplicationState =
  | Readonly<{ status: 'loading' }>
  | Readonly<{
      status: 'ready';
      snapshot: RecommendationSnapshot | null;
      isRefreshing: boolean;
    }>;

type AiClient = Readonly<{
  recommend(
    request: AiRecommendV1Request,
  ): Promise<AiRecommendV1Success['data']>;
}>;

type Dependencies = Readonly<{
  loadRepository: () => Promise<RecommendationRepository>;
  client: AiClient;
}>;

type Listener = () => void;

export class RecommendationApplicationController {
  private state: RecommendationApplicationState = { status: 'loading' };
  private repository: RecommendationRepository | null = null;
  private initializationPromise: Promise<void> | null = null;
  private readonly refreshes = new Map<string, Promise<RecommendationSnapshot | null>>();
  private latestRequestKey: string | null = null;
  private readonly listeners = new Set<Listener>();
  private readonly localProfileId: string;
  private readonly dependencies: Dependencies;

  constructor(localProfileId: string, dependencies: Dependencies) {
    this.localProfileId = localProfileId;
    this.dependencies = dependencies;
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
    input: OutfitRecommendationInput,
  ): Promise<RecommendationSnapshot | null> {
    if (!shouldRefreshRecommendation(trigger)) {
      return Promise.resolve(this.currentSnapshot());
    }

    let context: RecommendationContext;
    try {
      context = createRecommendationContext(input);
    } catch {
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
    const refresh = this.refreshOnce(key, context, request, input).finally(() => {
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
      this.setReady({ status: 'ready', snapshot, isRefreshing: false });
    } catch {
      this.setReady({ status: 'ready', snapshot: null, isRefreshing: false });
    }
  }

  private async refreshOnce(
    key: string,
    context: RecommendationContext,
    request: AiRecommendV1Request | null,
    input: OutfitRecommendationInput,
  ): Promise<RecommendationSnapshot | null> {
    let recommendation: OutfitRecommendationSuccess;
    try {
      if (!request) throw new Error('No AI requirements.');
      recommendation = mapWorkerAiRecommendation(request, await this.dependencies.client.recommend(request));
    } catch {
      const fallback = recommendOutfits(input);
      if (fallback.status !== 'recommended') return this.currentSnapshot();
      recommendation = fallback;
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
        this.setReady({ status: 'ready', snapshot, isRefreshing: true });
      }
      return snapshot;
    } catch {
      return this.currentSnapshot();
    }
  }

  private currentSnapshot(): RecommendationSnapshot | null {
    return this.state.status === 'ready' ? this.state.snapshot : null;
  }

  private requireRepository(): RecommendationRepository {
    if (!this.repository) throw new Error('Recommendation repository is unavailable.');
    return this.repository;
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
