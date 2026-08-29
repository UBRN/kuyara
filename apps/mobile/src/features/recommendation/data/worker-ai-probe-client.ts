import {
  aiProbeV1Path,
  aiProbeV1SuccessSchema,
  aiV1ErrorSchema,
  type AiProbeV1Success,
} from '@kuyara/contracts';

type Fetch = (input: string, init: RequestInit) => Promise<Response>;

type Dependencies = Readonly<{
  baseUrl: string;
  fetch?: Fetch;
  requestTimeoutMilliseconds?: number;
}>;

export type WorkerAiProbeFailureKind =
  | 'network'
  | 'service'
  | 'rate-limited'
  | 'invalid-response';

export class WorkerAiProbeClientError extends Error {
  readonly kind: WorkerAiProbeFailureKind;

  constructor(kind: WorkerAiProbeFailureKind) {
    super('The AI status check could not be completed.');
    this.name = 'WorkerAiProbeClientError';
    this.kind = kind;
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new WorkerAiProbeClientError('invalid-response');
  }
}

export class WorkerAiProbeClient {
  private readonly baseUrl: string;
  private readonly fetch: Fetch;
  private readonly requestTimeoutMilliseconds: number;

  constructor(dependencies: Dependencies) {
    this.baseUrl = dependencies.baseUrl.replace(/\/$/, '');
    this.fetch = dependencies.fetch ?? globalThis.fetch;
    this.requestTimeoutMilliseconds = dependencies.requestTimeoutMilliseconds ?? 25000;
  }

  async probe(): Promise<AiProbeV1Success['data']> {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.requestTimeoutMilliseconds,
    );

    try {
      let response: Response;
      try {
        response = await this.fetch(`${this.baseUrl}${aiProbeV1Path}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{}',
          signal: controller.signal,
        });
      } catch {
        throw new WorkerAiProbeClientError('network');
      }

      const body = await readJson(response);
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
    } finally {
      clearTimeout(timeout);
    }
  }
}
