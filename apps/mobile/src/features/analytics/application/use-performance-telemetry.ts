// The composition boundary features depend on for observability. It defaults to the no-op
// port rather than throwing when no provider is above it: missing telemetry is never a
// reason for a screen to fail.
import { createContext, use } from 'react';

import type { PerformanceTelemetry } from '@/features/analytics/domain/performance-telemetry';

// The default satisfies the port and does nothing, so a screen rendered without the
// composition root behaves identically and records nothing.
export const PerformanceTelemetryContext = createContext<PerformanceTelemetry>({
  logEvent: () => undefined,
  reportError: () => undefined,
  setDispatching: () => undefined,
});

export function usePerformanceTelemetry(): PerformanceTelemetry {
  return use(PerformanceTelemetryContext);
}
