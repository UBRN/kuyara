import {
  aiProbeV1Path,
  aiRecommendV1Path,
  aiV1ErrorSchema,
  placeSearchV1ErrorSchema,
  placeSearchV1Path,
  weatherV1ErrorSchema,
  weatherV1Path,
} from '@kuyara/contracts';

import { OpenMeteoPlaceProvider } from './places/open-meteo-place-provider.ts';
import { createPlaceSearchHandler } from './places/place-search-handler.ts';
import { WORKERS_AI_DAILY_ATTEMPT_LIMIT, createAiHandler } from './ai/ai-handler.ts';
import type { AiProvider } from './ai/ai-provider.ts';
import { OpenRouterAiProvider } from './ai/openrouter-ai-provider.ts';
import { createProbeHandler } from './ai/probe-handler.ts';
import {
  WorkersAiProvider,
  type WorkersAiBinding,
} from './ai/workers-ai-provider.ts';
import { createDurableDailyCounter, type DailyCounterNamespace } from './daily-counter.ts';
import { createRouter, type ExecutionContext, type Handler } from './router.ts';
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

// Wrangler resolves the Durable Object class from the main module's exports.
export { DailyCounter } from './daily-counter.ts';

interface RateLimitBinding {
  limit(input: { key: string }): Promise<{ success: boolean }>;
}

export type Env = Readonly<{
  OPENROUTER_API_KEY?: string;
  OPENROUTER_MODELS?: readonly string[];
  WORKERS_AI_MODELS?: readonly string[];
  AI?: WorkersAiBinding;
  // One Durable Object per counter name: the AI probe, the Workers AI attempt budget and
  // the two capped weather providers each get their own object (see daily-counter.ts).
  DAILY_COUNTERS?: DailyCounterNamespace;
  AI_PROBE_RATE_LIMIT?: RateLimitBinding;
  AI_RECOMMEND_RATE_LIMIT?: RateLimitBinding;
  OPENWEATHER_API_KEY?: string;
  WEATHERKIT_TEAM_ID?: string;
  WEATHERKIT_SERVICE_ID?: string;
  WEATHERKIT_KEY_ID?: string;
  WEATHERKIT_PRIVATE_KEY?: string;
  WEATHER_RATE_LIMIT?: RateLimitBinding;
  PLACE_SEARCH_RATE_LIMIT?: RateLimitBinding;
}>;

const jsonHeaders = {
  'Cache-Control': 'no-store',
  'Content-Type': 'application/json; charset=utf-8',
} as const;

/**
 * One policy for every route that spends provider quota: when its rate limiter or its daily
 * counter binding is missing, the route answers 503 with its own unavailable code instead
 * of running unlimited or uncounted. Logged once per composition, not per request.
 */
function offlineRoute(route: string, binding: string, body: unknown): Handler {
  console.warn({ event: 'route_binding_missing', route, binding });
  return async () => Response.json(body, { status: 503, headers: jsonHeaders });
}

const weatherUnavailable = weatherV1ErrorSchema.parse({ error: { code: 'weather_unavailable' } });
const placesUnavailable = placeSearchV1ErrorSchema.parse({ error: { code: 'places_unavailable' } });
const aiUnavailable = aiV1ErrorSchema.parse({ error: { code: 'ai_unavailable' } });

