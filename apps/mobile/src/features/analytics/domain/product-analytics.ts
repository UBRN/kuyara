// The project-owned analytics boundary (ADR 0023 section 6, `docs/analytics-taxonomy.md`
// section 2). Features depend on this port only: no provider SDK type appears in it, and no
// provider module may be imported from domain or presentation code.
import type {
  AnalyticsEventName,
  AnalyticsEventProperties,
} from '@/features/analytics/domain/analytics-events';

export type AnalyticsConsentSurface =
  AnalyticsEventProperties<'analytics_consent_granted'>['surface'];

export type AnalyticsCaptureOptions = Readonly<{
  // The instant the event describes, when that is earlier than the capture call. Taxonomy
  // 5.10 requires the buffered `error_shown` to carry the instant the failure became
  // visible rather than the later flush time.
  timestamp: string;
}>;

export interface ProductAnalytics {
  // While consent is undecided, the composition-root decorator buffers captures in memory.
  // A provider client still does not exist before `optIn()`, so nothing can leave the device
  // before consent (taxonomy 2, ADR 0033 section 6).
  capture<Name extends AnalyticsEventName>(
    name: Name,
    properties: AnalyticsEventProperties<Name>,
    options?: AnalyticsCaptureOptions,
  ): void;

  // Called from a consent surface once the person accepts. The adapter opts in first and
  // captures `analytics_consent_granted` itself, making it the first event on the identity.
  optIn(surface: AnalyticsConsentSurface): Promise<void>;

  // Records the first-launch decline locally by discarding the undecided buffer. It never
  // delegates to a provider and therefore sends no event.
  decline(): Promise<void>;

  // Withdrawal severs the identity (taxonomy 2): the adapter opts out, resets, and clears
  // the separately persisted device id, so a later re-consent starts an unjoinable
  // identity. It never touches `localProfileId` or any application data.
  withdraw(): Promise<void>;

  // Sends whatever is buffered; called on the background transition after the trackers have
  // emitted their buffered events.
  flush(): Promise<void>;

  // The provider's own anonymous per-install identifier, shown on the Privacy surface so a
  // deletion request can name it (ADR 0033 section 4). `null` when analytics is disabled or
  // the provider has not produced one yet. It is never an event property and never joined to
  // `localProfileId`.
  getIdentifier(): string | null;

  // The provider session is the taxonomy's session boundary for error episodes.
  getSessionId(): string | null;
}

export type CaptureAnalyticsEvent = ProductAnalytics['capture'];
