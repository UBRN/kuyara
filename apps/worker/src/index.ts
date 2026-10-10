import {
  accountDeleteV1ErrorSchema,
  accountDeleteV1Path,
  feedbackV1ErrorSchema,
  feedbackV1Path,
  aiProbeV1Path,
  aiProbeV2Path,
  aiRecommendV1Path,
  aiV1ErrorSchema,
  placeSearchV1ErrorSchema,
  placeSearchV1Path,
  weatherV1ErrorSchema,
  weatherV1Path,
} from '@kuyara/contracts';

import { createAccountDeleteHandler } from './account/account-delete-handler.ts';
import { createFeedbackHandler, type FeedbackDatabase } from './feedback-handler.ts';
import { createAppleTokenRevoker } from './account/apple-token-revoker.ts';
import { createSupabaseAdmin } from './account/supabase-admin.ts';
import { supabaseBaseUrl } from './account/supabase-base-url.ts';
import { runSupabaseKeepAlive } from './account/supabase-keep-alive.ts';
import { accountUpstreamTimeoutMs } from './account/upstream-timeout.ts';
import { createSupabaseTokenVerifier, type SupabaseTokenVerifier } from './account/supabase-token-verifier.ts';
import { OpenMeteoPlaceProvider } from './places/open-meteo-place-provider.ts';
import { createPlaceSearchHandler } from './places/place-search-handler.ts';
import { WORKERS_AI_DAILY_ATTEMPT_LIMIT, createAiHandler } from './ai/ai-handler.ts';
import type { AiProvider } from './ai/ai-provider.ts';
import {
  HAIKU_DAILY_ATTEMPT_LIMIT,
  HaikuAiProvider,
  haikuModels,
  haikuPromptCharacterLimit,
  haikuPromptCharacters,
} from './ai/haiku-ai-provider.ts';
import { createDailyCappedAiProvider } from './ai/daily-capped-ai-provider.ts';
import { OpenRouterAiProvider } from './ai/openrouter-ai-provider.ts';
import { createMemberAllowance } from './ai/member-allowance.ts';
import { createProbeHandler, createProbeV2Handler } from './ai/probe-handler.ts';
import {
  WorkersAiProvider,
  type WorkersAiBinding,
} from './ai/workers-ai-provider.ts';
import { createUsageMetrics, type AnalyticsEngineDataset } from './usage-metrics.ts';
import { createDurableDailyCounter, type DailyCounterNamespace } from './daily-counter.ts';
import type { RateLimiter } from './json-request.ts';
import { createRouter, type ExecutionContext, type Handler } from './router.ts';
import { jsonHeaders } from './json-response.ts';
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

export type Env = Readonly<{
  HAIKU_API_KEY?: string;
  HAIKU_MODELS?: readonly string[];
  OPENROUTER_API_KEY?: string;
  OPENROUTER_MODELS?: readonly string[];
  WORKERS_AI_MODELS?: readonly string[];
  AI?: WorkersAiBinding;
  // One Durable Object per counter name: the AI probe, the Haiku and Workers AI attempt
  // budgets, the two capped weather providers and each signed-in member's re-ask count each
  // get their own object (see daily-counter.ts).
  DAILY_COUNTERS?: DailyCounterNamespace;
  AI_PROBE_RATE_LIMIT?: RateLimiter;
  AI_RECOMMEND_RATE_LIMIT?: RateLimiter;
  OPENWEATHER_API_KEY?: string;
  WEATHERKIT_TEAM_ID?: string;
  WEATHERKIT_SERVICE_ID?: string;
  WEATHERKIT_KEY_ID?: string;
  WEATHERKIT_PRIVATE_KEY?: string;
  WEATHER_RATE_LIMIT?: RateLimiter;
  PLACE_SEARCH_RATE_LIMIT?: RateLimiter;
  // Account deletion: three plain variables, three secrets and one limiter. Missing any one
  // takes the route offline (see `buildAccountDeleteHandler`).
  SUPABASE_URL?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
  APPLE_TEAM_ID?: string;
  SUPABASE_SECRET_KEY?: string;
  APPLE_SIGN_IN_PRIVATE_KEY?: string;
  APPLE_SIGN_IN_KEY_ID?: string;
  ACCOUNT_DELETE_RATE_LIMIT?: RateLimiter;
  FEEDBACK_DB?: FeedbackDatabase;
  FEEDBACK_RATE_LIMIT?: RateLimiter;
  // Analytics Engine dataset of closed event counters (docs/architecture.md, "Usage counters").
  // Absent in tests, `wrangler dev` and the e2e environment, where counting is a no-op.
  USAGE_EVENTS?: AnalyticsEngineDataset;
}>;

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
const accountUnavailable = accountDeleteV1ErrorSchema.parse({ error: { code: 'unavailable' } });
const feedbackUnavailable = feedbackV1ErrorSchema.parse({ error: { code: 'unavailable' } });

