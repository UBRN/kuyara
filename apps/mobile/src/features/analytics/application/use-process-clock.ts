// The composition boundary for "time since the process started". It defaults to a clock with no
// mark, so a tree without the root layout (a component test) measures nothing and fails nothing.
import { createContext } from 'react';

import type { ProcessClock } from '@/features/analytics/domain/process-clock';

export const ProcessClockContext = createContext<Pick<ProcessClock, 'elapsedMs'>>({
  elapsedMs: () => null,
});
