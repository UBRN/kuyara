// The project-owned observability boundary. EAS Observe answers "how long did it take" and
// "what broke", never "what did the person do": product behaviour stays behind the separate
// `ProductAnalytics` port with PostHog as its provider (ADR 0023). Features depend on this
// port only; the single adapter under `features/analytics/data` is the app's only importer
// of the Observe package.
import type { AnalyticsConsent } from '@/features/profile/domain/profile';

// Observe stores attributes as typed primitives. Keeping the port to these three forbids a
// nested object, which is where a raw payload would otherwise slip through.
export type TelemetryAttributeValue = string | number | boolean;
export type TelemetryAttributes = Readonly<Record<string, TelemetryAttributeValue>>;

export const performanceTelemetryEventNames = [
  'recommendation.generated',
  'weather.refreshed',
] as const;

export type PerformanceTelemetryEventName =
  (typeof performanceTelemetryEventNames)[number];

/**
 * The only error shape the port accepts. A caught SQLite, provider or AI error carries a
 * message this project does not control, and Observe sends `name`, `message` and `stack`
 * verbatim, so a raw throw must never reach it. Callers build this value from a closed code
 * and coarse attributes instead, which makes the sanitization structural rather than a rule
 * someone has to remember.
 */
export class TelemetryError extends Error {
  readonly code: string;

  constructor(code: string, attributes: TelemetryAttributes = {}) {
    const detail = Object.entries(attributes)
      .map(([key, value]) => `${key}=${String(value)}`)
      .join(' ');
    super(detail ? `${code} ${detail}` : code);
    this.name = 'KuyaraTelemetryError';
    this.code = code;
  }
}

export interface PerformanceTelemetry {
  // A user-defined Observe event. The name comes from the closed list above and the
  // attributes from the builders in `performance-telemetry-events.ts`.
  logEvent(
    name: PerformanceTelemetryEventName,
    attributes: TelemetryAttributes,
  ): void;

  // A handled failure, recorded as a non-fatal exception.
  reportError(error: TelemetryError): void;

  // Consent changed inside this session. `Observe.configure()` is a full replacement that
  // the native side persists, so re-applying it with a new value takes effect immediately
  // rather than at the next launch.
  setDispatching(enabled: boolean): void;
}

/**
 * ADR 0033: dispatch follows the one analytics answer the person already gave. `granted`
 * dispatches; `withdrawn` and `undecided` do not, so nothing leaves the device before the
 * question is answered or after it is taken back.
 */
export function telemetryDispatchingEnabled(consent: AnalyticsConsent): boolean {
  return consent === 'granted';
}
