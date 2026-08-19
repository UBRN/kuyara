import type { AiRecommendV1Request } from '@kuyara/contracts';

import { buildMessages, outfitJsonSchema } from './ai-prompt.ts';
import type { AiProvider } from './ai-provider.ts';

type Options = Readonly<{
  apiKey: string;
  model: string;
  fetch?: typeof globalThis.fetch;
}>;

export class OpenRouterAiProvider implements AiProvider {
  readonly model: string;
  readonly #apiKey: string;
  readonly #fetch: typeof globalThis.fetch | undefined;

  constructor({ apiKey, model, fetch }: Options) {
    this.model = model;
    this.#apiKey = apiKey;
    this.#fetch = fetch;
  }

  async generateOutfits(
    request: AiRecommendV1Request,
    signal: AbortSignal,
  ): Promise<unknown> {
    const response = await (this.#fetch ?? globalThis.fetch)(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.#apiKey}`,
          'Content-Type': 'application/json',
        },
        signal,
        body: JSON.stringify({
          model: this.model,
          max_tokens: 2048,
          messages: buildMessages(request),
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'kuyara_outfits',
              strict: true,
              schema: outfitJsonSchema,
            },
          },
          provider: { require_parameters: true },
        }),
      },
    );
    if (!response.ok) throw new Error('OpenRouter request failed.');

    const body = await response.json() as {
      choices?: Array<{ message?: { content?: unknown } }>;
    } | null;
    const content = body?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') throw new Error('OpenRouter response invalid.');
    try {
      return JSON.parse(content);
    } catch {
      throw new Error('OpenRouter response invalid.');
    }
  }
}
