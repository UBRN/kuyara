import {
  aiModelInputFromRequest,
  aiRecommendV1SuccessSchema,
  picksAreMeaningfullyDifferent,
  type AiOption,
  type AiRecommendV1Request,
  type AiRecommendV1Success,
} from '@kuyara/contracts';

import type { OnDeviceAiAvailability } from '@/features/recommendation/domain/on-device-ai-availability';

// ADR 0034 section 6: the only description of the native surface anywhere in the app.
// Structured JSON goes in and structured JSON comes out; prose never crosses the boundary.
// Phase 3 binds the Swift module to this interface; nothing else may import it.
export type OnDeviceAiModule = Readonly<{
  getAvailability(): Promise<OnDeviceAiAvailability>;
  selectOutfits(
    input: string,
    options: Readonly<{ timeoutMs: number }>,
  ): Promise<string>;
}>;

export type OnDeviceAiFailureKind =
  | 'unavailable'
  | 'timeout'
  | 'invalid-response'
  | 'native';

export class OnDeviceAiError extends Error {
  readonly kind: OnDeviceAiFailureKind;

  constructor(kind: OnDeviceAiFailureKind) {
    super('The on-device AI selection could not be completed.');
    this.name = 'OnDeviceAiError';
    this.kind = kind;
  }
}

// ADR 0034 section 2: one attempt, no retry, 6 s of the 20 s user-visible budget.
export const onDeviceAiBudgetMilliseconds = 6000;

type Dependencies = Readonly<{
  module: OnDeviceAiModule | null;
  timeoutMilliseconds?: number;
}>;

export class OnDeviceAiClient {
  private readonly module: OnDeviceAiModule | null;
  private readonly timeoutMilliseconds: number;

  constructor(dependencies: Dependencies) {
    this.module = dependencies.module;
    this.timeoutMilliseconds =
      dependencies.timeoutMilliseconds ?? onDeviceAiBudgetMilliseconds;
  }

  // No inference, no quota, no measurable time: this is not a probe.
  async getAvailability(): Promise<OnDeviceAiAvailability> {
    if (!this.module) return { status: 'unavailable', reason: 'device_not_eligible' };
    try {
      return await this.module.getAvailability();
    } catch {
      return { status: 'unavailable', reason: 'unknown' };
    }
  }

  async recommend(
    request: AiRecommendV1Request,
  ): Promise<AiRecommendV1Success['data']> {
    const availability = await this.getAvailability();
    if (availability.status !== 'available' || !this.module) {
      throw new OnDeviceAiError('unavailable');
    }

    const reply = await this.selectWithinBudget(this.module, request);
    const parsed = parseReply(reply);
    const validated = aiRecommendV1SuccessSchema.safeParse({ data: parsed });
    if (!validated.success) throw new OnDeviceAiError('invalid-response');

    // The same two gates the Worker applies before it answers: only supplied option
    // identifiers, and three meaningfully different picks. Failing either falls to the
    // Worker tier rather than repairing the answer into a different outfit.
    const options = new Map(request.options.map((option) => [option.optionId, option]));
    const picked = validated.data.data.picks.map(({ optionId }) => options.get(optionId));
    if (!picked.every((option): option is AiOption => option !== undefined)) {
      throw new OnDeviceAiError('invalid-response');
    }
    if (!picksAreMeaningfullyDifferent(picked)) {
      throw new OnDeviceAiError('invalid-response');
    }
    return validated.data.data;
  }

  private async selectWithinBudget(
    module: OnDeviceAiModule,
    request: AiRecommendV1Request,
  ): Promise<string> {
    // The module is told the budget and the caller enforces it too, so a module that never
    // settles cannot hold the recommendation past its 6 s.
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timeoutId = setTimeout(
        () => reject(new OnDeviceAiError('timeout')),
        this.timeoutMilliseconds,
      );
    });
    try {
      return await Promise.race([
        module
          .selectOutfits(JSON.stringify(aiModelInputFromRequest(request)), {
            timeoutMs: this.timeoutMilliseconds,
          })
          .catch(() => {
            throw new OnDeviceAiError('native');
          }),
        timeout,
      ]);
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

function parseReply(reply: string): unknown {
  try {
    return JSON.parse(reply);
  } catch {
    throw new OnDeviceAiError('invalid-response');
  }
}
