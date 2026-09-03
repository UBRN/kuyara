# ADR 0014: WeatherKit at the head of the weather provider chain

Status: Accepted (2026-09-03)

Implementation: adapter, signer, chain wiring and tests are complete. No live
WeatherKit call has been made; that step is blocked on Apple credentials the
maintainer must create. See [Operational requirement](#8-operational-requirement-before-weatherkit-is-enabled).

## Context

[ADR 0002](0002-real-weather-provider-chain.md) built the real provider chain and
left WeatherKit as a separate milestone, to be "inserted at the head of the same
chain without changing mobile". Apple Developer Program membership became active
on 2026-08-29, so the milestone is startable.

Nothing about the provider abstraction needed to change. The `WeatherProvider`
interface, the provider-neutral `ProviderWeatherSnapshot`, the seven failure
kinds and their fallback eligibility, the bounded-attempt chain, the sanitized
error shapes, the daily-cap wrapper and the per-IP rate limiter all already
existed and are reused as they are.

## Pricing and limits basis (recalculated 2026-09-03, do not freeze)

Recalculated from `https://developer.apple.com/weatherkit/` on 2026-09-03.
Apple's terms change; re-derive rather than trusting these numbers later.

- **500,000 API calls per month** are included with the Apple Developer Program
  membership ($99/year, already paid). Each weather request counts as one call
  regardless of how many data sets it asks for.
- Additional quota is a **separate paid subscription** that the Account Holder
  must start explicitly in the Apple Developer app, from $49.99/month for 1M
  calls up to $9,999.99/month for 200M. Unused calls do not roll over, and
  upgrading resets the quota and starts a new billing period.
- There is therefore **no automatic overage and no pay-as-you-go path**. Apple
  never bills for calls beyond the included allowance; more quota requires a
  deliberate human subscription. This satisfies the repository rule against
  uncontrolled overage structurally, not merely by configuration.
- **Not documented by Apple, recorded as a gap:** the REST API reference lists
  only 200, 400 and 401 for the weather endpoint. Apple does not state which
  status is returned once the monthly allowance is exhausted. The adapter maps
  429 to `quota` and any other unexpected status to `upstream`; both are
  fallback-eligible, so either way the chain advances to Open-Meteo.

## Decision

### 1. Endpoint and request

`GET https://weatherkit.apple.com/api/v1/weather/en/{latitude}/{longitude}` with
`timezone=<requested IANA zone>` and
`dataSets=currentWeather,forecastHourly,forecastDaily`.

`timezone` is a required parameter and controls only how Apple rolls hourly data
into daily buckets; the timestamps themselves are absolute. Passing the requested
zone therefore makes `forecastDaily` a real local day rather than a UTC one,
without weakening ADR 0002 §2's rule. That rule exists because Open-Meteo and
OpenWeather can return provider-local time strings; the mapper still buckets
hourly entries itself with `weatherLocalDateKey` and still echoes
`location.timeZone` back verbatim rather than reading any zone out of the
response.

`forecastNextHour` and `weatherAlerts` are not requested. Alerts carry their own
display obligations Apple spells out separately, and the MVP's local alerts are
milestone N2's deterministic on-device rules, not provider alerts.

### 2. JWT signing lives in the Worker, in WebCrypto

WeatherKit authenticates every request with a bearer JWT signed ES256. Workers
have no Node `crypto`, so `apps/worker/src/weather/weatherkit-token.ts` signs
with `crypto.subtle`: the header is `{ alg: 'ES256', kid: <Key ID>, id:
'<Team ID>.<Service ID>', typ: 'JWT' }` and the payload is `{ iss: <Team ID>,
sub: <Service ID>, iat, exp }`. WebCrypto's ECDSA output is already the raw
r‖s form JWS wants, so no DER conversion exists to get wrong.

Four Cloudflare Worker secrets: `WEATHERKIT_TEAM_ID`, `WEATHERKIT_SERVICE_ID`,
`WEATHERKIT_KEY_ID`, `WEATHERKIT_PRIVATE_KEY`. The last is the literal contents
of Apple's `.p8` file; the signer strips the PEM armour and imports the PKCS#8
bytes. The key never reaches the repository, `EXPO_PUBLIC_*`, the mobile bundle,
or any log, and any import or signing failure throws a bare
`WeatherProviderError('auth')` carrying no part of the key and no upstream text.

Tokens live **one hour** and are cached in the signer's closure, re-signed when
fewer than five minutes remain. The cache is per-isolate, which is deliberate:
signing is local, free and sub-millisecond, so a shared KV cache would add a
paid read to every request to save work that costs nothing. A long-lived
manually-minted token was rejected for the opposite reason: it removes the
signer but leaves a credential that stays valid for months if it leaks and that
silently turns the head provider into a 401 when it expires.

### 3. Condition mapping, including four codes our enum cannot express

Apple types `conditionCode` as a plain string in the REST reference and
documents its values only in the Swift `WeatherKit.WeatherCondition` enum, which
has 34 cases. The adapter maps all 34 explicitly and rejects anything else as
`invalid_response`, matching ADR 0002 §3.

Four of them, `breezy`, `windy`, `hot` and `frigid`, describe wind or temperature
and carry no sky or precipitation information at all. The contract's eleven
condition codes have no member for them. They map to `clear`. This is a
deliberate reading, recorded so it can be reversed: it is the least-wrong cell in
a table with no right answer, and the alternative, treating a routine WeatherKit
condition as an invalid response, would silently demote the head provider to
Open-Meteo on ordinary windy days. Temperature and wind speed reach the
recommendation engine as their own fields, so nothing is lost except sky cover,
which Apple did not report in these cases either.

`currentWeather` has no precipitation chance, only `precipitationIntensity`. The
current probability is therefore taken from the hourly entry nearest to `asOf`,
exactly as the Open-Meteo adapter already does. Wind speed is Apple's only unit
conversion: kilometres per hour divided by 3.6.

### 4. Chain position, attempt bound, and the re-derived timeout

The chain becomes WeatherKit, Open-Meteo, OpenWeather. WeatherKit is prepended
only when all four secrets are present and non-empty, exactly as OpenWeather is
gated on its key today; without them the chain is unchanged.

`weatherMaxAttempts` moves from **2 to 3** and `weatherAttemptTimeoutMs` from
**4,000 ms to 3,000 ms**. Leaving the bound at 2 would have made a configured
OpenWeather fallback structurally unreachable, which is worse than a narrower
per-attempt budget. The timeout is re-derived from the same constraint ADR 0002
§4 used: the mobile client aborts the whole request at 10,000 ms
(`requestTimeoutMilliseconds` in `worker-weather-provider.ts`), so three attempts
plus Worker overhead must fit inside it. 3 × 3,000 = 9,000 ms leaves 1,000 ms of
headroom, against 8,000 ms before. There is still no retry within a provider, and
`providers.slice(0, maxAttempts)` still makes a fallback loop structurally
impossible.

This is the one respect in which the existing two providers' behaviour changes:
each now has 3,000 ms rather than 4,000 ms per attempt.

Fallback eligibility is untouched. WeatherKit advances the chain for the same six
kinds as everything else and never for `invalid_request`, and never because the
weather it returned is undesirable or differs from another provider's.

### 5. Quota control reuses the existing daily cap

`createDailyCappedWeatherProvider` wraps WeatherKit with a **8,000 call per UTC
day** limit under `weather:weatherkit:YYYY-MM-DD` in the existing
`PROBE_COUNTER` KV binding. The figure is derived, not chosen: 500,000 per month
over a 31-day month is roughly 16,129 per day, and the cap is half of that,
matching the convention ADR 0002 §6 set for OpenWeather.

The same honest limits apply as there. KV read-then-write is not atomic and a
counter failure fails open, so the cap is defense in depth rather than a
guarantee. Unlike OpenWeather, there is nothing behind it to protect against,
because Apple has no overage billing at all; the cap exists to satisfy the
repository's explicit-limit rule and to keep a runaway client from consuming a
month of allowance in a day. When it trips, the `quota` error is
fallback-eligible and the chain drops to Open-Meteo.

A new month-keyed counter matching Apple's actual billing period was rejected:
it would put a second counter beside an existing one to express a limit the
derived daily figure already respects.

### 6. Attribution, and the conflict this milestone contained

The milestone as written says WeatherKit goes in "without changing the mobile
weather domain". Apple's terms say that any app displaying its weather data
"must clearly display the Apple Weather trademark (Weather), as well as the legal
link to other data sources". Those two cannot both be satisfied literally, and
under ADR 0002 §8 an unrecognized `sourceId` renders no attribution at all, so
shipping without touching mobile would have shipped a silent violation.

Resolved in favour of the narrow reading of "the mobile weather domain":

- `packages/contracts/src/weather-v1.ts` gains `'weatherkit'` in
  `weatherSourceIds`. That is the whole contract change; the cross-field
  invariant tying `sourceId === 'sample'` to `kind === 'sample'` is unaffected.
- The Weather screen gains one attribution entry, labelled "Weather data by
  Apple Weather" from a localization key in both languages, linking to
  `https://developer.apple.com/weatherkit/data-source-attribution/`.

The weather domain model, the 30-minute freshness boundary, last-known-good
behaviour, the SQLite schema and every mapper are untouched. This is exactly the
mechanism ADR 0002 §8 built for: a controlled, non-secret identifier crosses the
API and the client owns all user-visible text. No provider-authored string, no
raw data and no credential crosses the boundary.

The REST API also exposes `GET /api/v1/attribution/{language}`, returning light,
dark and square Apple Weather logo assets at 1x/2x/3x as partial URLs to be
appended to `https://weatherkit.apple.com`. Bundling that logo is the stronger
form of the trademark display and is recorded as the upgrade path, deliberately
not taken here: it is an extra request, three new image assets per appearance and
a contrast check in both themes, for a requirement the text form already meets.

### 7. What the adapter does not do

No weather alerts, so none of Apple's alert-specific obligations (embedded link
to the alert details page, naming the issuing agency, not altering alert text)
apply. No derived or value-added weather product, so the "modified data" notice
does not apply either. No archive of any kind.

