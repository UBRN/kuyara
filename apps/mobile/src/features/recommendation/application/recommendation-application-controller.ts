import type { AiRecommendV1Request, DressStyle, StyleAesthetic } from '@kuyara/contracts';

import type { SupportedLanguage } from '@/domain/preferences';
import { sameStyleAesthetics } from '@/features/profile/domain/profile';
import {
  failureCategoryFromErrorKind,
  type FailureCategory,
} from '@/domain/failure-category';
import {
  ANALYTICS_SCHEMA_VERSION,
} from '@/features/analytics/domain/analytics-events';
import { generationModeProperty, triggerReasonProperty } from '@/features/analytics/domain/analytics-mappers';
import {
  TelemetryError,
  type PerformanceTelemetry,
} from '@/features/analytics/domain/performance-telemetry';
import {
  recommendationGeneratedAttributes,
  telemetryFailureKind,
} from '@/features/analytics/domain/performance-telemetry-events';
import type { CaptureAnalyticsEvent } from '@/features/analytics/domain/product-analytics';
import { garmentCatalogVersion } from '@/features/catalog/domain/garment-catalog';
import {
  composeOutfitPool,
  outfitOptionId,
  recommendOutfits,
  type OutfitRecommendationInput,
  type OutfitRecommendationSuccess,
  type RecommendedOutfit,
} from '@/features/recommendation/application/recommend-outfits';
import {
  RecommendationRepositoryError,
  type RecommendationRepository,
  type RecommendationSnapshot,
} from '@/features/recommendation/application/recommendation-repository';
import type { OnDeviceAiAvailability } from '@/features/recommendation/domain/on-device-ai-availability';
import type { WornOutfit } from '@/features/recommendation/domain/outfit-history';
import type { OutfitCandidate } from '@/features/recommendation/domain/outfit-composition';
import { deriveClothingRequirements } from '@/features/recommendation/domain/weather-to-clothing-requirements';
import { poolCompositionKey } from '@/features/recommendation/application/pool-composition-key';
import { reusablePreviewRecommendation } from '@/features/recommendation/application/tomorrow-preview';
import { WorkerAiClientError } from '@/features/recommendation/domain/worker-ai-client-error';
import {
  aiRequestFromContext,
  createRecommendationContextWithPool,
  type RecommendationContext,
} from '@/features/recommendation/data/worker-ai-recommendation-mapper';

// Today reads the archetype label, and a feature reaches this one only through its application layer.
export { archetypeLabel } from '@/features/recommendation/localization/recommendation-messages';

export type RecommendationRefreshTrigger =
  | 'first-recommendation'
  | 'active-location-changed'
  | 'clothing-preference-changed'
  | 'dress-style-changed'
  | 'local-day-changed'
  | 'explicit'
  // Today's "show another outfit" action. It regenerates the recommendation only and never
  // touches weather, which is what separates it from the pull gesture's 'explicit'.
  | 'regenerate';

export type RecommendationSignals = Readonly<{
  weatherSnapshotId: string;
  locationKey: string;
  clothingPreference: string;
  dressStyle: DressStyle;
  styleAesthetics?: readonly StyleAesthetic[];
  catalogVersion: number | null;
  localDayKey: string | null;
}>;

export type RecommendationApplicationInput = OutfitRecommendationInput & Readonly<{
  localDayKey: string;
  locale?: SupportedLanguage;
}>;

export function recommendationRefreshTrigger(
  previous: RecommendationSignals | null,
  current: RecommendationSignals,
): RecommendationRefreshTrigger | null {
  if (!previous) return 'first-recommendation';
  if (previous.catalogVersion !== current.catalogVersion) {
    return 'first-recommendation';
  }
  if (previous.locationKey !== current.locationKey) {
    return 'active-location-changed';
  }
  if (previous.clothingPreference !== current.clothingPreference) {
    return 'clothing-preference-changed';
  }
  if (previous.dressStyle !== current.dressStyle) return 'dress-style-changed';
  if (!sameStyleAesthetics(previous.styleAesthetics, current.styleAesthetics)) return 'dress-style-changed';
  if (previous.localDayKey !== current.localDayKey) return 'local-day-changed';
  return null;
}

