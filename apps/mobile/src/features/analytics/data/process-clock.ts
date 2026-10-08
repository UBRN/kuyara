// The app's one monotonic read (`performance.now()`), wrapped as the process clock. The root
// layout marks it once at module scope and hands it down through `ProcessClockContext`.
import { launchVisibility } from '@/features/analytics/data/launch-visibility';
import { createProcessClock } from '@/features/analytics/domain/process-clock';

export const processClock = createProcessClock(() => performance.now(), launchVisibility.isTimed);
