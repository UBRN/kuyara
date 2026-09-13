import {
  aiModelInputFromRequest,
  type AiRecommendV1Request,
  type AiRecommendV1Success,
} from '@kuyara/contracts';

import type { OnDeviceAiAvailability } from '@/features/recommendation/domain/on-device-ai-availability';

// ADR 0034 section 6: the only description of the native surface anywhere in the app.
// Structured JSON goes in and structured JSON comes out; prose never crosses the boundary.
export type OnDeviceAiModule = Readonly<{
  getAvailability(): Promise<OnDeviceAiAvailability>;
  selectOutfits(
    input: string,
    options: Readonly<{ timeoutMs: number }>,
  ): Promise<string>;
}>;

/**
 * Every on-device outcome except a result is the same outcome to the caller: the Worker's
 * turn. Nothing above this reads a reason, so no reason is carried.
 */
export class OnDeviceAiError extends Error {
  constructor() {
    super('The on-device AI selection could not be completed.');
    this.name = 'OnDeviceAiError';
  }
}

// ADR 0034 section 2: one attempt, no retry, 6 s of the 20 s user-visible budget. The
// budget covers the whole on-device cost, the availability read included, so no part of the
// tier can spend time outside it.
export const onDeviceAiBudgetMilliseconds = 6000;

type Dependencies = Readonly<{
  module: OnDeviceAiModule | null;
  timeoutMilliseconds?: number;
}>;

const unavailable: OnDeviceAiAvailability = { status: 'unavailable', reason: 'unknown' };

export class OnDeviceAiClient {
  private readonly module: OnDeviceAiModule | null;
  private readonly timeoutMilliseconds: number;

  constructor(dependencies: Dependencies) {
    this.module = dependencies.module;
    this.timeoutMilliseconds =
      dependencies.timeoutMilliseconds ?? onDeviceAiBudgetMilliseconds;
  }

  // No inference, no quota, no measurable time: this is not a probe. It is still a call into
  // a native module, so it is bounded like every other one. A read that never settles would
  // otherwise leave the AI status row on its pre-answer state for the life of the screen,
  // which that screen renders as "not available on this device": a wrong answer, kept.
  async getAvailability(): Promise<OnDeviceAiAvailability> {
    if (!this.module) return { status: 'unavailable', reason: 'device_not_eligible' };
    const module = this.module;
    try {
      return await this.withinBudget(() => module.getAvailability());
    } catch {
      return unavailable;
    }
  }

  async recommend(
    request: AiRecommendV1Request,
  ): Promise<AiRecommendV1Success['data']> {
    const module = this.module;
    if (!module) throw new OnDeviceAiError();
    // The budget starts before the availability read, so an availability call that is slow
    // or never settles is abandoned at 6 s like any other on-device cost and the Worker
    // still gets its 14 s floor.
    return this.withinBudget(() => this.attempt(module, request));
  }

  private async attempt(
    module: OnDeviceAiModule,
    request: AiRecommendV1Request,
  ): Promise<AiRecommendV1Success['data']> {
    const availability = await module.getAvailability().catch(() => unavailable);
    if (availability.status !== 'available') {
      reportSkipped(availability.reason ?? 'unknown');
      throw new OnDeviceAiError();
    }

    // The module is told the budget as well, so a session that never settles is cancelled
    // natively rather than left running behind an abandoned call.
    const reply = await module
      .selectOutfits(JSON.stringify(aiModelInputFromRequest(request)), {
        timeoutMs: this.timeoutMilliseconds,
      })
      .catch((error: unknown) => {
        reportFailureReason(error);
        throw new OnDeviceAiError();
      });

    // Deliberately unvalidated here. The shared gate the routed client runs on this value
    // parses it with the same schema before anything else looks at it, so a second parse
    // would only be a second place for the rules to drift.
    return parseReply(reply) as AiRecommendV1Success['data'];
  }

  private async withinBudget<T>(work: () => Promise<T>): Promise<T> {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const budget = new Promise<never>((_resolve, reject) => {
      timeoutId = setTimeout(() => reject(new OnDeviceAiError()), this.timeoutMilliseconds);
    });
    try {
      return await Promise.race([work(), budget]);
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

function parseReply(reply: string): unknown {
  try {
    return JSON.parse(reply);
  } catch {
    throw new OnDeviceAiError();
  }
}

// The failure codes the native module writes into its message. Only a member of this list
// is ever read back out, so nothing the framework or the model produced can escape with it.
const failureReasons = [
  // The framework's generation errors.
  'exceeded_context_window',
  'assets_unavailable',
  'guardrail_violation',
  'unsupported_guide',
  'unsupported_language_or_locale',
  'decoding_failure',
  'rate_limited',
  'concurrent_requests',
  'refusal',
  // The module's own throw sites, one code each, so a failure that is none of the above
  // names the step it happened in instead of arriving as a second kind of unknown.
  'unavailable',
  'unsupported_os',
  'input_unreadable',
  'schema_build',
  'schema_duplicate_type',
  'schema_duplicate_property',
  'schema_empty_type_choices',
  'schema_undefined_references',
  'timeout',
  'response_unreadable',
] as const;

/**
 * Development only, and the only place the failure code is read: the tier's outcome above
 * this file stays the same single failure, so nothing reaches user copy, an analytics
 * property or the Observe event. `typeof` because the Node suites define no `__DEV__`.
 */
function reportSkipped(reason: string): void {
  if (typeof __DEV__ === 'undefined' || !__DEV__) return;
  console.warn(`On-device AI skipped: ${reason}.`);
}

function reportFailureReason(error: unknown): void {
  if (typeof __DEV__ === 'undefined' || !__DEV__) return;
  const message = error instanceof Error ? error.message : '';
  // The parentheses are part of the match: `unavailable` is a substring of
  // `assets_unavailable`, and the code the module wrote is the one in brackets.
  const reason =
    failureReasons.find((candidate) => message.includes(`(${candidate})`)) ?? 'unknown';
  console.warn(`On-device AI selection failed: ${reason}.`);
}
