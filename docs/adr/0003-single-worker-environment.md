# ADR 0003: A single Worker environment, no named environments

Status: Accepted (2026-08-29)

## Context

`apps/worker/wrangler.jsonc` kept every binding at the top level
(`ai`, `kv_namespaces`, `ratelimits`, `vars`) and additionally declared a named
environment `env.development` that only renamed the Worker to
`kuyara-weather-dev` and set `workers_dev`, `preview_urls` and `observability`.

Cloudflare does not inherit top-level bindings into a named environment. A
`wrangler deploy --env development` would therefore have shipped a Worker with
no AI binding, no KV namespace, no rate-limit bindings and no vars, while every
local check (`wrangler dev`, `wrangler deploy --dry-run`) passed, because those
run against the top level. ADR 0001 and the documentation recorded the
workaround: redeclare the whole binding list under `env.development` before
deploying.

Milestone 5 made the trap worse rather than better. `WEATHER_RATE_LIMIT` joined
the list, and `POST /v1/weather` now depends on the `PROBE_COUNTER` KV namespace
for the OpenWeather daily cap. Silently losing those bindings degrades the
weather endpoint to permissive limiting against a real, keyed upstream provider.

`OPENWEATHER_API_KEY` was set as a secret on the Worker named `kuyara-worker`,
which is the top-level name, not on `kuyara-weather-dev`.

## Decision

`env.development` is removed. The Worker has exactly one environment: the
top-level configuration, deployed as `kuyara-worker` with a plain
`wrangler deploy` and no `--env` flag.

`workers_dev: true`, `preview_urls: false` and `observability: { enabled: false }`
move to the top level unchanged, so the deployment behavior those settings
expressed is preserved.

The alternative, redeclaring every binding under `env.development`, was rejected.
It keeps two copies of the binding list that must be edited together forever,
and the failure mode of forgetting is silent. There is one deployment target and
no production environment yet, so a second environment bought a different Worker
name and nothing else.

## Consequences

- The binding list has one home. Adding a binding cannot half-apply.
- The deployed Worker is `kuyara-worker`. The previously deployed
  `kuyara-weather-dev` (sample-only code, no bindings, no secrets) is abandoned
  and can be deleted in the Cloudflare dashboard. Nothing in the repository
  hardcodes its URL: mobile reads
  `EXPO_PUBLIC_KUYARA_WORKER_BASE_URL`, so only that value changes.
- `OPENWEATHER_API_KEY` is already on `kuyara-worker`, so the secret and the
  deploy target now agree. Secrets no longer need an `--env` qualifier.
- The `PROBE_COUNTER` KV namespace was provisioned on 2026-08-29 and its real id
  replaced the placeholder, which was the last deploy blocker. `kuyara-worker`
  was deployed the same day with all bindings and both provider secrets.
- When a real production environment is needed, it gets its own ADR and, if it is
  a named environment, a complete binding block written knowing this trap.

## Out of scope

- Deploying the Worker, provisioning KV, or setting further remote secrets.
- Any change to handler behavior. Every handler still degrades to permissive when
  a binding is absent, which is what keeps local dev and unit tests working.
