import { createAiHandler } from './ai/ai-handler.ts';
import type { AiProvider } from './ai/ai-provider.ts';
import { OpenRouterAiProvider } from './ai/openrouter-ai-provider.ts';
import {
  createProbeHandler,
  PROBE_COUNTER_TTL_SECONDS,
  type ProbeDailyCounter,
  type RateLimiter,
} from './ai/probe-handler.ts';
import {
  WorkersAiProvider,
  type WorkersAiBinding,
} from './ai/workers-ai-provider.ts';
import { createRouter } from './router.ts';
import { createWeatherHandler } from './weather-handler.ts';
import {
  createDailyCappedWeatherProvider,
  openWeatherDailyCallLimit,
  weatherKitDailyCallLimit,
} from './weather/daily-capped-weather-provider.ts';
import { OpenMeteoWeatherProvider } from './weather/open-meteo-weather-provider.ts';
import { OpenWeatherWeatherProvider } from './weather/openweather-weather-provider.ts';
import type { WeatherProvider } from './weather/weather-provider.ts';
import { createWeatherProviderChain } from './weather/weather-provider-chain.ts';
import {
  createWeatherKitTokenProvider,
  type WeatherKitCredentials,
} from './weather/weatherkit-token.ts';
import { WeatherKitWeatherProvider } from './weather/weatherkit-weather-provider.ts';

interface KvNamespace {
  get(key: string): Promise<string | null>;
  put(
    key: string,
    value: string,
    options?: { expirationTtl?: number },
  ): Promise<void>;
}

interface RateLimitBinding {
  limit(input: { key: string }): Promise<{ success: boolean }>;
}

export type Env = Readonly<{
  OPENROUTER_API_KEY?: string;
  OPENROUTER_MODELS?: readonly string[];
  WORKERS_AI_MODEL?: string;
  AI?: WorkersAiBinding;
  // Shared by the AI probe and the namespaced weather daily cap.
  PROBE_COUNTER?: KvNamespace;
  AI_PROBE_RATE_LIMIT?: RateLimitBinding;
  AI_RECOMMEND_RATE_LIMIT?: RateLimitBinding;
  OPENWEATHER_API_KEY?: string;
  WEATHERKIT_TEAM_ID?: string;
  WEATHERKIT_SERVICE_ID?: string;
  WEATHERKIT_KEY_ID?: string;
  WEATHERKIT_PRIVATE_KEY?: string;
  WEATHER_RATE_LIMIT?: RateLimitBinding;
}>;

const permissiveRateLimiter: RateLimiter = {
  limit: async () => ({ success: true }),
};
const permissiveProbeDailyCounter: ProbeDailyCounter = {
  get: async () => 0,
  increment: async () => {},
};

function createKvProbeDailyCounter(kv: KvNamespace): ProbeDailyCounter {
  const get = async (dateKey: string): Promise<number> => {
    const count = Number.parseInt(await kv.get(dateKey) ?? '', 10);
    return Number.isNaN(count) ? 0 : count;
  };
  return {
    get,
    increment: async (dateKey) => {
      await kv.put(dateKey, String((await get(dateKey)) + 1), {
        expirationTtl: PROBE_COUNTER_TTL_SECONDS,
      });
    },
  };
}

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

function weatherKitCredentials(env: Env): WeatherKitCredentials | null {
  const teamId = env.WEATHERKIT_TEAM_ID;
  const serviceId = env.WEATHERKIT_SERVICE_ID;
  const keyId = env.WEATHERKIT_KEY_ID;
  const privateKeyPem = env.WEATHERKIT_PRIVATE_KEY;
  if (!teamId || !serviceId || !keyId || !privateKeyPem) return null;
  return { teamId, serviceId, keyId, privateKeyPem };
}

export function createWeatherProviders(env: Env): readonly WeatherProvider[] {
  const providers: WeatherProvider[] = [new OpenMeteoWeatherProvider()];
  const weatherKit = weatherKitCredentials(env);
  if (weatherKit) {
    providers.unshift(createDailyCappedWeatherProvider({
      provider: new WeatherKitWeatherProvider({
        token: createWeatherKitTokenProvider(weatherKit),
      }),
      counter: env.PROBE_COUNTER
        ? createKvProbeDailyCounter(env.PROBE_COUNTER)
        : permissiveProbeDailyCounter,
      dailyLimit: weatherKitDailyCallLimit,
      sourceSlug: 'weatherkit',
    }));
  }
  if (
    typeof env.OPENWEATHER_API_KEY === 'string'
    && env.OPENWEATHER_API_KEY.length > 0
  ) {
    providers.push(createDailyCappedWeatherProvider({
      provider: new OpenWeatherWeatherProvider({ apiKey: env.OPENWEATHER_API_KEY }),
      counter: env.PROBE_COUNTER
        ? createKvProbeDailyCounter(env.PROBE_COUNTER)
        : permissiveProbeDailyCounter,
      dailyLimit: openWeatherDailyCallLimit,
      sourceSlug: 'openweather',
    }));
  }
  return providers;
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    const providers = createAiProviders(env);
    const rateLimiter = env.WEATHER_RATE_LIMIT ?? permissiveRateLimiter;
    const weatherHandler = createWeatherHandler({
      provider: createWeatherProviderChain({ providers: createWeatherProviders(env) }),
      rateLimiter,
    });
    // Workers AI measured 7.9-9.6s against the handler's 10s default, so the working
    // provider was being aborted at the boundary; 20s leaves real headroom.
    const aiHandler = createAiHandler({
      providers,
      rateLimiter: env.AI_RECOMMEND_RATE_LIMIT,
      attemptTimeoutMs: 20_000,
    });
    const probeHandler = createProbeHandler({
      providers,
      rateLimiter: env.AI_PROBE_RATE_LIMIT ?? permissiveRateLimiter,
      dailyCounter: env.PROBE_COUNTER
        ? createKvProbeDailyCounter(env.PROBE_COUNTER)
        : permissiveProbeDailyCounter,
    });
    return createRouter({
      weatherHandler,
      aiHandler,
      probeHandler,
      aiReady: providers.length > 0,
    })(request);
  },
};