export function createAiProviders(env: Env): AiProvider[] {
  const providers: AiProvider[] = [];
  const workersAiModels = Array.isArray(env.WORKERS_AI_MODELS)
    ? env.WORKERS_AI_MODELS
    : [];
  const openRouterModels = Array.isArray(env.OPENROUTER_MODELS)
    ? env.OPENROUTER_MODELS
    : [];
  const haikuConfiguredModels = Array.isArray(env.HAIKU_MODELS)
    ? env.HAIKU_MODELS
    : [];
  // The paid provider leads the walk and exists only behind its daily cap, so without the
  // counter binding it is left out rather than run uncounted.
  if (
    typeof env.HAIKU_API_KEY === 'string'
    && env.HAIKU_API_KEY.length > 0
    && env.DAILY_COUNTERS
  ) {
    const haikuCounterName = 'ai:haiku';
    for (const model of haikuConfiguredModels) {
      const priced = haikuModels.find((candidate) => candidate === model);
      if (!priced) {
        console.warn({ event: 'haiku_model_rejected' });
        continue;
      }
      providers.push(createDailyCappedAiProvider({
        provider: new HaikuAiProvider({ apiKey: env.HAIKU_API_KEY, model: priced }),
        counter: createDurableDailyCounter(env.DAILY_COUNTERS, haikuCounterName),
        counterName: haikuCounterName,
        dailyLimit: HAIKU_DAILY_ATTEMPT_LIMIT,
        admits: (request) => haikuPromptCharacters(request) <= haikuPromptCharacterLimit,
      }));
    }
  }
  if (env.AI) {
    for (const model of workersAiModels) {
      providers.push(new WorkersAiProvider({ ai: env.AI, model }));
    }
  }
  if (typeof env.OPENROUTER_API_KEY === 'string' && env.OPENROUTER_API_KEY.length > 0) {
    for (const model of openRouterModels) {
      if (typeof model !== 'string' || (
        model !== 'openrouter/free'
        && !/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+:free$/.test(model)
      )) {
        console.warn({ event: 'openrouter_model_rejected' });
        continue;
      }
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

/**
 * Account deletion needs its limiter and six settings. It never runs half-configured: the
 * first missing one, named in the log line, takes only this route offline with 503
 * `unavailable`, and nothing is called upstream. The project address must be https because
 * the token issuer and every admin call are built from it.
 */
function buildAccountDeleteHandler(env: Env, verifier: SupabaseTokenVerifier | undefined): Handler {
  const {
    ACCOUNT_DELETE_RATE_LIMIT: rateLimiter,
    APPLE_TEAM_ID: teamId,
    SUPABASE_PUBLISHABLE_KEY: publishableKey,
    SUPABASE_SECRET_KEY: secretKey,
    APPLE_SIGN_IN_PRIVATE_KEY: privateKeyPem,
    APPLE_SIGN_IN_KEY_ID: keyId,
  } = env;
  const offline = (binding: string) => offlineRoute(accountDeleteV1Path, binding, accountUnavailable);
  if (!rateLimiter) return offline('ACCOUNT_DELETE_RATE_LIMIT');
  const supabaseUrl = supabaseBaseUrl(env.SUPABASE_URL);
  if (!supabaseUrl || !verifier) return offline('SUPABASE_URL');
  if (!teamId) return offline('APPLE_TEAM_ID');
  if (!publishableKey) return offline('SUPABASE_PUBLISHABLE_KEY');
  if (!secretKey) return offline('SUPABASE_SECRET_KEY');
  if (!privateKeyPem) return offline('APPLE_SIGN_IN_PRIVATE_KEY');
  if (!keyId) return offline('APPLE_SIGN_IN_KEY_ID');
  return createAccountDeleteHandler({
    verifier,
    admin: createSupabaseAdmin({ supabaseUrl, publishableKey, secretKey, timeoutMs: accountUpstreamTimeoutMs }),
    revoker: createAppleTokenRevoker({
      teamId, keyId, privateKeyPem, now: () => new Date(), timeoutMs: accountUpstreamTimeoutMs,
    }),
    rateLimiter,
  });
}

/**
 * One token verifier, and so one cached key set, for the deletion route and the member AI
 * allowance. Undefined while the Supabase address is missing or not https.
 */
function buildSupabaseTokenVerifier(env: Env): SupabaseTokenVerifier | undefined {
  const supabaseUrl = supabaseBaseUrl(env.SUPABASE_URL);
  return supabaseUrl
    ? createSupabaseTokenVerifier({ supabaseUrl, now: () => new Date(), timeoutMs: accountUpstreamTimeoutMs })
    : undefined;
}

export function buildRouter(env: Env): Handler {
  const providers = createAiProviders(env);
  const verifier = buildSupabaseTokenVerifier(env);
  const usage = createUsageMetrics(env.USAGE_EVENTS);
  const weatherHandler = env.WEATHER_RATE_LIMIT
    ? createWeatherHandler({
      provider: createWeatherProviderChain({ providers: createWeatherProviders(env), usage }),
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
        usage,
        memberAllowance: verifier
          ? createMemberAllowance({ verifier, namespace: env.DAILY_COUNTERS })
          : undefined,
      });
  // One handler per version: each keeps its own result cache, and both count against the
  // one `probe` daily counter and the one burst limiter.
  const probeRoute = (path: string, create: typeof createProbeHandler): Handler =>
    !env.AI_PROBE_RATE_LIMIT
      ? offlineRoute(path, 'AI_PROBE_RATE_LIMIT', aiUnavailable)
      : !env.DAILY_COUNTERS
        ? offlineRoute(path, 'DAILY_COUNTERS', aiUnavailable)
        : create({
          providers,
          rateLimiter: env.AI_PROBE_RATE_LIMIT,
          dailyCounter: createDurableDailyCounter(env.DAILY_COUNTERS, 'probe'),
        });
  const probeHandler = probeRoute(aiProbeV1Path, createProbeHandler);
  const probeV2Handler = probeRoute(aiProbeV2Path, createProbeV2Handler);
  return createRouter({
    weatherHandler,
    placeSearchHandler,
    accountDeleteHandler: buildAccountDeleteHandler(env, verifier),
    feedbackHandler: env.FEEDBACK_DB && env.FEEDBACK_RATE_LIMIT
      ? createFeedbackHandler({ database: env.FEEDBACK_DB, rateLimiter: env.FEEDBACK_RATE_LIMIT })
      : offlineRoute(feedbackV1Path,
        !env.FEEDBACK_DB ? 'FEEDBACK_DB' : 'FEEDBACK_RATE_LIMIT', feedbackUnavailable),
    aiHandler,
    probeHandler,
    probeV2Handler,
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
export function compositionKey(env: Env): string {
  // Every variable and secret by value and every binding by presence, so a setting added to
  // `Env` later cannot be left out of the key.
  return JSON.stringify(
    Object.keys(env)
      .sort()
      .map((name) => {
        const value: unknown = env[name as keyof Env];
        return [name, typeof value === 'string' || Array.isArray(value) ? value : Boolean(value)];
      }),
  );
}

let composed: { key: string; router: Handler } | undefined;

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const key = compositionKey(env);
    if (composed?.key !== key) composed = { key, router: buildRouter(env) };
    return composed.router(request, ctx);
  },
  // The Cron Trigger of wrangler.jsonc, four times a day: the Supabase keep-alive request
  // (ADR 0041, section 11). It needs no router, only the two settings it reads.
  async scheduled(_controller: unknown, env: Env): Promise<void> {
    await runSupabaseKeepAlive({ supabaseUrl: supabaseBaseUrl(env.SUPABASE_URL), secretKey: env.SUPABASE_SECRET_KEY });
  },
};