export function expiredCoverageNeedsSelection(
  snapshot: RecommendationSnapshot | null,
  foregroundAt: string,
  foreground: boolean,
  lastAttemptedEnd: string | null,
): boolean {
  return Boolean(foreground && snapshot?.coverageEnd &&
    snapshot.coverageEnd !== lastAttemptedEnd &&
    Number.isFinite(Date.parse(foregroundAt)) &&
    Date.parse(snapshot.coverageEnd) <= Date.parse(foregroundAt));
}

// What the wait is doing right now, so Today can say it instead of showing one generic line
// for a wait that can run to the AI chain's whole length. Coarse by construction: no provider,
// no model, no tier that is not already a user-visible generation mode.
export type RecommendationPhase =
  | 'checking-on-device'
  | 'asking-stylist'
  | 'answer-received'
  | 'preparing-outfits'
  | 'using-standard';

export type RecommendationApplicationState =
  | Readonly<{ status: 'loading' }>
  | Readonly<{
      status: 'ready';
      snapshot: RecommendationSnapshot | null;
      isRefreshing: boolean;
      lastFailure: FailureCategory | null;
      // Null whenever `isRefreshing` is false: a settled state has no phase.
      phase: RecommendationPhase | null;
      exhausted: boolean;
      showFirstGenerationOverlay: boolean;
      /**
       * The pool the shown outfits were picked from, as composed for them: Today's "More ideas"
       * reads it and composes nothing. Absent or null when it could not be recovered.
       */
      pool?: readonly OutfitCandidate[] | null;
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
    options?: Readonly<{
      onPhase?: (phase: RecommendationPhase) => void;
      locale?: SupportedLanguage;
      // Only a re-ask whose allowance was reserved sets it, so the Worker answers without its
      // shared cache instead of returning the trio the reader asked to replace.
      reask?: true;
    }>,
  ): Promise<OutfitRecommendationSuccess>;
}>;

type Dependencies = Readonly<{
  loadRepository: () => Promise<RecommendationRepository>;
  loadRecentWorn?: () => Promise<readonly WornOutfit[]>;
  client: AiClient;
  createContextWithPool?: typeof createRecommendationContextWithPool;
  // Optional: `recommendation_regenerated` fires on every completed attempt in `refreshOnce`,
  // which already knows the trigger (passed into `refresh()`) and the exact outcome branch
  // taken; a no-op default keeps existing composition and tests unchanged.
  captureAnalyticsEvent?: CaptureAnalyticsEvent;
  // Observability, not product analytics: how long the chain took, which tier delivered and
  // what the device reports about on-device selection. Optional, so existing composition and
  // tests are unchanged.
  telemetry?: PerformanceTelemetry;
  // The availability the provider already read once on mount. `null` until it resolves,
  // which the event reports as `not_attempted` rather than guessing.
  getOnDeviceAvailability?: () => OnDeviceAiAvailability | null;
  // The deterministic composition is synchronous, so without a pause the "using standard
  // suggestions" phase would land in the same render as the settled result and never be
  // seen. Optional so tests can replace the wait with a resolved promise.
  holdPhase?: (milliseconds: number) => Promise<void>;
  // A failed reservation takes the deterministic path; an AI failure keeps its slot spent.
  reserveAiReask?: (dayKey: string) => Promise<boolean>;
  // Gives back a slot reserved for a re-ask whose request never reached the Worker (offline or
  // refused), so it is not charged for it. A timed-out request keeps its slot: the Worker may
  // have answered and counted it.
  releaseAiReask?: (dayKey: string) => Promise<void>;
  // The evening's preview of this dressing day, if one was chosen. An approved trigger reuses
  // its selection instead of asking again when `reusablePreviewRecommendation` allows it.
  loadPreview?: (dayKey: string) => Promise<RecommendationSnapshot | null>;
  // The deterministic composition. Optional so tests can make it throw.
  composeFallback?: typeof recommendOutfits;
}>;

// One refresh request and the state only it owns: whether its AI answer is still awaited and
// the deterministic three a skip saved for it. A skip belongs to the request it was made on, so
// a later request never mistakes it for its own.
type PendingRefresh = {
  readonly key: string;
  readonly context: RecommendationContext;
  readonly input: RecommendationApplicationInput;
  readonly trigger: RecommendationRefreshTrigger;
  readonly poolOptionIds: readonly string[];
  readonly pool: readonly OutfitCandidate[] | null;
  aiPending: boolean;
  skip: Promise<RecommendationSnapshot | null> | null;
};

