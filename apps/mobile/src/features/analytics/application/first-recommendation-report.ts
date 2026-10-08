// `recommendation.first_shown`: one Observe event per app process, when Today first shows a
// recommendation, with the time since the process start mark. It is not `markInteractive`:
// that marks the first draw of Today in any state, a loading one included, so it cannot say
// when a recommendation was actually there to read.
import { useCallback, use } from 'react';

import type { ProcessClock } from '@/features/analytics/domain/process-clock';
import type { PerformanceTelemetry } from '@/features/analytics/domain/performance-telemetry';
import {
  firstRecommendationShownAttributes,
  type FirstRecommendationShownInput,
} from '@/features/analytics/domain/performance-telemetry-events';
import { usePerformanceTelemetry } from '@/features/analytics/application/use-performance-telemetry';
import { ProcessClockContext } from '@/features/analytics/application/use-process-clock';

type ShownRecommendation = Omit<FirstRecommendationShownInput, 'durationMs'>;

/**
 * The first call after a start mark reports; every later call in the process does nothing, so
 * a Today that shows a recommendation again, or a root that mounts twice, adds no second event.
 */
export function createFirstRecommendationReport(clock: Readonly<{ elapsedMs: () => number | null }>) {
  let reported = false;
  return (
    telemetry: Pick<PerformanceTelemetry, 'logEvent'>,
    shown: ShownRecommendation,
  ): void => {
    if (reported) return;
    const durationMs = clock.elapsedMs();
    if (durationMs === null) return;
    reported = true;
    telemetry.logEvent(
      'recommendation.first_shown',
      firstRecommendationShownAttributes({ ...shown, durationMs }),
    );
  };
}

// One reporter per process clock, held outside any component, so the once-per-process rule
// survives every Today mount, unmount and shell remount.
const reporters = new WeakMap<object, ReturnType<typeof createFirstRecommendationReport>>();

function reporterFor(clock: Pick<ProcessClock, 'elapsedMs'>) {
  let report = reporters.get(clock);
  if (!report) {
    report = createFirstRecommendationReport(clock);
    reporters.set(clock, report);
  }
  return report;
}

export function useFirstRecommendationReport(): (shown: ShownRecommendation) => void {
  const telemetry = usePerformanceTelemetry();
  const report = reporterFor(use(ProcessClockContext));
  return useCallback((shown) => report(telemetry, shown), [report, telemetry]);
}
