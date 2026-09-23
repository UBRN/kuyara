import {
  aiRecommendV1BudgetHeader,
  aiRecommendV1BudgetMillisecondsSchema,
  aiRecommendV1SuccessSchema,
  aiRecommendV2Path,
  aiRecommendV2RequestSchema,
  aiRecommendV2SuccessSchema,
  aiV1ErrorSchema,
  type AiRecommendV1Request,
  type AiRecommendV2Success,
} from '@kuyara/contracts';

// Leaves one second for HTTP transport before the mobile client's abort.
const workerTransportMarginMilliseconds = 1_000;

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
    // One budget across the boundary: the Worker stops its AI walk at 36 s, so the phone
    // waits that long plus transport instead of aborting an attempt that is still working.
    // A refresh may take as long as it needs while a stylist answer is still obtainable;
    // standard suggestions are what a failed last provider produces, not a short clock.
    this.requestTimeoutMilliseconds = dependencies.requestTimeoutMilliseconds ?? 38_000;
  }

  // `options.timeoutMilliseconds` is the wait the routed client grants the Worker tier.
  // Omitted, the instance default applies and the Worker path behaves exactly as it did
  // before the on-device tier existed.
  async recommend(
    input: AiRecommendV1Request,
    options?: Readonly<{ timeoutMilliseconds?: number; locale?: 'tr' | 'en' }>,
  ): Promise<AiRecommendV2Success['data']> {
    const request = aiRecommendV2RequestSchema.safeParse({ ...input, locale: options?.locale ?? 'en' });
    if (!request.success) throw new WorkerAiClientError('invalid-request');

    const requestTimeoutMilliseconds =
      options?.timeoutMilliseconds ?? this.requestTimeoutMilliseconds;
    const workerBudget = aiRecommendV1BudgetMillisecondsSchema.safeParse(
      requestTimeoutMilliseconds - workerTransportMarginMilliseconds,
    );
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      requestTimeoutMilliseconds,
    );

    try {
      let response: Response;
      try {
        response = await this.fetch(`${this.baseUrl}${aiRecommendV2Path}`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            ...(workerBudget.success
              ? { [aiRecommendV1BudgetHeader]: String(workerBudget.data) }
              : {}),
          },
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

      const success = aiRecommendV2SuccessSchema.safeParse(body);
      if (success.success) return success.data.data;
      // A bad optional sentence loses only the prose. The pick gate is still the
      // shared v1 schema; a malformed pick fails both readers.
      const picks = aiRecommendV1SuccessSchema.safeParse(body);
      if (!picks.success) throw new WorkerAiClientError('invalid-response');
      return picks.data.data;
    } finally {
      clearTimeout(timeout);
    }
  }
}