// Long enough to be read, short enough that the deterministic three still feel immediate;
// the AI phases have their own natural durations and need no hold.
export const usingStandardPhaseMilliseconds = 800;

type Listener = () => void;

export { localDayKey, localDayKind, localDayVariant } from '@/features/recommendation/domain/local-day';

/**
 * The three outfits the persisted snapshot is showing, whatever day it was written on.
 * Ordinary generation excludes their body garments when at least three alternatives remain.
 * A confirmed re-ask does not exclude them; its pool may repeat a selection shown earlier that
 * day.
 */
function shownOutfits(snapshot: RecommendationSnapshot | null): readonly RecommendedOutfit[] {
  const outfits = snapshot?.recommendation.outfits;
  return outfits?.length === 3 ? outfits : [];
}

function shownOptionIds(snapshot: RecommendationSnapshot | null): readonly string[] {
  return shownOutfits(snapshot).map(({ optionId }) => optionId);
}

function hasValidRecommendationForDay(
  snapshot: RecommendationSnapshot | null,
  dayKey: string,
): boolean {
  return snapshot?.localDayKey === dayKey
    && snapshot.recommendation.status === 'recommended'
    && snapshot.recommendation.outfits.length === 3;
}

export function recommendationPoolExhausted(
  poolOptionIds: readonly string[] | null,
  snapshot: RecommendationSnapshot | null,
): boolean {
  if (!poolOptionIds || !snapshot) return false;
  if (poolOptionIds.length === 0) return true;
  const shown = new Set(shownOptionIds(snapshot));
  return shown.size === 3 && poolOptionIds.every((id) => shown.has(id));
}

// A persisted recommendation carries the exact requirements and composition seed, so a
// fresh controller can recover the full pool without a weather request or a new generation.
function storedPool(
  snapshot: RecommendationSnapshot | null,
  recentWorn: readonly WornOutfit[],
): readonly OutfitCandidate[] | null {
  if (
    !snapshot ||
    snapshot.dayVariant === null ||
    snapshot.catalogVersion !== garmentCatalogVersion
  ) return null;
  try {
    const composition = composeOutfitPool(
      snapshot.recommendation.requirements,
      snapshot.clothingPreference,
      snapshot.dayVariant,
      recentWorn,
    );
    return composition.status === 'composed' ? composition.outfits : null;
  } catch {
    // Pool reconstruction is derived UI state and must not discard a valid saved outfit.
    return null;
  }
}

function poolCompositionKeyForInput(input: RecommendationApplicationInput): string {
  return poolCompositionKey(
    deriveClothingRequirements(input.snapshot, input.now, input.departureAt ?? input.now),
    input.clothingPreference, input.dayVariant, input.recentWorn,
  );
}

// The primary outfit `skipWait` would save for the same input. Composing it is pure and
// persists nothing; a composition that throws only leaves the runway without a preview.
export class RecommendationApplicationController {
  private state: RecommendationApplicationState = { status: 'loading' };
  private repository: RecommendationRepository | null = null;
  private initializationPromise: Promise<void> | null = null;
  private readonly refreshes = new Map<string, Readonly<{
    pending: PendingRefresh;
    promise: Promise<RecommendationSnapshot | null>;
  }>>();
  private latestRequestKey: string | null = null;
  private readonly listeners = new Set<Listener>();
  private readonly localProfileId: string;
  private readonly dependencies: Dependencies;
  private readonly captureAnalyticsEvent: CaptureAnalyticsEvent;
  private readonly telemetry: PerformanceTelemetry | null;
  private readonly holdPhase: (milliseconds: number) => Promise<void>;
  private readonly composeFallback: typeof recommendOutfits;
  private poolOptionIds: readonly string[] | null = null;
  private pool: readonly OutfitCandidate[] | null = null;
  private poolKey: string | null = null;
  private recentWorn: readonly WornOutfit[] = [];
  private previousOutfits: readonly RecommendedOutfit[] = [];
  constructor(localProfileId: string, dependencies: Dependencies) {
    this.localProfileId = localProfileId;
    this.dependencies = dependencies;
    this.captureAnalyticsEvent = dependencies.captureAnalyticsEvent ?? (() => undefined);
    this.telemetry = dependencies.telemetry ?? null;
    this.holdPhase = dependencies.holdPhase
      ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
    this.composeFallback = dependencies.composeFallback ?? recommendOutfits;
  }

