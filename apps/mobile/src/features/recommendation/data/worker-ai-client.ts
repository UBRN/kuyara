import {
  aiRecommendV1Path,
  aiRecommendV1RequestSchema,
  aiRecommendV1SuccessSchema,
  aiV1ErrorSchema,
  type AiRecommendV1Request,
  type AiRecommendV1Success,
} from '@kuyara/contracts';

type Fetch = (input: string, init: RequestInit) => Promise<Response>;

type Dependencies = Readonly<{
  baseUrl: string;
  fetch?: Fetch;
  requestTimeoutMilliseconds?: number;
}>;

export type WorkerAiClientFailureKind =
  | 'invalid-request'
  | 'network'
  | 'service'
  | 'invalid-response';

export class WorkerAiClientError extends Error {
  readonly kind: WorkerAiClientFailureKind;

  constructor(kind: WorkerAiClientFailureKind) {
    super('The AI recommendation request could not be completed.');
    this.name = 'WorkerAiClientError';
    this.kind = kind;
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new WorkerAiClientError('invalid-response');
  }
}

export class WorkerAiClient {
  private readonly baseUrl: string;
  private readonly fetch: Fetch;
  private readonly requestTimeoutMilliseconds: number;

  constructor(dependencies: Dependencies) {
    this.baseUrl = dependencies.baseUrl.replace(/\/$/, '');
    this.fetch = dependencies.fetch ?? globalThis.fetch;
    this.requestTimeoutMilliseconds = dependencies.requestTimeoutMilliseconds ?? 10000;
  }

  async recommend(
    input: AiRecommendV1Request,
  ): Promise<AiRecommendV1Success['data']> {
    const request = aiRecommendV1RequestSchema.safeParse(input);
    if (!request.success) throw new WorkerAiClientError('invalid-request');

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.requestTimeoutMilliseconds,
    );

    try {
      let response: Response;
      try {
        response = await this.fetch(`${this.baseUrl}${aiRecommendV1Path}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(request.data),
          signal: controller.signal,
        });
      } catch {
        throw new WorkerAiClientError('network');
      }

      const body = await readJson(response);
      if (!response.ok) {
        if (!aiV1ErrorSchema.safeParse(body).success) {
          throw new WorkerAiClientError('invalid-response');
        }
        throw new WorkerAiClientError('service');
      }

      const success = aiRecommendV1SuccessSchema.safeParse(body);
      if (!success.success) throw new WorkerAiClientError('invalid-response');
      return success.data.data;
    } finally {
      clearTimeout(timeout);
    }
  }
}
