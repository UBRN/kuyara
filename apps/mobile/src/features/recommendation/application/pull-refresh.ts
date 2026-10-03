import type { RecommendationApplicationState } from '@/features/recommendation/application/recommendation-application-controller';

type PullRefreshDependencies = Readonly<{
  getSnapshot: () => RecommendationApplicationState;
  refresh: () => Promise<unknown>;
  evaluateApprovedTriggers: () => Promise<void>;
}>;

/**
 * What Today's pull gesture asks of the recommendation once the weather is fresh: a ready state
 * that holds no recommended outfits is regenerated outright, a ready state that holds some
 * only evaluates the approved triggers, and a state that is not ready is left alone.
 */
export async function refreshAfterPull(dependencies: PullRefreshDependencies): Promise<void> {
  const current = dependencies.getSnapshot();
  if (current.status !== 'ready') return;
  if (current.snapshot?.recommendation.status !== 'recommended') {
    await dependencies.refresh();
  } else {
    await dependencies.evaluateApprovedTriggers();
  }
}
