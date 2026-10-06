import type { WeatherSnapshot } from '@/features/weather/domain/weather';

export type ManualRefreshOutcome = 'success' | 'failure_kept_last_known' | 'failure_no_snapshot';

type SettledWeather =
  | Readonly<{ status: 'loading' | 'error' }>
  | Readonly<{ status: 'ready'; refreshFailure: unknown; snapshot: WeatherSnapshot | null }>;

/**
 * Taxonomy 5.7's `result` of a manual refresh, read from the weather after it settled. Today
 * and Weather report it through this one rule.
 */
export function manualRefreshOutcome(after: SettledWeather): ManualRefreshOutcome {
  if (after.status !== 'ready') return 'failure_no_snapshot';
  if (after.refreshFailure === null) return 'success';
  return after.snapshot ? 'failure_kept_last_known' : 'failure_no_snapshot';
}
