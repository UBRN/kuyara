import type { AiRecommendV1Request } from '@kuyara/contracts';

import { buildMessages, buildPickJsonSchema } from './ai-prompt.ts';
import type { AiProvider } from './ai-provider.ts';

export interface WorkersAiBinding {
  run(model: string, input: unknown): Promise<unknown>;
}

type Options = Readonly<{
  ai: WorkersAiBinding;
  model: string;
}>;

export class WorkersAiProvider implements AiProvider {
  readonly options: Options;

  constructor(options: Options) {
    this.options = options;
  }

  async generateOutfits(
    request: AiRecommendV1Request,
    signal: AbortSignal,
  ): Promise<unknown> {
    signal.throwIfAborted();
    const messages = buildMessages(request);
    const responseSchema = buildPickJsonSchema(request.options);
    // ponytail: binding takes no AbortSignal; the handler's per-attempt race bounds it.
    const result = await this.options.ai.run(this.options.model, {
      max_tokens: 2048,
      messages,
      response_format: {
        type: 'json_schema',
        json_schema: responseSchema,
      },
    });
    if (typeof result !== 'object' || result === null || !Object.hasOwn(result, 'response')) {
      throw new Error('Workers AI response invalid.');
    }
    const response = (result as { response: unknown }).response;
    if (typeof response !== 'object' || response === null || Array.isArray(response)) {
      throw new Error('Workers AI response invalid.');
    }
    return response;
  }
}
