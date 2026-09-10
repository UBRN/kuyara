// `attempt_number` for `retry_after_failure_triggered` (`docs/analytics-taxonomy.md`
// sections 5.7 and 6): consecutive user-visible retries for one surface and failure episode,
// reset on success or focus loss, with five and above collapsed to `5+`. It is a client-side
// analytics bound, unrelated to the Worker's provider-attempt limit.
import type {
  CountBucket,
  RefreshSurface,
} from '@/features/analytics/domain/analytics-events';
import { countBucket } from '@/features/analytics/domain/analytics-mappers';

export class RetryCounter {
  private readonly attempts = new Map<RefreshSurface, number>();

  // The attempt number to report for a retry the user just triggered. The first retry is 1.
  nextAttempt(surface: RefreshSurface): CountBucket {
    const attempt = (this.attempts.get(surface) ?? 0) + 1;
    this.attempts.set(surface, attempt);
    return countBucket(attempt);
  }

  // Called on a success or when the surface loses focus, which ends the failure episode.
  reset(surface?: RefreshSurface): void {
    if (surface) {
      this.attempts.delete(surface);
      return;
    }
    this.attempts.clear();
  }
}
