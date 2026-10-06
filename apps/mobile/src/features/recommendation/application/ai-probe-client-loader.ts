import type { AiProbeClient } from '@/features/recommendation/application/ai-probe-state';
import { WorkerAiProbeClient } from '@/features/recommendation/data/worker-ai-probe-client';

/** The one place the AI status check's HTTP client is built, so the hook depends on the port only. */
export function createAiProbeClient(baseUrl: string): AiProbeClient {
  return new WorkerAiProbeClient({ baseUrl });
}