### 8. Operational requirement before WeatherKit is enabled

WeatherKit cannot be reached until the maintainer creates, in the Apple Developer
portal, a WeatherKit-enabled Service ID and a WeatherKit private key, and sets
the four secrets. Until then the four-secret gate keeps the chain exactly as it
is today, and every code path in this ADR is exercised by unit tests against
recorded responses rather than by a live call.

**Not satisfied as of 2026-09-03.** No live WeatherKit request has been made and
no claim in this ADR about Apple's runtime behaviour, as opposed to its
documentation, has been verified against the real service.

## Consequences

- With the secrets set, Apple becomes the primary source and `origin.sourceId`
  reads `weatherkit`; without them nothing changes.
- Every provider now has 3,000 ms rather than 4,000 ms per attempt.
- The Weather screen shows Apple attribution whenever Apple served the data, and
  still shows nothing for an unrecognized source.
- Apple's documentation gaps are carried as risk rather than as assumption: the
  quota-exhausted status code, whether `conditionCode`'s string values are
  literally the Swift enum's 34 cases, and the exact `date-time` serialization
  are all unconfirmed by Apple's own pages. Each failure mode lands on a
  fallback-eligible error, so the worst case is a demotion to Open-Meteo rather
  than a broken response.
- `PrecipitationType` and `pressureTrend` are not consumed, so Apple's known
  documentation defect in the `PrecipitationType` term list does not reach us.

## Alternatives considered

**Keeping `maxAttempts` at 2.** No change to the existing providers' timeout, but
a configured OpenWeather fallback would never be reached. Rejected: silently
disabling a configured provider is worse than a 1,000 ms narrower attempt budget.

**Signing tokens outside the Worker and storing a long-lived JWT as a secret.**
Removes the signer entirely. Rejected in §2.

**Caching the token in KV.** Rejected in §2.

**Replacing Open-Meteo and OpenWeather with WeatherKit alone.** Rejected: ADR
0002's chain is a recorded decision, Apple has no SLA for us either, and a
single-provider chain removes the fallback the last two milestones built.

**Failing over on `breezy`/`windy`/`hot`/`frigid`.** Literal compliance with the
"never fabricate a condition" rule. Rejected in §3.

## Out of scope

- Any live verification, which requires credentials the maintainer must create.
- Weather alerts, `forecastNextHour`, and milestone N2.
- The bundled Apple Weather logo asset and the `/api/v1/attribution` endpoint.
- Any change to the mobile weather domain model, schema, or freshness rules.