  getSnapshot = (): RecommendationApplicationState => this.state;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  clearLastFailure(): void {
    if (this.state.status === 'ready' && this.state.lastFailure !== null &&
        this.state.snapshot?.recommendation.status === 'recommended') {
      this.setReady({ ...this.state, lastFailure: null });
    }
  }

  updatePoolAvailability(input: RecommendationApplicationInput): void {
    if (this.state.status !== 'ready' || !this.state.snapshot) return;
    try {
      const poolInput = { ...input, recentWorn: input.recentWorn ?? this.recentWorn };
      const key = poolCompositionKeyForInput(poolInput);
      if (key !== this.poolKey || this.poolOptionIds === null) {
        // Only the exhaustion check follows the current input. The published pool stays the
        // one the shown outfits were picked from until a generation replaces them.
        ({ poolOptionIds: this.poolOptionIds } = (this.dependencies.createContextWithPool ??
          createRecommendationContextWithPool)(
          { ...poolInput, excludedOutfits: [] }, input.localDayKey,
        ));
        this.poolKey = key;
      }
      const exhausted = recommendationPoolExhausted(this.poolOptionIds, this.state.snapshot);
      if (exhausted !== this.state.exhausted) this.setReady({ ...this.state, exhausted });
    } catch {
      // A failed derived availability check never discards the saved recommendation.
    }
  }

  initialize(localDayKey?: string): Promise<void> {
    if (!this.initializationPromise) {
      this.initializationPromise = this.initializeOnce(localDayKey);
    }
    return this.initializationPromise;
  }

  refresh(
    trigger: RecommendationRefreshTrigger,
    input: RecommendationApplicationInput,
  ): Promise<RecommendationSnapshot | null> {
    if (this.dependencies.loadRecentWorn) {
      return this.dependencies.loadRecentWorn()
        .then((recentWorn) => {
          this.recentWorn = recentWorn;
          return this.refreshPrepared(trigger, { ...input, recentWorn });
        })
        .catch((error: unknown) => {
          this.setLastFailure(recommendationFailureCategory(error));
          return this.currentSnapshot();
        });
    }
    const recentWorn = input.recentWorn ?? this.recentWorn;
    this.recentWorn = recentWorn;
    return this.refreshPrepared(trigger, { ...input, recentWorn });
  }

  private refreshPrepared(
    trigger: RecommendationRefreshTrigger,
    input: RecommendationApplicationInput,
  ): Promise<RecommendationSnapshot | null> {
    let context: RecommendationContext;
    let poolOptionIds: readonly string[];
    let pool: readonly OutfitCandidate[] | null;
    const snapshot = this.currentSnapshot();
    const generationInput = {
      ...input,
      excludedOutfits: trigger === 'regenerate' ? []
        : snapshot ? shownOutfits(snapshot) : this.previousOutfits,
    };
    const startedRefreshing = this.state.status === 'ready' && !this.state.isRefreshing;
    if (startedRefreshing) this.setRefreshing(true, generationInput);
    try {
      let composed: readonly OutfitCandidate[] | undefined;
      ({ context, poolOptionIds, pool: composed } = (this.dependencies.createContextWithPool ??
        createRecommendationContextWithPool)(
        generationInput, input.localDayKey,
      ));
      pool = composed ?? null;
    } catch (error) {
      this.setLastFailure(recommendationFailureCategory(error));
      if (startedRefreshing) this.setRefreshing(false);
      return Promise.resolve(this.currentSnapshot());
    }
    const request = aiRequestFromContext(context);
    const key = JSON.stringify({
      weatherSnapshotId: input.snapshot.id,
      locationKey: input.snapshot.locationKey,
      context: JSON.stringify(context, (field, value) =>
        field === 'coverageStart' || field === 'coverageEnd' ? undefined : value),
    });
    const existing = this.refreshes.get(key);
    if (existing) {
      // The joined request may have been superseded meanwhile. It is the one the caller waits
      // on again, so it must be latest for its own finish to end the refreshing state.
      this.latestRequestKey = key;
      return existing.promise;
    }

    const pending: PendingRefresh = {
      key, context, input: generationInput, trigger, poolOptionIds, pool,
      aiPending: request !== null, skip: null,
    };
    this.latestRequestKey = key;
    this.setRefreshing(true, generationInput);
    const promise = this.refreshOnce(pending, request).finally(() => {
      this.refreshes.delete(key);
      if (this.latestRequestKey === key) this.setRefreshing(false);
    });
    this.refreshes.set(key, { pending, promise });
    return promise;
  }

