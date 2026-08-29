# ADR 0002: Real weather provider chain

Status: Accepted (2026-08-29)

## Context

Milestone 5 replaces the deterministic sample weather source with real
Apple-independent providers. Before this change the Worker served
`POST /v1/weather` from `DeterministicMockWeatherProvider` alone, and
`docs/product-decisions.md` recorded the approved chain as "not implemented".

The approved target chain is Open-Meteo primary, OpenWeather fallback, then the
last valid device-local snapshot. WeatherKit is inserted at the head of the same
chain once Apple Developer Program membership is available; that is milestone 6
and remains paused by the temporary constraint in `AGENTS.md`.

The mobile weather domain, the exact 30-minute freshness boundary, and
last-known-good behavior were required to stay unchanged. They did.

## Pricing and limits basis (recalculated 2026-08-29, do not freeze)

Recalculated from official sources on 2026-08-29. Provider terms change;
re-derive rather than trusting these numbers later.

**Open-Meteo** (`https://open-meteo.com/en/terms`, `/en/pricing`, `/en/licence`)

- Free tier: 600 calls/minute, 5,000/hour, 10,000/day. No API key, no billing
  path, so there is no overage mechanism to control.
- Calls are weighted: a request covering more than 10 weather variables, or more
  than two weeks for one location, counts as more than one call. Our request
  asks for 14 variables across `current`, `hourly` and `daily`, so it bills at
  roughly 1.4 calls. Still far inside the daily ceiling at expected volume.
- Free tier is **non-commercial use only**. Kuyara is free, ad-free, has no
  subscription and no in-app purchase, and is open source, which fits the terms'
  non-commercial examples. Recorded here as a deliberate reading, not a
  certification. Re-check if the product ever monetizes.
- Data is CC BY 4.0 and requires the visible attribution "Weather data by
  Open-Meteo.com" linked to `https://open-meteo.com/`.
- No SLA. The terms state uninterrupted provision is not guaranteed.

**OpenWeather One Call 3.0** (`https://openweathermap.org/faq`, `/full-price`,
`https://docs.openweather.co.uk/api/one-call-3`)

- 1,000 calls/day included free under the "One Call by Call" model. The
  account-wide per-minute ceiling on the free tier is 60 calls/minute.
- **Overage is the default behavior, not a hard stop.** Subscribing sets a
  default cap of 2,000 calls/day. Calls between 1,001 and 2,000 are permitted
  and billed at the end of the month. A 429 is returned only once the configured
  "Calls per day" cap is passed.
- Therefore a true zero-billing hard stop requires manually lowering "Calls per
  day" in the Billing plans tab to **1,000 or less**, so no numeric room exists
  between the free allowance and the cap. See the operational requirement below.
- Data is ODbL and requires visible attribution to OpenWeather. Share-alike
  applies only to redistributing a derived dataset, which Kuyara does not do.
- 429 covers both the per-minute rate limit and daily cap exhaustion; the API
  does not distinguish them. No `Retry-After` header is documented.

## Decision

### 1. Providers and endpoints

Open-Meteo is primary via `GET https://api.open-meteo.com/v1/forecast`, keyless,
requested with `wind_speed_unit=ms`, `timezone=UTC` and `forecast_days=2`.

OpenWeather is the fallback via
`GET https://api.openweathermap.org/data/3.0/onecall` with `units=metric` and
`exclude=minutely,alerts`.

**One Call 3.0 was chosen over both alternatives.** The classic Current Weather
2.5 free plan cannot fill the contract: it has no UV index and no hourly series,
and filling `uvIndex` with a fabricated value is not acceptable. One Call 4.0,
launched around June 2026, splits the same data across separate paginated
endpoints (`/current`, `/timeline/1h`, `/timeline/1day`) with no `exclude`
parameter, costing several requests and materially more code for no benefit.
One Call 3.0 is not deprecated and has no announced sunset.

### 2. Provider requests ask for UTC, local-day bucketing happens in the mapper

