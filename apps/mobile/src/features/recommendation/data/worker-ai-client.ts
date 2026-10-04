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
import type { SupportedLanguage } from '@/domain/preferences';

import { fetchJsonWithTimeout, type Fetch } from '@/infrastructure/network/fetch-json-with-timeout';

// Leaves one second for HTTP transport before the mobile client's abort.
const workerTransportMarginMilliseconds = 1_000;

type Dependencies = Readonly<{
  baseUrl: string;
  fetch?: Fetch;
  requestTimeoutMilliseconds?: number;
  /**
   * A signed-in member's access token, null for everyone else; it answers null rather than
   * throw. Only a re-ask sends it, as a bearer header, so the Worker counts the member's
   * allowance (ADR 0041 section 13); the request body is unchanged.
   */
  memberAccessToken?: () => Promise<string | null>;
}>;

export type WorkerAiClientFailureKind =
  | 'invalid-request'
  | 'network'
  | 'service'
  | 'invalid-response';

export class WorkerAiClientError extends Error {
  readonly kind: WorkerAiClientFailureKind;
  /**
   * A `network` failure the phone's own timeout aborted: the Worker may still have answered and
   * counted the request. False for one that never reached it (offline, refused).
   */
  readonly timedOut: boolean;

  constructor(kind: WorkerAiClientFailureKind, { timedOut = false }: Readonly<{ timedOut?: boolean }> = {}) {
    super('The AI recommendation request could not be completed.');
    this.name = 'WorkerAiClientError';
    this.kind = kind;
    this.timedOut = timedOut;
  }
}

/** Whether a fetch failure is the abort `fetchJsonWithTimeout` raises at its deadline. */
const isAbort = (cause: unknown) => cause instanceof Error && cause.name === 'AbortError';

export class WorkerAiClient {
  private readonly baseUrl: string;
  private readonly fetch: Fetch;
  private readonly requestTimeoutMilliseconds: number;
  private readonly memberAccessToken: () => Promise<string | null>;

  constructor(dependencies: Dependencies) {
    this.baseUrl = dependencies.baseUrl;
    this.fetch = dependencies.fetch ?? globalThis.fetch;
    // One budget across the boundary: the Worker stops its AI walk at 36 s, so the phone
    // waits that long plus transport instead of aborting an attempt that is still working.
    // A refresh may take as long as it needs while a stylist answer is still obtainable;
    // standard suggestions are what a failed last provider produces, not a short clock.
    this.requestTimeoutMilliseconds = dependencies.requestTimeoutMilliseconds ?? 38_000;
    this.memberAccessToken = dependencies.memberAccessToken ?? (async () => null);
  }

  /** The bearer header of a member's re-ask; none without a token. */
  private async memberAuthorization(): Promise<Readonly<Record<string, string>>> {
    const token = await this.memberAccessToken();
    return token ? { authorization: `Bearer ${token}` } : {};
  }

  // `options.timeoutMilliseconds` is the wait the routed client grants the Worker tier.
  // Omitted, the instance default applies and the Worker path behaves exactly as it did
  // before the on-device tier existed. `options.reask` marks an approved re-ask, which the
  // Worker answers without its shared cache; every other request leaves the field out.
  async recommend(
    input: AiRecommendV1Request,
    options?: Readonly<{ timeoutMilliseconds?: number; locale?: SupportedLanguage; reask?: true }>,
  ): Promise<AiRecommendV2Success['data']> {
    const request = aiRecommendV2RequestSchema.safeParse({
      ...input,
      locale: options?.locale ?? 'en',
      ...(options?.reask ? { reask: true } : {}),
    });
    if (!request.success) throw new WorkerAiClientError('invalid-request');

    const requestTimeoutMilliseconds =
      options?.timeoutMilliseconds ?? this.requestTimeoutMilliseconds;
    // Read only for a re-ask, so every other request leaves at once, exactly as before.
    const authorization = options?.reask ? await this.memberAuthorization() : {};
    const workerBudget = aiRecommendV1BudgetMillisecondsSchema.safeParse(
      requestTimeoutMilliseconds - workerTransportMarginMilliseconds,
    );
    const { response, body } = await fetchJsonWithTimeout(
      this.fetch,
      `${this.baseUrl}${aiRecommendV2Path}`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...authorization,
          ...(workerBudget.success
            ? { [aiRecommendV1BudgetHeader]: String(workerBudget.data) }
            : {}),
        },
        body: JSON.stringify(request.data),
      },
      requestTimeoutMilliseconds,
      {
        network: (cause) => new WorkerAiClientError('network', { timedOut: isAbort(cause) }),
        invalidJson: () => new WorkerAiClientError('invalid-response'),
      },
    );
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
  }
}