  /**
   * The input the deterministic composition reads when the AI did not decide. A confirmed
   * re-ask that reaches the AI offers the whole pool, so it may repeat an earlier selection;
   * the deterministic one is a pure function of the same inputs and would return the trio on
   * screen, so it leaves those outfits out whenever three others remain.
   */
  private fallbackInput(
    input: RecommendationApplicationInput,
    trigger: RecommendationRefreshTrigger,
  ): RecommendationApplicationInput {
    return trigger === 'regenerate'
      ? { ...input, excludedOutfits: shownOutfits(this.currentSnapshot()) }
      : input;
  }

  /** Show the deterministic three now, without cancelling or starting an AI request. */
  skipWait(): Promise<RecommendationSnapshot | null> {
    const pending = this.latestRefresh();
    if (!pending || !pending.aiPending || pending.skip) {
      return pending?.skip ?? Promise.resolve(this.currentSnapshot());
    }
    pending.skip = this.saveSkippedFallback(pending);
    return pending.skip;
  }

  private latestRefresh(): PendingRefresh | null {
    return this.latestRequestKey === null
      ? null
      : this.refreshes.get(this.latestRequestKey)?.pending ?? null;
  }

  private async saveSkippedFallback(pending: PendingRefresh): Promise<RecommendationSnapshot | null> {
    try {
      const fallback = this.composeFallback(this.fallbackInput(pending.input, pending.trigger));
      if (fallback.status !== 'recommended' || this.latestRequestKey !== pending.key) {
        return this.currentSnapshot();
      }
      const snapshot = await this.requireRepository().saveSnapshot(this.localProfileId, {
        weatherSnapshotId: pending.input.snapshot.id,
        locationKey: pending.input.snapshot.locationKey,
        context: pending.context,
        recommendation: fallback,
      });
      if (this.latestRequestKey === pending.key) {
        this.poolOptionIds = pending.poolOptionIds;
        this.pool = pending.pool;
        this.poolKey = poolCompositionKeyForInput(pending.input);
        this.setReady({
          status: 'ready', snapshot, isRefreshing: true, lastFailure: null,
          phase: 'preparing-outfits',
          exhausted: recommendationPoolExhausted(this.poolOptionIds, snapshot),
          showFirstGenerationOverlay: false,
          pool: this.pool,
        });
      }
      return snapshot;
    } catch (error) {
      this.setLastFailure(recommendationFailureCategory(error));
      return this.currentSnapshot();
    }
  }

  private async initializeOnce(localDayKey?: string): Promise<void> {
    try {
      this.repository = await this.dependencies.loadRepository();
      let snapshot: RecommendationSnapshot | null;
      try {
        snapshot = await this.repository.getSnapshot(this.localProfileId, localDayKey);
      } catch (error) {
        // An outdated or wrong-day row is absent for display. The normal day-choice
        // gate still decides when the replacement may be generated.
        if (!(error instanceof RecommendationRepositoryError) || error.code !== 'invalid-data') {
          throw error;
        }
        snapshot = null;
        try {
          this.previousOutfits = shownOutfits(
            await this.repository.getSnapshot(this.localProfileId),
          );
        } catch {
          // Invalid or outdated rows cannot supply a validated exclusion trio.
        }
      }
      let recentWorn: readonly WornOutfit[] = [];
      let lastFailure: FailureCategory | null = null;
      if (snapshot && this.dependencies.loadRecentWorn) {
        try {
          recentWorn = await this.dependencies.loadRecentWorn();
          this.recentWorn = recentWorn;
        } catch (error) {
          lastFailure = recommendationFailureCategory(error);
        }
      }
      this.pool = lastFailure === null ? storedPool(snapshot, recentWorn) : null;
      this.poolOptionIds = this.pool?.map(outfitOptionId) ?? null;
      this.poolKey = this.poolOptionIds && snapshot && snapshot.dayVariant !== null
        ? poolCompositionKey(snapshot.recommendation.requirements,
          snapshot.clothingPreference, snapshot.dayVariant, recentWorn)
        : null;
      this.setReady({
        status: 'ready',
        snapshot,
        isRefreshing: false,
        lastFailure,
        phase: null,
        exhausted: recommendationPoolExhausted(this.poolOptionIds, snapshot),
        showFirstGenerationOverlay: false,
        pool: this.pool,
      });
    } catch (error) {
      this.setReady({
        status: 'ready',
        snapshot: null,
        isRefreshing: false,
        lastFailure: recommendationFailureCategory(error),
        phase: null,
        exhausted: false,
        showFirstGenerationOverlay: false,
      });
    }
  }

