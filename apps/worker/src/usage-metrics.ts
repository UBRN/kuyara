import { aiProviderIds, weatherSourceIds, type WeatherSourceId } from '@kuyara/contracts';

import type { AiAttemptFailureReason, AiChainProviderId } from './ai/ai-provider.ts';
import type { WeatherProviderErrorKind } from './weather/weather-provider-error.ts';

/**
 * The structural subset of a Workers Analytics Engine dataset binding the Worker writes to.
 * `writeDataPoint` returns nothing and never blocks the request.
 */
export type AnalyticsEngineDataset = Readonly<{
  writeDataPoint(point: Readonly<{
    indexes?: readonly string[];
    blobs?: readonly string[];
    doubles?: readonly number[];
  }>): void;
}>;

/**
 * Why one provider attempt ended, as the closed vocabulary of the usage dataset. `auth` is
 * only ever reported by a weather provider (a rejected or missing credential); an AI
 * attempt folds that case into `upstream`. A spent allocation and an upstream refusal for
 * capacity both read `quota`.
 */
export const usageOutcomes = ['ok', 'timeout', 'invalid', 'quota', 'upstream', 'auth'] as const;
export type UsageOutcome = (typeof usageOutcomes)[number];

const aiRouteLabels = ['v1', 'v2'] as const;

/**
 * Every event the Worker counts. Each field is a member of a closed list; none of them can
 * carry a request value, so a data point holds no coordinate, place, identifier, prompt,
 * model output, address or body.
 */
export type UsageEvent =
  | Readonly<{ event: 'ai_cache'; route: (typeof aiRouteLabels)[number]; outcome: 'hit' | 'miss' }>
  | Readonly<{ event: 'ai_attempt'; provider: AiChainProviderId; outcome: UsageOutcome }>
  | Readonly<{ event: 'weather_attempt'; provider: WeatherSourceId; outcome: UsageOutcome }>
  | Readonly<{ event: 'daily_budget'; counter: 'workers-ai'; outcome: 'exhausted' }>;

/** Records one event. Never throws and never waits. */
export type UsageMetrics = (event: UsageEvent) => void;

export const noUsageMetrics: UsageMetrics = () => {};

const aiOutcomeByReason: Readonly<Record<AiAttemptFailureReason, UsageOutcome>> = {
  timeout: 'timeout',
  provider_error: 'upstream',
  quota_exceeded: 'quota',
  rate_limited: 'quota',
  invalid_output: 'invalid',
  unknown_option: 'invalid',
  picks_not_distinct: 'invalid',
  archetype_precondition: 'invalid',
};

export function aiAttemptOutcome(reason: AiAttemptFailureReason): UsageOutcome {
  return aiOutcomeByReason[reason];
}

const weatherOutcomeByKind: Readonly<Record<WeatherProviderErrorKind, UsageOutcome>> = {
  availability: 'upstream',
  timeout: 'timeout',
  quota: 'quota',
  auth: 'auth',
  upstream: 'upstream',
  invalid_response: 'invalid',
  invalid_request: 'invalid',
};

export function weatherAttemptOutcome(kind: WeatherProviderErrorKind): UsageOutcome {
  return weatherOutcomeByKind[kind];
}

const aiChainProviderIds: readonly string[] = [...aiProviderIds, 'haiku'];
const weatherProviderIds: readonly string[] = weatherSourceIds;
const outcomes: readonly string[] = usageOutcomes;

/**
 * One data point per event: the event name is the single index, `blob1` is the subject (a
 * route label, a provider id or a counter name), `blob2` the outcome and `double1` is 1, so
 * a count is `SUM(_sample_interval * double1)`. A value outside its closed list drops the
 * point instead of writing it.
 */
function dataPoint(event: UsageEvent): Readonly<{ indexes: string[]; blobs: string[]; doubles: number[] }> | undefined {
  let subject: string;
  switch (event.event) {
    case 'ai_cache':
      subject = event.route;
      if (!aiRouteLabels.includes(event.route) || (event.outcome !== 'hit' && event.outcome !== 'miss')) return undefined;
      break;
    case 'ai_attempt':
      subject = event.provider;
      if (!aiChainProviderIds.includes(subject) || !outcomes.includes(event.outcome)) return undefined;
      break;
    case 'weather_attempt':
      subject = event.provider;
      if (!weatherProviderIds.includes(subject) || !outcomes.includes(event.outcome)) return undefined;
      break;
    case 'daily_budget':
      subject = event.counter;
      if (event.counter !== 'workers-ai' || event.outcome !== 'exhausted') return undefined;
      break;
    default:
      return undefined;
  }
  return { indexes: [event.event], blobs: [subject, event.outcome], doubles: [1] };
}

/**
 * The one owner of writes to the usage dataset. Without a binding (unit tests, `wrangler
 * dev`, the e2e environment) it is a no-op, and a write that throws is swallowed: counting
 * must never change a response.
 */
export function createUsageMetrics(dataset: AnalyticsEngineDataset | undefined): UsageMetrics {
  if (!dataset) return noUsageMetrics;
  return (event) => {
    try {
      const point = dataPoint(event);
      if (point) dataset.writeDataPoint(point);
    } catch {
      // A failed write costs one uncounted event, never a failed request.
    }
  };
}
