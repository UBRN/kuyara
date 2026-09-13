// Marks a screen interactive exactly once, the moment it first has something to show. That
// instant is what Observe's `tti` metric measures, so calling it again on a later render
// would move the mark rather than add one; the ref keeps the first call authoritative.
//
// Pass `null` while the screen is still deciding what to render (a bootstrap or error
// surface that is not this screen's content), and the coarse presentation kind once it is.
import { useEffect, useRef } from 'react';

import { useObserveInteractiveMark } from '@/features/analytics/data/observe-performance-telemetry';
import type { TelemetryAttributes } from '@/features/analytics/domain/performance-telemetry';

export function useScreenInteractive(params: TelemetryAttributes | null): void {
  const markInteractive = useObserveInteractiveMark();
  const marked = useRef(false);

  useEffect(() => {
    if (marked.current || params === null) return;
    marked.current = true;
    markInteractive(params);
  }, [markInteractive, params]);
}