  private async refreshOnce(
    pending: PendingRefresh,
    request: AiRecommendV1Request | null,
  ): Promise<RecommendationSnapshot | null> {
    const { key, context, input, trigger, poolOptionIds, pool } = pending;
    // The deterministic fallback composes from the same catalog and effectively always
    // succeeds, so an AI failure alone is not a failure the user sees. It is still the
    // root cause when something after it leaves the state without a snapshot, so it is
    // remembered here and preferred over a later, less specific throw.
    let recommendation: OutfitRecommendationSuccess | null = null;
    let aiFailure: FailureCategory | null = null;
    const startedAt = Date.now();
    let reserved = false;
    if (request && trigger === 'regenerate') {
      try {
        reserved = (await this.dependencies.reserveAiReask?.(input.localDayKey)) === true;
        if (!reserved) request = null;
      } catch {
        request = null;
      }
      if (!request) pending.aiPending = false;
    }
    if (request && trigger !== 'regenerate' && this.dependencies.loadPreview) {
      const preview = await this.dependencies.loadPreview(input.localDayKey).catch(() => null);
      recommendation = reusablePreviewRecommendation(preview, context, input.snapshot.locationKey);
      if (recommendation) {
        request = null;
        pending.aiPending = false;
        this.setPhase(key, 'preparing-outfits');
      }
    }
    if (request) {
      try {
        // The routed client runs the shared validation gate inside its own chain, so what
        // comes back here is already a validated recommendation from whichever tier won.
        recommendation = await this.dependencies.client.recommendRouted(request, {
          onPhase: (phase) => this.setPhase(key, phase),
          locale: input.locale ?? 'en',
          ...(trigger === 'regenerate' ? { reask: true as const } : {}),
        });
        this.setPhase(key, 'preparing-outfits');
      } catch (error) {
        aiFailure = recommendationFailureCategory(error);
        if (reserved && error instanceof WorkerAiClientError && error.kind === 'network' && !error.timedOut) {
          try {
            await this.dependencies.releaseAiReask?.(input.localDayKey);
          } catch {
            // A refund that fails leaves the slot spent, which is the budget's safe side.
          }
        }
      } finally {
        pending.aiPending = false;
      }
    }
    if (pending.skip) await pending.skip;
    if (!recommendation && pending.skip
      && hasValidRecommendationForDay(this.currentSnapshot(), input.localDayKey)) {
      this.captureAnalyticsEvent('recommendation_regenerated', {
        schema_version: ANALYTICS_SCHEMA_VERSION,
        trigger_reason: triggerReasonProperty(trigger),
        result: 'success',
        generation_mode: generationModeProperty('deterministic-fallback'),
        ...(trigger === 'regenerate' ? { regeneration_source: 'ai' as const } : {}),
      });
      this.reportGenerated('deterministic-fallback', 3, aiFailure, startedAt);
      return this.currentSnapshot();
    }
    if (!recommendation) {
      this.setPhase(key, 'using-standard');
      try {
        await this.holdPhase(usingStandardPhaseMilliseconds);
        const fallback = this.composeFallback(this.fallbackInput(input, trigger));
        if (fallback.status !== 'recommended') {
          this.setLastFailure(aiFailure ?? 'unknown');
          this.captureRegenerated(trigger, this.currentSnapshot() !== null);
          this.reportGenerated(null, 0, aiFailure ?? 'unknown', startedAt);
          return this.currentSnapshot();
        }
        recommendation = fallback;
        this.setPhase(key, 'preparing-outfits');
      } catch (error) {
        const failure = aiFailure ?? recommendationFailureCategory(error);
        this.setLastFailure(failure);
        this.captureRegenerated(trigger, this.currentSnapshot() !== null);
        this.reportGenerated(null, 0, failure, startedAt);
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
          context: recommendation.insightSentence && recommendation.insightLocale
            ? { ...context, insightSentence: recommendation.insightSentence,
              insightLocale: recommendation.insightLocale }
            : context,
          recommendation,
        },
      );
      if (this.latestRequestKey === key) {
        this.poolOptionIds = poolOptionIds;
        this.pool = pool;
        this.poolKey = poolCompositionKeyForInput(input);
        this.setReady({
          status: 'ready',
          snapshot,
          isRefreshing: true,
          lastFailure: null,
          phase: 'preparing-outfits',
          exhausted: recommendationPoolExhausted(this.poolOptionIds, snapshot),
          showFirstGenerationOverlay: false,
          pool: this.pool,
        });
      }
      this.captureAnalyticsEvent('recommendation_regenerated', {
        schema_version: ANALYTICS_SCHEMA_VERSION,
        trigger_reason: triggerReasonProperty(trigger),
        result: 'success',
        generation_mode: generationModeProperty(snapshot.generationMode),
        // Taxonomy 5.5: only the explicit "show another outfit" action carries it, and it
        // says whether that tap reached the AI chain or composed from the pool alone. It
        // names no provider and reports no remaining allowance.
        ...(trigger === 'regenerate'
          ? { regeneration_source: request ? ('ai' as const) : ('pool' as const) }
          : {}),
      });
      // An AI tier that failed while the deterministic composition delivered is not a
      // user-visible failure, so it is carried as `failure_kind` on a completed generation
      // rather than reported as an error.
      this.reportGenerated(
        snapshot.generationMode,
        snapshot.recommendation.outfits.length,
        aiFailure,
        startedAt,
      );
      return snapshot;
    } catch (error) {
      const failure = aiFailure ?? recommendationFailureCategory(error);
      this.setLastFailure(failure);
      this.captureRegenerated(trigger, this.currentSnapshot() !== null);
      this.reportGenerated(null, 0, failure, startedAt);
      return this.currentSnapshot();
    }
  }

  // One `recommendation.generated` event per completed attempt, and an error report only
  // when the attempt left the user without a new recommendation.
  private reportGenerated(
    generationMode: RecommendationSnapshot['generationMode'] | null,
    optionCount: number,
    failure: FailureCategory | null,
    startedAt: number,
  ): void {
    const telemetry = this.telemetry;
    if (!telemetry) return;
    telemetry.logEvent(
      'recommendation.generated',
      recommendationGeneratedAttributes({
        generationMode,
        onDeviceAvailability: this.dependencies.getOnDeviceAvailability?.() ?? null,
        durationMs: Date.now() - startedAt,
        optionCount,
        failure,
      }),
    );
    if (generationMode === null && failure) {
      telemetry.reportError(
        new TelemetryError('recommendation.refresh_failed', {
          failure_kind: telemetryFailureKind(failure),
        }),
      );
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

  // A refresh starts and ends without a phase: the chain reports the first one, and a
  // settled state carries none.
  private setRefreshing(isRefreshing: boolean, input?: RecommendationApplicationInput): void {
    if (this.state.status === 'ready') {
      const showFirstGenerationOverlay = isRefreshing && input !== undefined
        && !hasValidRecommendationForDay(this.state.snapshot, input.localDayKey);
      this.setReady({
        ...this.state,
        isRefreshing,
        phase: null,
        showFirstGenerationOverlay,
      });
    }
  }

  // A superseded refresh still runs to completion, so its narration is dropped rather than
  // allowed to describe a wait the user is no longer in.
  private setPhase(key: string, phase: RecommendationPhase): void {
    if (this.latestRequestKey !== key || this.state.status !== 'ready') return;
    this.setReady({ ...this.state, phase });
  }

  private setReady(state: Extract<RecommendationApplicationState, { status: 'ready' }>): void {
    this.state = state;
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
