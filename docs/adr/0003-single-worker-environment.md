# ADR 0003: A single Worker environment, no named environments

Status: Accepted (2026-08-29)

Implementation: Completed on 2026-08-29.

## Context

`apps/worker/wrangler.jsonc` kept every binding at the top level
(`ai`, `kv_namespaces`, `ratelimits`, `vars`) and additionally declared a named
environment `env.development` that only renamed the Worker and set
`workers_dev`, `preview_urls` and `observability`.

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

The real-provider credential was already attached to the top-level deployment,
not the named environment.

## Decision

`env.development` is removed. The Worker has exactly one environment: the
top-level configuration, deployed with a plain `wrangler deploy` and no `--env`
flag.

`workers_dev: true`, `preview_urls: false` and `observability: { enabled: false }`
move to the top level unchanged, so the deployment behavior those settings
expressed is preserved.

Those are the values as of this ADR. `observability` was later turned on; see
[Worker and contract boundaries](../architecture.md#worker-and-contract-boundaries) for
the current setting and what it captures. This ADR's decision is the single
environment, not any particular value of these three settings.

The alternative, redeclaring every binding under `env.development`, was rejected.
It keeps two copies of the binding list that must be edited together forever,
and the failure mode of forgetting is silent. There is one deployment target and
no production environment yet, so a second environment bought a different Worker
name and nothing else.

## Consequences

- The binding list has one home. Adding a binding cannot half-apply.
- The obsolete sample deployment was deleted. Mobile obtains its Worker origin
  from configuration, so deployment topology does not enter domain code.
- Provider credential values remain external. Binding declarations and the
  deploy target share the top-level configuration with no `--env` qualifier.
- When a real production environment is needed, it gets its own ADR and, if it is
  a named environment, a complete binding block written knowing this trap.

## Out of scope

- Deploying the Worker, provisioning KV, or setting further remote secrets.
- Any change to handler behavior. Every handler still degrades to permissive when
  a binding is absent, which is what keeps local dev and unit tests working.
