# kuyara product decisions

This file records the product decisions in force today. Rationale, alternatives and
dated history live in the ADR each section cites; implementation state lives in
[`current-status.md`](current-status.md).

## Confirmed MVP decisions

- kuyara is a publicly developed, source-available weather and outfit recommendation app for iOS and Android. It is licensed under the PolyForm Noncommercial License 1.0.0 and is deliberately not described as open source; see [Approved licensing posture](#approved-licensing-posture) and [ADR 0024](adr/0024-relicensing-to-polyform-noncommercial.md).
- The first release is optimized for iOS while shared code remains Android-compatible.
- Turkish and English are supported from the beginning. The device language and system theme are the defaults, with language and theme overrides available in Settings.
- The first release has no account and no cross-device sync. Notifications are limited to on-device local weather alerts with no server-sent push; see [Approved notifications scope](#approved-notifications-scope), [ADR 0004](adr/0004-notifications-in-the-mvp.md) and [ADR 0032](adr/0032-local-weather-alert-rules.md).
- Behavioural product analytics is part of the production direction, with PostHog as the provider and the first public release as its deadline (revoking the earlier "no analytics in the MVP" rule on 2026-09-04). See [Approved analytics direction](#approved-analytics-direction), [ADR 0023](adr/0023-behavioural-product-analytics-with-posthog.md) and [ADR 0033](adr/0033-apple-privacy-obligations-for-first-party-analytics.md).
- kuyara is free and ad-free, with no subscription and no in-app purchase. Paid provider usage is maintainer-funded and bounded.
- Expo SQLite is the durable device-side database for user-created data and the store the app reads and writes first. kuyara is not fundamentally a local-first product: the accountless first release is a scope decision, and Supabase Auth, PostgreSQL and Storage are the intended long-term backend. See [Approved backend and account direction](#approved-backend-and-account-direction) and [ADR 0022](adr/0022-supabase-is-the-intended-backend-and-kuyara-is-not-local-first.md).
- Weather providers are accessed only through the Worker behind a provider-neutral contract. Weather constraints are deterministic; AI selects three of at most 24 deterministically precomposed catalog outfits filtered by clothing preference and must have a device-local catalog-only deterministic fallback.
- The Wardrobe (user-facing: the Closet) is a personal record of garments marked `owned` or `wanted`, not a recommendation input. Wardrobe photos are optional, remain on-device in the MVP, and are not sent to AI.
- The profile stores required `gender` (`woman`/`man`) and `dressStyle` (`casual`/`smart`/`formal`) plus an optional device-only `birthDate`. Gender selects the catalogue through one mapping. Dress style reorders formality and excludes nothing. Birth date drives no product logic, and neither it nor its year enters recommendation requests. See [ADR 0031](adr/0031-dress-style-is-the-formality-signal.md).

## Apple Developer Program

The membership is active. WeatherKit, EAS Build, iOS signing credentials and TestFlight are permitted; production release operations still need an explicit user request. The rule is canonical in [`AGENTS.md`](../AGENTS.md#release-operations).

## Current scaffold

The workspace layout is canonical in the [`README.md` Stack section](../README.md#stack).

## Approved primary navigation

Approved 2026-08-30; rationale in [ADR 0006](adr/0006-three-tab-information-architecture.md), the shell in [ADR 0027](adr/0027-the-app-shell-and-its-three-tabs.md).

- The main tabs are Today at `/`, Weather at `/weather`, and Profile at `/profile`, Bugün / Hava / Profil in Turkish; Expo Router route groups do not appear in user-visible URLs. The tab bar is Expo Router Native Tabs, accepting the documented alpha risk of the SDK 57 API ([ADR 0012](adr/0012-adopting-expo-router-native-tabs.md)).
- The root Stack keeps the device-local onboarding gate and `/onboarding` outside the tab navigator. An incomplete profile cannot enter the tab group; a completed profile opens Today by default.
- Each main tab owns a nested Stack. The Closet and wanted records live inside Profile rather than owning a tab or being pushed from Today. Settings opens from an icon in the Profile header and is not a tab.
- The English user-facing label for the garment collection is **Closet**; the Turkish is **Gardırop**. This is visible copy only: the internal domain name, tables, route segment, types, file names and test ids stay `wardrobe`, and renaming them for terminology alone is out of scope.
- Onboarding has five steps: welcome, required gender, required dress style, optional birth date, and optional location selection ([ADR 0016](adr/0016-location-in-onboarding-and-an-honest-empty-state.md)). Gender and dress style are prominent there because they select the catalogue and formality order; their Settings controls sit in the final, deliberately unprominent About you group ([ADR 0031](adr/0031-dress-style-is-the-formality-signal.md)).

## Today

- Today renders outfits from the persisted recommendation snapshot. The active weather snapshot and the gender-derived clothing preference derive clothing requirements; bundled catalog types filtered by that preference are the only evaluated candidates; the result records `ai-assisted` when the Worker AI route succeeded and `deterministic-fallback` otherwise.
- Today is visual-first ([ADR 0021](adr/0021-direction-e-a-visual-first-design-language.md)): the garment composition is its hero, an outfit's title is its archetype name ([ADR 0007](adr/0007-ai-selects-precomposed-outfits.md)), one short rationale sits beside it, and Today does not list the garment names. Outfits have no intent identity; the deterministic engine produces diversity, not intent.
- Explanations are language-independent codes localized at the presentation boundary and shown on the detail surface, never as generated prose.
- Today shows the rain chance on outfit detail and in the weather accessibility label, using the highest probability among current conditions and today's not-yet-ended hourly entries. The atmospheric tint follows the device clock rather than the weather fetch time.
- Today never reads ownership state and never waits for Wardrobe data; outfit detail alone may show `owned` or `wanted`.
- Today renders loading while weather is loading, and an unavailable state that names a missing active location and links to the location picker, distinct from genuine failures.
- Today has no account, sync or analytics call site of its own. It is the destination for notification-response deep links.

## Local profile, onboarding and Settings

- Expo SQLite is the durable source of truth for one device-local profile, created with one Expo Crypto UUID v4 that is never regenerated, shown or logged. Ordered migrations run at bootstrap before any route content is shown.
- Completing onboarding atomically stores gender, dress style, birth date and completion state. Language and appearance default to system and are untouched by onboarding.
- Settings persists language, appearance, gender, dress style and birth date immediately; successful changes update the visible UI without a reload. The About you group stays last and unprominent.

## Approved account copy boundary

Approved 2026-08-30. Documentation may state the present fact that the MVP has no account. User-facing copy must not promise that there will never be an account or that everything stays on the device, because accounts are planned.

## Wardrobe persistence and taxonomy

- Wardrobe items are profile-owned rows with a client-generated UUID, `localProfileId`, optional name and colour, one structural category (`top`, `bottom`, `one_piece`, `outerwear`, `footwear`, `accessory`), a required catalog garment type for every new entry, a canonical colour family, seven explicit property overrides, an optional app-private photo relative path, UTC lifecycle timestamps, nullable soft-deletion time and an `owned | wanted` entry state. Legacy rows with a null type remain readable, editable and deletable; migration never infers one.
- Active reads are profile-scoped and exclude soft-deleted rows. Deletion sets `deletedAt` rather than removing the row. Update and delete cannot act through another profile ID.
- SQLite stores only a normalized relative photo path, never a blob, absolute path, URI or traversal. Photos are resized and compressed into app-private storage and cleaned up only after the database write is confirmed.
- The bundled garment catalog defines the canonical types, structural categories, weather-relevant defaults, localization keys and deprecation metadata specified in [`clothing-taxonomy.md`](clothing-taxonomy.md); catalog version 3 defines 32 types ([ADR 0013](adr/0013-catalog-content-corrections-and-version-3.md)). Catalog defaults stay bundled code; a pure resolver applies an item's explicit override over the current default.
- Catalog applicability (`womens`/`mens`) filters recommendation candidates and new Wardrobe choices through the one gender mapping. It is not biological sex and never hides, invalidates or excludes an item already recorded. `blouse`, `skirt` and `dress` apply to `womens`; every other type applies to both.
- Colour and the property overrides complete the personal record only; nothing in the Wardrobe affects recommendations.

## Location and local weather

- Location is chosen through live city search (the Worker's place-search route over Open-Meteo Geocoding, with Open-Meteo and GeoNames attribution) or an explicit foreground-only device-location choice. No location prompt occurs at bootstrap, on opening Weather, or in onboarding without the user's explicit device-location action; onboarding remains completable with no location ([ADR 0016](adr/0016-location-in-onboarding-and-an-honest-empty-state.md)).
- Selecting device location first presents kuyara's localized rationale; only confirmation may request foreground permission. Approximate permission is usable; denied states keep manual selection available, with platform Settings offered only for the permanent case.
- Only normalized hundredth-degree coordinates, IANA time zone, source and approximate/full accuracy cross the native adapter or reach SQLite. Raw coordinates and permission diagnostics are neither logged nor persisted.
- One active location per profile; snapshot replacement is atomic and retention is bounded to the active location plus the newest previous one.
- A cached snapshot is fresh through exactly 30 minutes and stale after. Fresh cache renders without a fetch; stale cache renders immediately and refreshes in the background. Manual refresh is always available, and a failed refresh preserves and labels the last valid result. The application presents network failures as offline and every other failure as unavailable.
- Freshness is re-evaluated whenever Today or Weather regains focus, not only on launch, foreground, selection and refresh, and a stale result starts the same coalesced background refresh.
- A device location is re-acquired at most once per foreground event while it is the active location and permission is granted. A moved normalized coordinate key or time zone replaces the active location and refreshes; anything else keeps the cached snapshot, and a failed lookup stays silent because the user asked for nothing.
- Times the user reads as a clock follow the device: the "last updated" label is formatted in the device time zone and carries the locale's short date as well as the time once the snapshot is no longer from the device's current local day, and every hour label follows the device's 12/24-hour setting rather than the application language. The hourly rail, its day marker, and the local-day rules stay in the location's time zone.

## Worker weather contract

- `POST /v1/weather` accepts only normalized integer hundredth-degree coordinates and an IANA time zone. Profile IDs, location keys, permission data, accuracy labels and raw coordinates are not part of the API.
- Shared strict Zod schemas define the request, the provider-neutral success data with established condition codes and invariants, and minimal stable error codes. The response identifies data as `sample` or `live` plus a controlled `origin.sourceId` attribution identifier; raw provider structures stay internal.
- The Worker validates before provider access, maps through an explicit API mapper, and sanitizes every failure. Responses expose no provider details, stacks, secrets or configuration.
- Mobile validates every Worker body with the shared contracts before use. Local development defaults to the loopback or emulator host; preview and production EAS profiles provide the deployed HTTPS origin.

## Deterministic requirements, eligibility and composition

- A pure provider-independent function converts one validated `WeatherSnapshot` into immutable, stably ordered clothing-property requirements. Current and remaining-hour measurements take precedence over past daily extremes, explicit conditions override weaker probability guidance, and clothing preference never weakens protection. The boundaries are coarse everyday-guidance heuristics, not comfort ratings, safety rules or severe-weather alerts; their exact values live in `apps/mobile/src/features/recommendation/domain/weather-to-clothing-requirements.ts` and its tests.
- Garment eligibility is composition-aware: thermal, breathability and coverage shortfalls keep their reason codes and score contribution but do not reject one garment. Hard rejection is limited to mandatory body water or wind protection on outerwear and mandatory feet water protection or traction on footwear. Scoring is bounded and deterministic, over-protection is penalized, ties are stably ordered, and scores compare only within compatible slot groups. Exact weights live in `garment-eligibility.ts` and its tests.
- An outfit uses either primary top plus bottom or one `one_piece`, always includes footwear, and may add at most one mid layer and one outer layer. Body thermal is summed; footwear warmth is separate evidence; breathability uses the least-breathable body garment. A mandatory waterproof or wind-resistant outer layer may resolve, never erase, a breathability conflict, recorded as `breathability_protection_tradeoff` with a penalty. Failures carry stable codes and evidence. Accessories never enter an outfit.

## Approved catalog-only recommendation and Wardrobe model

Approved 2026-08-30; rationale in [ADR 0005](adr/0005-catalog-only-recommendation-candidates.md), whose section 4 is amended by [ADR 0007](adr/0007-ai-selects-precomposed-outfits.md).

- The AI option set is at most 24 outfits composed deterministically from the bundled catalog filtered by clothing preference. The Wardrobe is never a candidate source. AI may select only supplied option identifiers and must never invent outfits, catalog entries, wardrobe items, slots, properties or identifiers.
- Each Wardrobe entry is `owned` or `wanted`, stored locale-independently; there is no separate wishlist table, screen or tab, and neither state affects recommendations in the MVP.
- Ownership state appears only on outfit detail, never on Today.
- Both AI and the device-local deterministic three-outfit fallback compose from the catalog only.
- A local day variant, the local day of year modulo 7, is the deterministic composition seed. A separate persisted local date key detects every new calendar day, including New Year's Day.

## Approved product model and API budget

Approved 2026-08-13. The Worker enforces its checked-in request limits; provider-account spending controls remain an external operating requirement.

- kuyara remains free, ad-free, subscription-free, and without in-app purchase.
- The maintainer may personally fund a small, controlled API budget. Paid API usage must have explicit hard or safely derived limits. Automatic top-up and uncontrolled pay-as-you-go overage are not allowed.
- Prices, quotas, licences, and provider conditions are time-sensitive. Reverify them against official sources before implementation rather than trusting any figure recorded here.

## Approved weather provider strategy

Approved 2026-08-13; rationale, the dated pricing basis and limits in [ADR 0002](adr/0002-real-weather-provider-chain.md) and [ADR 0014](adr/0014-weatherkit-at-the-head-of-the-provider-chain.md).

- The chain is WeatherKit primary, Open-Meteo fallback, OpenWeather fallback, then the last valid device-local weather snapshot. WeatherKit was inserted at the head of the established chain rather than replacing it and is present only when its four Apple credentials are configured.
- Each upstream provider has an isolated adapter with raw-response runtime validation, explicit unit and condition mapping, timeout handling, and sanitized errors. Provider payloads and secrets do not cross into mobile and are not logged.
- Fallback eligibility follows the [repository rule in `AGENTS.md`](../AGENTS.md#weather-and-recommendation-behavior). Attempts per request are bounded at three with a 3,000 ms per-attempt timeout so the chain fits inside the mobile client's 10,000 ms abort; loops are prevented.
- Open-Meteo, OpenWeather and Apple WeatherKit attribution requirements are all supported. Apple's trademark and data-source link are met by the `weatherkit` value of `origin.sourceId` and one localized attribution row on the Weather screen; the "provider names never cross the API" rule is narrowed only as far as a controlled, non-secret attribution identifier requires.
- OpenWeather usage is bounded by provider-side limits plus a Kuyara-side daily cap; WeatherKit's included monthly allowance has no automatic overage and a derived Kuyara-side daily cap applies. The numbers live in the two ADRs' pricing sections, not here.
- Open-Meteo's free tier is non-commercial use only. kuyara's free, ad-free, noncommercially licensed nature is recorded as a deliberate reading that fits those terms, not a certification; re-check if the product ever monetizes.

## Approved AI recommendation strategy

Approved 2026-08-13 and restated 2026-08-30; rationale in [ADR 0007](adr/0007-ai-selects-precomposed-outfits.md) and [ADR 0001](adr/0001-worker-ai-probe-and-rate-limiting.md).

- AI returns exactly three outfit selections from the supplied precomposed options and labels each with one archetype identifier from a closed twelve-entry list. The shared response validation rejects duplicate option or archetype identifiers on both Worker and mobile. It never invents catalog entries, wardrobe items, slots, properties or identifiers.
- AI is central but is not personalization. It turns already valid outfits into three that are meaningfully different from each other and do not repeat the previous day. Layering, formality consistency and mandatory weather requirements are enforced before the request; colour harmony is out of scope because the catalog describes types, which have no colour.
- AI receives deterministic weather requirements, precomposed option identifiers and their garment properties, clothing preference, dress style, catalog version and a local day variant, nothing else; see the privacy boundary below.
- Every AI response passes shared Zod validation and deterministic domain invariants before it is displayed or persisted. Invalid or partially invalid output is never silently repaired.
- AI failure never prevents a recommendation: the final fallback is a device-local deterministic three-outfit generator over the same catalog-only options, and that fallback is a prerequisite for shipping AI.
- The provider chain is a Cloudflare Workers AI binding first, then OpenRouter, then the device-local fallback. The order was set on 2026-08-19 because no evaluated free OpenRouter model returned contract-valid output while the Workers AI model did; OpenRouter stays behind it so a re-evaluation can promote it through configuration. Model choice is configuration-driven.
- AI output is structured data, not user-visible prose; all copy comes from localization keys. Provider names, internal errors, prompts, model reasoning and configuration must not be exposed in the mobile contract.

### Approved OpenRouter constraints

- Use only free models or a free-model routing configuration, and never silently fall back to a paid model. Do not enable automatic credit top-up. Keep the API key only as a Worker secret with a per-key spending limit as an additional guardrail.
- Free models require the account setting that permits providers which may train on submitted data. This is acceptable only because the strict request schema admits no wardrobe-derived data, photos, paths, free-form names, identifiers or coordinates.

### Approved Workers AI constraints

- Integrate through a Workers AI binding rather than exposing Cloudflare credentials to mobile. Select an explicitly evaluated structured-output-capable model.
- Treat the free neuron allocation as a quota, not a guaranteed number of requests; on the Workers Free plan it is a hard stop rather than billable overage. Exceeding quota, capacity failure, invalid output or provider failure proceeds to the deterministic fallback.

## Generation mode, active AI probe and Worker rate limiting

Rationale and the recalculated probe limits in [ADR 0001](adr/0001-worker-ai-probe-and-rate-limiting.md); the single Worker environment in [ADR 0003](adr/0003-single-worker-environment.md).

- Today shows the accessible localized AI-assisted mark only when the stored generation mode is `ai-assisted` and shows no mark for `deterministic-fallback`; Settings shows the stored status.
- `POST /v1/ai/probe` is distinct from liveness and configuration readiness: one bounded call to the first provider, a briefly cached sanitized `ok | unavailable` result, no provider or model details. Settings triggers it explicitly ("Check AI status") and respects Reduced Motion.
- Recommendation and probe routes use per-IP burst limits; the probe also has a KV-backed daily cap. Kuyara limit denials return the stable `rate_limited` error; upstream quota or capacity failures follow the normal sanitized AI fallback. Missing bindings degrade permissively, so deployed bindings must remain configured.

## Approved AI input privacy boundary

Approved 2026-08-13, narrowed 2026-08-30, amended by ADR 0031 on 2026-09-08. The strict request schema admits only the fields below, so forbidden fields have no representation and are rejected rather than filtered. Optional `dressStyle` defaults to `smart` for previous-client compatibility; mobile always sends the stored style.

AI may receive only:

- catalog candidate identifiers and garment types,
- catalog structural categories, supported roles, and property evidence,
- deterministic weather and clothing requirements,
- clothing preference,
- dress style,
- a local calendar day seed.

AI must not receive Wardrobe-derived data of any kind, including source kinds, overrides, photos, photo paths or URIs, free-form names, or ownership state. It also must not receive `localProfileId`, profile or device identifiers, exact coordinates, raw location payloads, secrets, complete internal database records, birth date or birth year, or unrelated personal data.

## Approved recommendation caching, refresh, and status behavior

Approved 2026-08-13, revised 2026-09-01 (the persisted baseline) and through [ADR 0031](adr/0031-dress-style-is-the-formality-signal.md) on 2026-09-08.

- The last valid recommendation snapshot is persisted on-device and rendered immediately when available.
- AI is not called on every launch. A recommendation is generated or refreshed only when there is no persisted recommendation yet, the relevant weather snapshot is refreshed after becoming stale, the active location changes, gender changes, dress style changes, a new local calendar day starts, or the user explicitly requests a refresh. A birth date change triggers nothing.
- That rule is enforced against the persisted recommendation snapshot's signals (weather snapshot identity, location key, gender-derived clothing preference, dress style, and local date key), never against in-memory state, so a fresh install and the first location selection both count. The day variant remains the composition seed and part of cache identity, not the day-change detector.
- Cache identity is weather snapshot identity, clothing preference, dress style, catalog version, and day variant. The Worker additionally caches the shared AI result under a key derived from the requirement vector without reason codes, clothing preference, dress style, catalog version and day variant, because the request contains no personal data. Gender never reaches the Worker under that name.
- Duplicate in-flight generation requests are coalesced, and a failed refresh preserves the last valid recommendation. A successful deterministic fallback is a valid result and replaces an unavailable AI attempt.
- Transient provider or model identity stays out of the durable domain model except as the coarse generation mode. Worker liveness, AI configuration readiness and the active probe stay distinct.

## Approved notifications scope

Approved 2026-08-29; design and rejected alternatives in [ADR 0004](adr/0004-notifications-in-the-mvp.md), the alert rules in [ADR 0032](adr/0032-local-weather-alert-rules.md).

- Notifications exist to warn the user about upcoming weather that changes what they need to wear.
- The MVP ships **on-device local weather alerts only**: no push token, no APNs registration, no Worker endpoint, no server-side device, token or location store, and no new identifier. The AI input privacy boundary and the "no coordinates persisted or logged" rule are untouched.
- N1, the foundation: an OS permission flow surfaced in Settings, a `notifications_opt_in` profile preference, `expo-notifications` imported only in one adapter, and notification taps opening Today.
- N2, the alerts: two deterministic rules over the remainder of the current local day, precipitation onset and an 8 °C apparent-temperature swing, 60 minutes ahead in the foreground, silent from 22:00 to 07:00 in the device time zone, one alert per rule per location per day, structured plans localized at scheduling time, repeat suppression through a delivery ledger, rescheduling on every app open and persisted snapshot, and a best-effort `expo-background-task` refresh when iOS grants it. The background task is a staleness reducer, not a guarantee.
- Revised 2026-09-12 (amendment note at the end of [ADR 0032](adr/0032-local-weather-alert-rules.md)): the current local day is the day `now` falls in, in the snapshot's time zone, not the day the snapshot was observed in; alerts are planned only from a snapshot that is not stale, and a stale one leaves the existing schedule untouched until a refresh arrives; the delivery ledger records only alerts the OS accepted; and on the background path, where the app is not open, a crossing closer than 60 minutes may still be scheduled with a shortened lead of 15 minutes, still subject to quiet hours. The foreground lead stays 60 minutes.
- The background task is registered while the user is opted in and unregistered when they opt out, and it reuses a cached snapshot that is still fresh instead of spending a provider request.
- Settings shows notifications as on only when the user has opted in **and** the OS permission is granted; the Notifications surface keeps the stored preference on its toggle and explains the block in its footer.
- N3, server-sent push, is deferred and not scheduled. It is reconsidered only if N2 proves insufficient in real use, with its own ADR covering the server-owned subscription store, the persisted-coordinate privacy posture, delivery and hard spend controls.
- Alert timeliness is bounded by how often the user opens the app plus what iOS grants `BGTaskScheduler`. This is an accepted limitation and the reason N3 stays on the table.

## Approved manual refresh affordance

Approved 2026-08-30, revised with Direction E on 2026-09-08 and 2026-09-09.

- **Pull-to-refresh refreshes weather on Today and Weather.** On Today, after the weather refresh settles, the gesture explicitly regenerates the recommendation; duplicate in-flight generation remains coalesced and the last valid recommendation remains visible on failure. Spend stays bounded because the Worker serves an identical requirement vector and day variant from cache and rate-limits per client, so a pull with unchanged weather reaches no AI provider. Weather continues to refresh weather only.
- **The gesture is never the only way to refresh**, because it cannot be activated by VoiceOver or Switch Control. Weather keeps a visible refresh control in the location section's header, where the M6.1 mockup alignment placed it. Today, whose header controls left with the garment board, exposes an accessibility custom action ("Refresh" / "Yenile") on its loaded content that calls the same weather-then-recommendation refresh (decided 2026-09-09, revised 2026-09-12).
- **Refresh status is announced, not only shown.** Today's freshness line is a three-state line, last updated, refreshing, or refresh failed, on a polite live region. Weather's line announces the same three states, and its settled state keeps the fresh/stale distinction. A failed refresh preserves and labels the last valid snapshot.
- The refresh indicator uses the resolved `iconSecondary` role; the platform refresh control owns its own reduced-motion behavior.
- **The `Screen` primitive owns inset resolution.** It lets iOS resolve the top inset (disabling content-inset adjustment silently disables `UIRefreshControl`), exposes `contentTopClearance` for screens with an overlay header, and resolves the bottom edge itself; feature code performs no safe-area arithmetic and never sets `paddingBottom` on `Screen` ([ADR 0027](adr/0027-the-app-shell-and-its-three-tabs.md) section 4).
- Out of scope: a generic pull-to-refresh primitive, a non-scrollable screen API, and any change to the 30-minute freshness boundary or refresh coalescing.

## Approved catalog content revision and version 3

Approved 2026-09-03; rationale, the measured cost of the version bump and rejected alternatives in [ADR 0013](adr/0013-catalog-content-corrections-and-version-3.md).

- `garmentCatalogVersion` bumps whenever catalog content changes, because a stale shared AI cache would serve picks the client then rejects and silently degrade every user to the deterministic fallback. The user-visible cost is at most one extra loading state on the first launch after the update; offline use is unaffected.
- `overshirt` stays a `top` and `jumpsuit` stays available to both preferences; both reconsiderations are closed.
- Out of scope: breathability, wind and traction values, any new property axis, colour, the Wardrobe as a candidate source, and schema migrations.

## Operating assumptions

- Provider usage remains within a small maintainer-funded budget with automatic top-up disabled and hard or safely derived limits.
- Current pricing, quotas, licences, model availability, and terms must be reverified before provider changes. ADR 0001, ADR 0002 and ADR 0014 record the dated basis for the current limits.

## Approved visual direction, Direction E

Approved 2026-09-03 and applied app-wide on 2026-09-04. Canonical in [ADR 0021](adr/0021-direction-e-a-visual-first-design-language.md).

- kuyara is styling-first with weather as a meaningful input, roughly a 70 / 30 balance of attention. The application should feel like a styling product before it feels like a weather product.
- Today is visual-first. The user sees the outfit, understands the look, reads one short rationale, and opens details only if they want them. Today does not list the garment names.
- Simple garment illustration is permitted and is the visual subject. The earlier prohibition on literal clothing illustration is withdrawn; the prohibition on literal weather illustration stands.
- The weather tints the surface the garment composition sits on rather than occupying a separate full-width band.
- Weather leads with insight rather than measurement, and its hourly forecast is a horizontal scrollable rail. The Worker sends the current local hour through 36 hours after observation; the screen drops every hour that has ended at render time, reads the clock on mount and on focus, marks the first entry of each following local day with its localized short weekday, and omits the card when no entry remains. Clothing requirements and weather alerts retain their current-local-day semantics and ignore the following day's entries.
- AI provenance sits beside the recommendation it describes, never as footer metadata, and never in green. A deterministic recommendation gets no badge.
- Durable qualities: high contrast, restrained chrome, intentional negative space, visual content before explanatory text, few user-visible labels on overview surfaces, selective rather than pervasive accent colour, and typography that supports the imagery rather than carrying the identity alone.
- Direction E applies to every surface: the light page ground is Soft Mist app-wide, there is no white-card step, and separation is carried by type and space. Text and non-text contrast floors are unchanged.

## Approved recommendation detail surface

Approved 2026-09-04. Canonical in [ADR 0026](adr/0026-the-recommendation-detail-surface.md).

- The surface Today defers to. It carries the garment names, the layer structure, the weather reasoning, per-piece reasoning, composition trade-offs, ownership state, formality, a quiet weather recap, and AI provenance.
- Its board is [ADR 0025](adr/0025-the-garment-board-composition-rule.md)'s composition rule run with a second parameter set, so Today and detail share one composition and the transition between them moves the pieces.
- The board sits on the page ground rather than the condition-tinted stage, because Law 3 forbids secondary copy on that stage. The weather keeps one quiet tinted recap row.
- Reasoning is organised by weather requirement and each row names the garments that answer it.
- Ownership state appears here and nowhere else: English reuses the existing owned and wanted labels, Turkish uses "Sende var" / "İstiyorsun", and each caption opens a two-item platform menu that changes the state and checks the current item. An untracked garment draws no marker while its accessibility label still speaks the state; the entry transition is decision 7.
- Above `fontScale` 1.5 the captions render as a list under the board (amended 2026-09-09).

## Approved Profile, Closet and Settings surfaces

Approved 2026-09-07. Canonical in [ADR 0028](adr/0028-the-profile-tab-and-the-list-row-anatomy.md), [ADR 0029](adr/0029-the-closet-grid.md) and [ADR 0030](adr/0030-settings-as-a-native-grouped-list.md). The target sheets are kept outside the repository; the ADRs repeat the numbers that matter.

- Profile's subject is the Closet: a native large title with the Settings gear as the bar button, a Closet heading row, a rail of the eight newest owned pieces as the hero, then one inset group with a Wanted row and a Location row. No cards, no personal facts.
- One list-row anatomy is decided once and shared by every list-shaped screen: an inset group at 16 with radius 20, a 28 × 28 radius-7 monochrome ink-alpha leading tile with a 20 glyph, a separator starting at the text edge, a secondary trailing value then a chevron that stacks above `fontScale` 1.5, and kuyara's sentence-case `bodyStrong` section headings drawn outside any group.
- The Closet is a two-column grid of the rail's tile with a native segmented owned/wanted filter, kuyara-drawn category chips (the selected chip is the screen's one accent fill), and a plus bar button. Tiles draw the photo, else the type silhouette filled with the piece's colour family, else the category glyph.
- Settings is a native inset grouped list in system colours over kuyara's ground, with kuyara's headings outside the group and a centred version line. Notifications and AI status open their own surfaces; provider and model identity stay hidden.
- The colour-family fill on silhouettes is approved as content colour for the rail and the grid only. Five accessory silhouettes are wanted and not yet approved.
- The Turkish wanted label is "İstekler", shared by Profile and the Closet.

## Approved visual identity

Approved 2026-07-29.

- The canonical approved brand and visual constraints are recorded in [`docs/design/visual-identity.md`](design/visual-identity.md). That document is the source of truth for UI, UX, themes, icons, illustrations, motion, splash screens, and other branding work.
- The approved app symbol is Balanced Horizon — V2: Unified Gap System. Its repository master is `apps/mobile/assets/brand/kuyara-symbol-master.svg`, and its locked geometry must not be silently altered.

## Approved backend and account direction

Approved 2026-09-04. Canonical in [ADR 0022](adr/0022-supabase-is-the-intended-backend-and-kuyara-is-not-local-first.md). Nothing here is implemented, and this section authorizes no Supabase dependency, table, client, or sync code.

- kuyara is not fundamentally a local-first product. The first production release ships without accounts and cross-device synchronization because that keeps the first shippable scope manageable, not because device-only storage is the intended end state.
- The long-term backend is Supabase: **Auth** for accounts, **PostgreSQL** for durable account-backed data, and **Storage** for synchronized files, with Closet photos the first candidate. Once accounts land, Postgres is authoritative for account-backed data and Expo SQLite is the device-side working store the app reads and writes first, then reconciles.
- Firebase is not the planned production backend; any evaluation stays an isolated prototype, never a second production backend beside Supabase.
- Current persistence must stay migration-friendly without implementing sync: client UUIDs, `localProfileId`, ordered migrations, lifecycle fields, separated model families with explicit mappers, repository interfaces, and UI that imports neither `expo-sqlite` nor a future Supabase SDK. Still forbidden without a further decision: sync engine, outbox, conflict resolution, server revision system, Supabase tables or Auth or Storage, remote repository implementations, and placeholder sync abstractions.
- Accounts must earn themselves. Basic weather and general outfit recommendations stay usable without one; the Closet is the strongest candidate for an account-required feature. No account gating is implemented or scheduled.

## Approved analytics direction

Approved 2026-09-04. Canonical in [ADR 0023](adr/0023-behavioural-product-analytics-with-posthog.md); the tracking plan is [`analytics-taxonomy.md`](analytics-taxonomy.md).

- Behavioural product analytics is part of the production direction, sequenced **before the first public App Store release**. **PostHog** is the provider.
- The objective is maximum useful behavioural coverage, not maximum event volume: enough structured events and coarse properties to reconstruct activation, funnels, feature adoption, retention, abandonment and friction. High-frequency signals are aggregated, sampled, or omitted.
- Analytics sits behind the project-owned `ProductAnalytics` boundary with one PostHog adapter behind it, not SDK calls scattered through screens.
- Never in an analytics or error payload: exact coordinates, Closet photos or image content, free-form user text, full AI prompts or model responses, raw provider responses, secrets, complete SQLite rows, credentials, or a persistent device fingerprint. `localProfileId` is not an analytics identifier; the SDK's own random per-install identifier is used and is never derived from or sent beside it. Gender is absent from every event; the coarse age bucket and dress style are the only profile-derived properties.
- Automated crash and error tracking is planned, with **PostHog Error Tracking** the preferred first candidate. **Session replay is an evaluation item, not an approval.** **Grafana is operational observability, not product analytics**, evaluated later on a free tier with spending controls.
- The existing cost posture applies: free tiers, explicit quotas, hard spending limits, no pay-as-you-go surprise, and an event budget; reverify prices at implementation time.

## Approved privacy and consent posture for analytics

Approved 2026-09-04, settled by [ADR 0033](adr/0033-apple-privacy-obligations-for-first-party-analytics.md) on 2026-09-09.

- **App Tracking Transparency does not apply**: kuyara has no advertising, no IDFA, no cross-app or cross-site tracking, and no data-broker sharing. No ATT prompt is added.
- **Consent is required anyway.** App Store Review Guideline 5.1.1 requires consent before collection and an in-app way to withdraw it even for anonymous usage data, so the earlier preference against a permanent toggle is withdrawn. Consent is a first-launch sheet, one tap to accept and one equally prominent tap to decline, before the first event; withdrawal lives on a Privacy surface under Settings, unprominent but two taps deep, with the in-app policy link. Onboarding stays five steps.
- Analytics enters the App Store Connect questionnaire as Product Interaction and Other Usage Data, with PostHog's IP capture off; the install identifier is declared linked to the user (maintainer decision, 2026-09-09).
- Data is not sold, not used for advertising, and not intentionally shared with data brokers or unrelated third parties. A short, understandable privacy disclosure is preferred to a legalistic agreement flow.
- These findings are verified against current official Apple documentation before implementation and again before submission; identity linking when accounts arrive remains open.
- Consent is the lawful basis (decided 2026-09-11, ADR 0033 section 7). The privacy policy promises withdrawal from Settings, severance of the analytics identifier on withdrawal and twelve-month retention; deletion can be requested from the maintainer by email without a guaranteed outcome, because anonymous events cannot be deleted by identifier. The policy and the support page are published from the main branch's `docs/` folder through GitHub Pages under `https://ubrn.github.io/kuyara/`.

## Approved licensing posture

Approved 2026-09-04. Canonical in [ADR 0024](adr/0024-relicensing-to-polyform-noncommercial.md); the terms are in [`LICENSE`](../LICENSE) and the summary in [`LICENSING.md`](../LICENSING.md).

- The project licence for current and future work is the **PolyForm Noncommercial License 1.0.0**, applied as the exact unmodified official text.
- kuyara is described as **source-available**, never as open source. Noncommercial use, modification, and redistribution are granted; commercial use requires separate written permission.
- **The MIT history is not revoked.** Versions distributed under MIT from 2026-07-25 until 2026-09-04 remain under MIT.
- A contributor licence agreement, commercial licence terms, dual licensing, and trademark policy are out of scope and undecided.

## Future possibilities, not MVP commitments

- Accounts, cross-device sync, an outbox, and conflict resolution require separate product and architecture decisions; their intended shape is in [Approved backend and account direction](#approved-backend-and-account-direction).
- Owned garments may later softly influence recommendations only as a tie-breaker between equally suitable catalog candidates, never as a filter.
- Per-slot substitutions on a recommendation are not in the MVP. No layer of the product produces one; offering them is a new feature needing its own decision ([ADR 0026](adr/0026-the-recommendation-detail-surface.md), amending [ADR 0021](adr/0021-direction-e-a-visual-first-design-language.md) section 7).
- Server-sent push notifications (N3) are deferred and would need their own ADR.
