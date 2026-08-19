import { createAiHandler } from './ai/ai-handler.ts';
import type { AiProvider } from './ai/ai-provider.ts';
import { OpenRouterAiProvider } from './ai/openrouter-ai-provider.ts';
import {
  WorkersAiProvider,
  type WorkersAiBinding,
} from './ai/workers-ai-provider.ts';
import { createRouter } from './router.ts';
import { createWeatherHandler } from './weather-handler.ts';
import { DeterministicMockWeatherProvider } from './weather/mock-weather-provider.ts';

export type Env = Readonly<{
  OPENROUTER_API_KEY?: string;
  OPENROUTER_MODELS?: readonly string[];
  WORKERS_AI_MODEL?: string;
  AI?: WorkersAiBinding;
}>;

const weatherProvider = new DeterministicMockWeatherProvider({
  now: () => new Date().toISOString(),
});
const weatherHandler = createWeatherHandler({ provider: weatherProvider });

export function createAiProviders(env: Env): AiProvider[] {
  const providers: AiProvider[] = [];
  const openRouterModels = Array.isArray(env.OPENROUTER_MODELS)
    ? env.OPENROUTER_MODELS
    : [];
  if (
    env.AI &&
    typeof env.WORKERS_AI_MODEL === 'string' &&
    env.WORKERS_AI_MODEL.length > 0
  ) {
    providers.push(new WorkersAiProvider({ ai: env.AI, model: env.WORKERS_AI_MODEL }));
  }
  if (typeof env.OPENROUTER_API_KEY === 'string' && env.OPENROUTER_API_KEY.length > 0) {
    for (const model of openRouterModels) {
      providers.push(new OpenRouterAiProvider({
        apiKey: env.OPENROUTER_API_KEY,
        model,
      }));
    }
  }
  return providers;
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    const providers = createAiProviders(env);
    // Workers AI measured 7.9-9.6s against the handler's 10s default, so the working
    // provider was being aborted at the boundary; 20s leaves real headroom.
    const aiHandler = createAiHandler({ providers, attemptTimeoutMs: 20_000 });
    return createRouter({
      weatherHandler,
      aiHandler,
      aiReady: providers.length > 0,
    })(request);
  },
};
