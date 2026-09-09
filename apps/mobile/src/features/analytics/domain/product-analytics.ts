// The project-owned analytics boundary (ADR 0023 section 6, `docs/analytics-taxonomy.md`
// section 2). Features depend on this port only: no provider SDK type appears in it, and no
// provider module may be imported from domain or presentation code.
import type {
  AnalyticsEventName,
  AnalyticsEventProperties,
} from '@/features/analytics/domain/analytics-events';

export type AnalyticsCaptureOptions = Readonly<{
  // The instant the event describes, when that is earlier than the capture call. Taxonomy
  // 5.10 requires the buffered `error_shown` to carry the instant the failure became
  // visible rather than the later flush time.
  timestamp: string;
}>;

export interface ProductAnalytics {
  // A capture before `optIn()` is a no-op by contract: the SDK initialises with
  // `defaultOptIn: false` and nothing may reach the network before consent (taxonomy 2).
  capture<Name extends AnalyticsEventName>(
    name: Name,
    properties: AnalyticsEventProperties<Name>,
    options?: AnalyticsCaptureOptions,
  ): void;

  // Called from the consent surface once the person accepts. The first event on the
  // identity is `analytics_consent_granted`.
  optIn(): Promise<void>;

  // Withdrawal severs the identity (taxonomy 2): the adapter opts out, resets, and clears
  // the separately persisted device id, so a later re-consent starts an unjoinable
  // identity. It never touches `localProfileId` or any application data.
  withdraw(): Promise<void>;

  // Sends whatever is buffered; called on the background transition after the trackers have
  // emitted their buffered events.
  flush(): Promise<void>;
}

export type CaptureAnalyticsEvent = ProductAnalytics['capture'];
