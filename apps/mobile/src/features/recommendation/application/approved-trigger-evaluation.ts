import { createApprovedTriggerCoalescer } from '@/features/recommendation/application/approved-trigger-coalescer';
import {
  expiredCoverageNeedsSelection,
  recommendationRefreshTrigger,
  type RecommendationApplicationController,
  type RecommendationApplicationInput,
  type RecommendationApplicationState,
  type RecommendationRefreshTrigger,
} from '@/features/recommendation/application/recommendation-application-controller';
import {
  signalsOfInput,
  signalsOfSnapshot,
} from '@/features/recommendation/application/recommendation-signals';

type Recommendation = Pick<RecommendationApplicationController,
  'getSnapshot' | 'refresh' | 'updatePoolAvailability' | 'clearLastFailure'>;

/** What the render that asks for an evaluation reads, passed with each request. */
export type ApprovedTriggerReading = Readonly<{
  recommendation: Recommendation;
  /** An unanswered morning or evening question holds automatic selection. */
  dayQuestionPending: boolean;
  /** Whether the generation this trigger starts waits for a weather refresh in flight. */
  awaitsWeatherRefresh: (input: RecommendationApplicationInput, trigger: RecommendationRefreshTrigger) => boolean;
}>;

/**
 * A dressing day's first outfit waits for a weather refresh already in flight and is chosen
 * from what it brings, or from the weather already here when it fails. Either way the refresh
 * settles into a new weather state, whose input evaluates the approved triggers again.
 */
export function firstOutfitAwaitsWeatherRefresh(
  weather: Readonly<{ status: string; isRefreshing?: boolean }>,
  recommendation: RecommendationApplicationState,
  dayKey: string,
): boolean {
  return weather.status === 'ready' && Boolean(weather.isRefreshing) &&
    !(recommendation.status === 'ready' && recommendation.snapshot?.localDayKey === dayKey);
}

/**
 * Besides the day's first outfit, a place change waits while the weather of the place it
 * moved to is refreshing, so a stored snapshot of that place is not chosen from when newer
 * weather is on its way. A failed refresh settles too, and the stored snapshot is used then.
 */
export function approvedTriggerAwaitsWeatherRefresh(
  weather: Readonly<{
    status: string;
    isRefreshing?: boolean;
    activeLocation?: Readonly<{ locationKey: string }> | null;
  }>,
  recommendation: RecommendationApplicationState,
  input: Readonly<{ localDayKey: string; snapshot: Readonly<{ locationKey: string }> }>,
  trigger: RecommendationRefreshTrigger,
): boolean {
  if (firstOutfitAwaitsWeatherRefresh(weather, recommendation, input.localDayKey)) return true;
  return trigger === 'active-location-changed' && weather.status === 'ready' &&
    Boolean(weather.isRefreshing) && weather.activeLocation?.locationKey === input.snapshot.locationKey;
}

export type ApprovedTriggerEvaluation = Readonly<{
  /** The input the latest render reads (see the coalescer's `followRender`). */
  followRender: (input: RecommendationApplicationInput, reading: ApprovedTriggerReading) => Promise<boolean>;
  /**
   * A caller's own evaluation. A foreground one (Today opening in front) also lets ended
   * coverage reselect, and it evaluates once more when the first pass joined an evaluation
   * that did not consume the foreground ask. A pass that starts no generation clears the
   * last failure.
   */
  evaluate: (
    readInput: () => RecommendationApplicationInput | null,
    reading: ApprovedTriggerReading,
    foreground: boolean,
  ) => Promise<void>;
  /**
   * A confirmed re-ask changes the answers the approved triggers read. Evaluating them while
   * it runs would see its own new day type as a change and start a second, unreserved
   * generation, so evaluation waits for it and then reads the persisted result.
   */
  trackReask: <T>(settled: Promise<T>) => Promise<T>;
}>;

/**
 * Decides, against the persisted recommendation, whether an approved trigger or ended
 * coverage starts a generation (docs/product-decisions.md, approved recommendation caching).
 * One evaluation runs at a time through the approved-trigger coalescer.
 */
export function createApprovedTriggerEvaluation(): ApprovedTriggerEvaluation {
  const coalescer = createApprovedTriggerCoalescer();
  let foregroundRequested = false;
  let lastExpiryAttempt: string | null = null;
  let reaskInFlight: Promise<unknown> | null = null;

  async function evaluateOnce(
    input: RecommendationApplicationInput,
    { recommendation, dayQuestionPending, awaitsWeatherRefresh }: ApprovedTriggerReading,
  ): Promise<boolean> {
    const pendingReask = reaskInFlight;
    if (pendingReask) await pendingReask;
    const liveState = recommendation.getSnapshot();
    if (liveState.status !== 'ready') return false;
    const current = signalsOfInput(input);
    const persistedSnapshot = liveState.snapshot;
    const previous = persistedSnapshot ? signalsOfSnapshot(persistedSnapshot) : null;

    // An unanswered day question holds automatic selection; its answer starts the one
    // generation. The last look may carry another key's day-only styles, which are no change.
    if (dayQuestionPending) return false;

    const trigger = recommendationRefreshTrigger(previous, current);

    if (trigger) {
      if (awaitsWeatherRefresh(input, trigger)) return false;
      foregroundRequested = false;
      await recommendation.refresh(trigger, input);
      return true;
    }
    const coverageEnd = persistedSnapshot?.coverageEnd;
    if (coverageEnd && expiredCoverageNeedsSelection(persistedSnapshot, input.now,
      foregroundRequested, lastExpiryAttempt)) {
      foregroundRequested = false;
      lastExpiryAttempt = coverageEnd;
      await recommendation.refresh('explicit', input);
      return true;
    }
    foregroundRequested = false;
    recommendation.updatePoolAvailability(input);
    return false;
  }

  const evaluatorFor = (reading: ApprovedTriggerReading) =>
    (input: RecommendationApplicationInput) => evaluateOnce(input, reading);

  const request = (input: RecommendationApplicationInput, reading: ApprovedTriggerReading) =>
    coalescer.request(input, evaluatorFor(reading));

  return {
    followRender: (input, reading) => coalescer.followRender(input, evaluatorFor(reading)),
    async evaluate(readInput, reading, foreground) {
      const input = readInput();
      if (!input) return;
      if (foreground) foregroundRequested = true;
      let triggered = await request(input, reading);
      if (foreground && foregroundRequested) {
        triggered = await request(readInput() ?? input, reading) || triggered;
      }
      if (!triggered) reading.recommendation.clearLastFailure();
    },
    trackReask(settled) {
      const tracked = settled.finally(() => {
        if (reaskInFlight === tracked) reaskInFlight = null;
      });
      reaskInFlight = tracked;
      return tracked;
    },
  };
}