export function createAiProviders(env: Env): AiProvider[] {
  const providers: AiProvider[] = [];
  const workersAiModels = Array.isArray(env.WORKERS_AI_MODELS)
    ? env.WORKERS_AI_MODELS
    : [];
  const openRouterModels = Array.isArray(env.OPENROUTER_MODELS)
    ? env.OPENROUTER_MODELS
    : [];
  if (env.AI) {
    for (const model of workersAiModels) {
      providers.push(new WorkersAiProvider({ ai: env.AI, model }));
    }
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

/**
 * The capped providers exist only with the counter binding: without it WeatherKit and
 * OpenWeather are never composed, so neither is ever called uncounted, and the uncapped
 * Open-Meteo serves alone.
 */
export function createWeatherProviders(env: Env): readonly WeatherProvider[] {
  const providers: WeatherProvider[] = [new OpenMeteoWeatherProvider()];
  const counters = env.DAILY_COUNTERS;
  if (!counters) {
    console.warn({ event: 'route_binding_missing', route: weatherV1Path, binding: 'DAILY_COUNTERS' });
    return providers;
  }
  const weatherKit = weatherKitCredentials(env);
  if (weatherKit) {
    providers.unshift(createDailyCappedWeatherProvider({
      provider: new WeatherKitWeatherProvider({
        token: createWeatherKitTokenProvider(weatherKit),
      }),
      counter: createDurableDailyCounter(counters, 'weather:weatherkit'),
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
      counter: createDurableDailyCounter(counters, 'weather:openweather'),
      dailyLimit: openWeatherDailyCallLimit,
      sourceSlug: 'openweather',
    }));
  }
  return providers;
}

export function buildRouter(env: Env): Handler {
  const providers = createAiProviders(env);
  const weatherHandler = env.WEATHER_RATE_LIMIT
    ? createWeatherHandler({
      provider: createWeatherProviderChain({ providers: createWeatherProviders(env) }),
      rateLimiter: env.WEATHER_RATE_LIMIT,
    })
    : offlineRoute(weatherV1Path, 'WEATHER_RATE_LIMIT', weatherUnavailable);
  // Place search has its own binding: sharing weather's let a burst of typed keystrokes
  // exhaust the weather refresh budget, and the reverse.
  const placeSearchHandler = env.PLACE_SEARCH_RATE_LIMIT
    ? createPlaceSearchHandler({
      provider: new OpenMeteoPlaceProvider(),
      rateLimiter: env.PLACE_SEARCH_RATE_LIMIT,
    })
    : offlineRoute(placeSearchV1Path, 'PLACE_SEARCH_RATE_LIMIT', placesUnavailable);
  const aiHandler = !env.AI_RECOMMEND_RATE_LIMIT
    ? offlineRoute(aiRecommendV1Path, 'AI_RECOMMEND_RATE_LIMIT', aiUnavailable)
    : !env.DAILY_COUNTERS
      ? offlineRoute(aiRecommendV1Path, 'DAILY_COUNTERS', aiUnavailable)
      : createAiHandler({
        providers,
        rateLimiter: env.AI_RECOMMEND_RATE_LIMIT,
        dailyCounter: createDurableDailyCounter(env.DAILY_COUNTERS, 'ai:workers-ai'),
        dailyLimit: WORKERS_AI_DAILY_ATTEMPT_LIMIT,
      });
  const probeHandler = !env.AI_PROBE_RATE_LIMIT
    ? offlineRoute(aiProbeV1Path, 'AI_PROBE_RATE_LIMIT', aiUnavailable)
    : !env.DAILY_COUNTERS
      ? offlineRoute(aiProbeV1Path, 'DAILY_COUNTERS', aiUnavailable)
      : createProbeHandler({
        providers,
        rateLimiter: env.AI_PROBE_RATE_LIMIT,
        dailyCounter: createDurableDailyCounter(env.DAILY_COUNTERS, 'probe'),
      });
  return createRouter({
    weatherHandler,
    placeSearchHandler,
    aiHandler,
    probeHandler,
    aiReady: providers.length > 0,
  });
}

/**
 * Composition is isolate-scoped, not request-scoped. Composing inside `fetch` made every
 * per-isolate cache dead: the probe's 60 s result cache never outlived a request, and the
 * WeatherKit token provider re-imported the PKCS8 key and signed a fresh ES256 JWT on
 * every `/v1/weather` call. Nothing request-scoped may be captured here: what the memo
 * holds is a CryptoKey promise, strings, plain config, the Durable Object namespace binding
 * (the stub is resolved per call, because a stub is bound to the request that created it)
 * and handler closures, and the handlers take the `Request` and the `ExecutionContext` as
 * arguments.
 *
 * The memo is keyed on the configuration the composition reads, not on the first `env`
 * seen: Cloudflare documents that a deploy which changes only bindings (a rotated secret,
 * an edited var) may reuse running isolates, so a memo that never looks at `env` again
 * would keep signing with the old key, or keep a route offline after its binding was
 * added, until the isolate recycled. Comparing a few strings per request is far cheaper
 * than what the memo saves.
 */
function compositionKey(env: Env): string {
  return JSON.stringify([
    env.OPENROUTER_API_KEY,
    env.OPENROUTER_MODELS,
    env.WORKERS_AI_MODELS,
    env.OPENWEATHER_API_KEY,
    env.WEATHERKIT_TEAM_ID,
    env.WEATHERKIT_SERVICE_ID,
    env.WEATHERKIT_KEY_ID,
    env.WEATHERKIT_PRIVATE_KEY,
    // Binding presence decides which routes go offline and which providers are composed.
    Boolean(env.AI),
    Boolean(env.DAILY_COUNTERS),
    Boolean(env.AI_PROBE_RATE_LIMIT),
    Boolean(env.AI_RECOMMEND_RATE_LIMIT),
    Boolean(env.WEATHER_RATE_LIMIT),
    Boolean(env.PLACE_SEARCH_RATE_LIMIT),
  ]);
}

let composed: { key: string; router: Handler } | undefined;

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const key = compositionKey(env);
    if (composed?.key !== key) composed = { key, router: buildRouter(env) };
    return composed.router(request, ctx);
  },
};
