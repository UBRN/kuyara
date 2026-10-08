// The hook ties the once-per-process rule to the root's clock, not to a screen: Today can mount,
// unmount and show a recommendation again, and Observe still hears of the first one only.
import { render } from '@testing-library/react-native';
import { useEffect } from 'react';

import { useFirstRecommendationReport } from '@/features/analytics/application/first-recommendation-report';
import { PerformanceTelemetryContext } from '@/features/analytics/application/use-performance-telemetry';
import { ProcessClockContext } from '@/features/analytics/application/use-process-clock';
import type { PerformanceTelemetry } from '@/features/analytics/domain/performance-telemetry';

function Today() {
  const report = useFirstRecommendationReport();
  useEffect(() => {
    report({ generationMode: 'ai-assisted', cacheState: 'fresh' });
    report({ generationMode: 'on-device-ai', cacheState: 'refreshing' });
  }, [report]);
  return null;
}

function telemetry(logEvent: jest.Mock): PerformanceTelemetry {
  return {
    logEvent,
    reportError: () => undefined,
    setDispatching: async () => undefined,
    discardPending: async () => undefined,
    isApplied: () => true,
  };
}

describe('useFirstRecommendationReport', () => {
  test('reports one event with the elapsed time and the closed words, however often it is called', async () => {
    const logEvent = jest.fn();
    const clock = { elapsedMs: () => 1234.4 };
    const tree = (
      <PerformanceTelemetryContext value={telemetry(logEvent)}>
        <ProcessClockContext value={clock}><Today /></ProcessClockContext>
      </PerformanceTelemetryContext>
    );
    const screen = await render(tree);
    expect(logEvent).toHaveBeenCalledTimes(1);
    expect(logEvent).toHaveBeenCalledWith('recommendation.first_shown', {
      duration_ms: 1234, generation_mode: 'ai_assisted', cache_state: 'fresh',
    });

    // The same root renders Today again: nothing more is reported.
    await screen.rerender(tree);
    expect(logEvent).toHaveBeenCalledTimes(1);

    // Today unmounts and a new instance mounts under the same root: still one event.
    await screen.unmount();
    await render(tree);
    expect(logEvent).toHaveBeenCalledTimes(1);
  });

  test('without a root clock it measures nothing', async () => {
    const logEvent = jest.fn();
    await render(<PerformanceTelemetryContext value={telemetry(logEvent)}><Today /></PerformanceTelemetryContext>);
    expect(logEvent).not.toHaveBeenCalled();
  });
});