Both adapters request UTC timestamps and then bucket to the requested local day
using `weatherLocalDateKey`, exported from `packages/contracts/src/weather-v1.ts`.
That is the exact function `weatherV1DataSchema` uses to validate the invariant,
so producer and validator cannot drift. Both adapters echo the requested
`timeZone` string back verbatim; OpenWeather's own `timezone` field is ignored,
because the mobile mapper rejects a response whose time zone differs from the
one it asked for.

### 3. Adapter isolation

Each provider has an isolated adapter plus a separate raw-response module holding
its Zod schema and its mapping to the provider-neutral `ProviderWeatherSnapshot`.
Duplication between the two adapters is intended, so one provider's quirks cannot
leak into the other. Condition mapping is an explicit, exhaustive table per
provider; an unmapped weather code fails the response rather than defaulting to a
condition. Fabricating weather is worse than failing over.

`zod` was added as a direct dependency of `@kuyara/worker`. It was already
present in the workspace at the same pinned version and already reached the
Worker bundle transitively through `@kuyara/contracts`, so this declares existing
use rather than adding anything to the bundle or the supply chain.

### 4. Fallback eligibility and attempt bound

`apps/worker/src/weather/weather-provider-error.ts` defines seven failure kinds:
`availability`, `timeout`, `quota`, `auth`, `upstream`, `invalid_response`,
`invalid_request`. `isFallbackEligible` advances the chain for every kind except
`invalid_request`, because a request the first provider rejects as malformed will
be rejected by the second too.

The chain never advances on a successful response. Valid but undesirable weather,
or weather that differs between providers, is never a reason to fall back.

Attempts are bounded by `providers.slice(0, maxAttempts)` with `maxAttempts = 2`,
which makes a retry or fallback loop structurally impossible. There is no retry
within a provider.

Per-attempt timeout is **4,000 ms**, derived rather than guessed: the mobile
client aborts the whole request at 10,000 ms
(`requestTimeoutMilliseconds` in `worker-weather-provider.ts`), so two attempts
plus Worker overhead must fit inside that budget.

### 5. Rate limiting on `POST /v1/weather`

A Cloudflare rate-limit binding `WEATHER_RATE_LIMIT` (namespace 1003) allows
**20 requests per 60 seconds per IP**, keyed `weather:${cf-connecting-ip}`.
Exceeding it returns 429 with `{ "error": { "code": "rate_limited" } }` and
`Retry-After: 60`. When the binding is absent, in local dev and unit tests, the
Worker degrades to the existing permissive limiter.

The endpoint has no authentication, so without this a single client could pass
Open-Meteo's 600/minute ceiling. That would not cost money, but it would breach
the terms and risk the Worker's egress being blocked, which degrades service for
every user. A daily counter like the AI probe's was deliberately not added:
weather calls spend no money, so that machinery is not justified.

20/60s sits far above real usage (the app refreshes a location at most every
30 minutes, plus manual refreshes) and far below the upstream ceiling.

### 6. Worker-side daily cap on OpenWeather, and its honest limits

`createDailyCappedWeatherProvider` refuses to call OpenWeather once
**500 calls** are recorded for the current UTC day, deliberately half the free
1,000/day allowance. The counter reuses the existing `PROBE_COUNTER` KV binding
under `weather:openweather:YYYY-MM-DD` keys. The count is incremented **before**
the upstream call, because upstream quota is consumed by the attempt itself; a
persistently failing provider must still spend budget.

**This cap is defense in depth, not a guarantee.** Cloudflare KV read-then-write
is not atomic, and a counter failure deliberately fails open so a KV outage
cannot take weather down. Concurrent requests or an unavailable KV can therefore
exceed 500. The authoritative protection against billing is the provider-side
cap in the operational requirement below, not this counter.

### 7. Operational requirement before OpenWeather is enabled

`OPENWEATHER_API_KEY` is a Cloudflare Worker secret. The OpenWeather fallback is
absent from the chain entirely until that secret exists.

Before the secret is set, the OpenWeather account's Billing plans tab must have
**"Calls per day" lowered to 1,000 or less**. The 2,000 default permits billed
overage and would violate the repository rule against uncontrolled
pay-as-you-go usage.

