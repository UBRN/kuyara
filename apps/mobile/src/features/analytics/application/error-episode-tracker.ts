// The buffering rule of `docs/analytics-taxonomy.md` sections 5.10 and 6: one `error_shown`
// per `(surface, failure_category)` pair per session, with the occurrence count finalised at
// the first of recovery, backgrounding, or session end, and one `error_recovered` per pair.
// Repeats never reach the network.
import {
  ANALYTICS_SCHEMA_VERSION,
  type ErrorSurface,
  type FailureCategoryProperty,
} from '@/features/analytics/domain/analytics-events';
import { countBucket } from '@/features/analytics/domain/analytics-mappers';
import type { CaptureAnalyticsEvent } from '@/features/analytics/domain/product-analytics';

export type ErrorEpisodeKey = Readonly<{
  surface: ErrorSurface;
  failureCategory: FailureCategoryProperty;
}>;

export type FlushReason = 'background' | 'session_end';

type Episode = {
  pair: ErrorEpisodeKey;
  // The instant the first failure in the pair became visible, not the later flush time.
  firstFailedAt: string;
  occurrences: number;
  shownEmitted: boolean;
  recoveredEmitted: boolean;
};

function pairKey({ surface, failureCategory }: ErrorEpisodeKey): string {
  return `${surface}:${failureCategory}`;
}

export class ErrorEpisodeTracker {
  private readonly episodes = new Map<string, Episode>();
  private readonly capture: CaptureAnalyticsEvent;
  private readonly now: () => string;

  constructor(capture: CaptureAnalyticsEvent, now: () => string) {
    this.capture = capture;
    this.now = now;
  }

  // A user-facing failure state rendered on a surface. Nothing is captured here: the count
  // is buffered until the pair is finalised.
  failed(pair: ErrorEpisodeKey): void {
    const key = pairKey(pair);
    const episode = this.episodes.get(key);
    if (!episode) {
      this.episodes.set(key, {
        pair,
        firstFailedAt: this.now(),
        occurrences: 1,
        shownEmitted: false,
        recoveredEmitted: false,
      });
      return;
    }
    // Once the pair is finalised, later failures neither emit nor change its count.
    if (episode.shownEmitted) return;
    episode.occurrences += 1;
  }

  // A success on a surface that failed earlier in the session: the buffered `error_shown`
  // is emitted first, then `error_recovered`, so the causal order survives batching.
  recovered(pair: ErrorEpisodeKey): void {
    const episode = this.episodes.get(pairKey(pair));
    if (!episode) return;
    this.emitShown(episode);
    if (episode.recoveredEmitted) return;
    episode.recoveredEmitted = true;
    this.capture('error_recovered', {
      schema_version: ANALYTICS_SCHEMA_VERSION,
      surface: pair.surface,
      failure_category: pair.failureCategory,
    });
  }

  // Called before the lifecycle event on backgrounding, and at session end. A session end
  // also clears the buffer, since the pairs are per session.
  flushAll(reason: FlushReason): void {
    this.episodes.forEach((episode) => this.emitShown(episode));
    if (reason === 'session_end') this.episodes.clear();
  }

  // Consent boundaries discard buffered state without attributing it to either identity.
  reset(): void {
    this.episodes.clear();
  }

  private emitShown(episode: Episode): void {
    if (episode.shownEmitted) return;
    episode.shownEmitted = true;
    this.capture(
      'error_shown',
      {
        schema_version: ANALYTICS_SCHEMA_VERSION,
        surface: episode.pair.surface,
        failure_category: episode.pair.failureCategory,
        occurrence_count: countBucket(episode.occurrences),
      },
      { timestamp: episode.firstFailedAt },
    );
  }
}
