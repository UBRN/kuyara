import {
  aiProbeV1Path,
  aiProbeV1SuccessSchema,
  aiV1ErrorSchema,
  type AiProbeV1Success,
} from '@kuyara/contracts';

import { fetchJsonWithTimeout, type Fetch } from '@/infrastructure/network/fetch-json-with-timeout';
import { WorkerAiProbeClientError } from '@/features/recommendation/domain/worker-ai-probe-client-error';

type Dependencies = Readonly<{
  baseUrl: string;
  fetch?: Fetch;
  requestTimeoutMilliseconds?: number;
}>;

export class WorkerAiProbeClient {
  private readonly baseUrl: string;
  private readonly fetch: Fetch;
  private readonly requestTimeoutMilliseconds: number;

  constructor(dependencies: Dependencies) {
    this.baseUrl = dependencies.baseUrl;
    this.fetch = dependencies.fetch ?? globalThis.fetch;
    this.requestTimeoutMilliseconds = dependencies.requestTimeoutMilliseconds ?? 25000;
  }

  async probe(): Promise<AiProbeV1Success['data']> {
    const { response, body } = await fetchJsonWithTimeout(
      this.fetch,
      `${this.baseUrl}${aiProbeV1Path}`,
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' },
      this.requestTimeoutMilliseconds,
      {
        network: () => new WorkerAiProbeClientError('network'),
        invalidJson: () => new WorkerAiProbeClientError('invalid-response'),
      },
    );
    if (!response.ok) {
      const error = aiV1ErrorSchema.safeParse(body);
      if (!error.success) throw new WorkerAiProbeClientError('invalid-response');
      throw new WorkerAiProbeClientError(
        error.data.error.code === 'rate_limited' ? 'rate-limited' : 'service',
      );
    }

    const success = aiProbeV1SuccessSchema.safeParse(body);
    if (!success.success) throw new WorkerAiProbeClientError('invalid-response');
    return success.data.data;
  }
}