**Satisfied on 2026-08-29.** The account's "Calls per day" was lowered to 1,000,
so no billable range exists above the free allowance, and only then was the key
set: as a Worker secret on `kuyara-worker` (the Worker's single environment, see
[ADR 0003](0003-single-worker-environment.md)) and in the git-ignored
`apps/worker/.dev.vars` for local `wrangler dev`. The fallback is therefore now
part of the chain.

### 8. Contract and attribution

`packages/contracts/src/weather-v1.ts` gained exactly two things: a required
`origin.sourceId` (`sample | open-meteo | openweather`) with a cross-field
invariant that `sourceId === 'sample'` if and only if `kind === 'sample'`, and a
`rate_limited` error code.

Attribution crosses the API as this controlled, non-secret identifier only. The
mobile app maps it to localized attribution text and a link, so no user-visible
string and no provider-authored text crosses the boundary. Raw provider data,
credentials and internal errors do not cross. An unrecognized or legacy
`sourceId` renders no attribution rather than failing.

`uvIndex` and `precipitationProbability` stayed required and non-nullable. The
alternative, relaxing them, is recorded below.

### 9. The sample provider is no longer reachable in production

`DeterministicMockWeatherProvider` was removed from the Worker's production
composition and is now used only by tests, making the existing rule that it is
never a production fallback true in code rather than by convention.

## Consequences

- The app now serves real live weather. `origin.kind` is `live` in production.
- Open-Meteo has no SLA and no key. If it fails and no OpenWeather secret is
  configured, the chain has nothing to fall back to and the mobile app shows its
  last-known-good snapshot, which is the designed behavior.
- The Worker takes a hard dependency on `weatherLocalDateKey` staying aligned
  with the schema invariant. They are the same function, so drift requires
  deliberately changing one.
- Both paths are verified live as of 2026-08-29, through `wrangler dev` against
  the real APIs. Open-Meteo served a request that satisfied
  `weatherV1SuccessSchema` when re-validated outside the Worker. Open-Meteo was
  then pointed at an unreachable host, and the same request came back with
  `origin.sourceId === "openweather"` and passed the same validation, so the
  fallback is demonstrated end to end rather than only simulated in unit tests.
- The two providers legitimately return different hourly counts for the same
  local day: Open-Meteo is asked for `forecast_days=2` and yields the whole day
  including elapsed hours (21 entries in the live check), while One Call 3.0
  returns a forward-only 48-hour series, so only the remaining hours of the local
  day survive bucketing (3 entries in the same check). Both satisfy the
  contract's `min(1).max(25)`, and OpenWeather's first hourly entry is the
  current hour, so a late-evening request cannot bucket to zero entries.

## Alternatives considered

**OpenWeather Current Weather 2.5 free plan with a nullable `uvIndex`.** Cheaper
in provider terms, no card required. Rejected because 2.5 has no UV index, so the
contract's `uvIndex` would have to become nullable, which propagates into the
mobile domain type, the SQLite schema as a migration, repository validation and
the Today screen. That is a permanent schema migration through the frozen weather
domain in exchange for a rarely-exercised fallback.

**OpenWeather One Call 4.0.** Newer, but modular and paginated, requiring several
requests to assemble what 3.0 returns in one, with no offsetting benefit here.

**Dropping the fallback and shipping Open-Meteo alone.** The simplest option, and
the mobile last-known-good behavior already covers brief outages. Rejected
because the two-provider chain is a recorded approved decision; changing it would
need its own ADR rather than a silent narrowing.

**A daily quota counter for the weather endpoint like the AI probe's.** Rejected;
weather calls spend no money, so a per-IP burst limiter is proportionate.

## Out of scope

- WeatherKit. Milestone 6, still paused by the Apple Developer constraint.
- Any long-term weather archive.
- Deploying the Worker. The OpenWeather secret itself is no longer out of scope;
  it was enabled on 2026-08-29 under decision 7.
