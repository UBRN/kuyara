# ADR 0036: Display name and one-time prompt gate

Status: Accepted (2026-09-23)

## Context

A personal greeting and Closet heading need an optional name. Existing installations must receive the invitation without repeating it on every launch. A walkthrough also needs a once-per-version invitation after its design is settled.

## Decision

The display name is optional, 2 to 30 characters enforced by the domain, and stored only in the local profile. Onboarding asks for it immediately after welcome and offers "Not now". Existing users see the name prompt once after the update. The name invitation has its own `name_prompt_version INTEGER NOT NULL DEFAULT 0` profile column in the Phase 3 migration. The Phase 8 walkthrough has a separate `walkthrough_version INTEGER NOT NULL DEFAULT 0` profile column. A prompt is offered when its stored value is below that prompt's code version; completion or dismissal stores that version. Migration numbers are assigned in ship order. Both migrations preserve existing profiles and answers. A later distinct prompt receives its own column, not a generic prompt-gate table.

Today greets a named user with "Welcome back, {name}" / "Tekrar hoş geldin, {name}"; a time-of-day variant may replace that sentence. Profile uses "{name}'s Closet" in English and "Gardırop · {name}" in Turkish. Without a name, both use the current copy. Settings > Profile edits the name. Every sentence is localized whole rather than assembled from translated fragments.

## Red lines

- The name never enters AI requests, analytics, telemetry, providers or logs.
- Tests at the AI request builder, analytics boundary and telemetry boundary reject `displayName` and every other free-text profile field in their output.
- The prompt never blocks use. Skipping it is a complete answer for that version.
- Turkish copy never adds a possessive suffix to the user's name.
- The invitation, the existing-user sheet and the Settings editor say only that the name is optional and can be added or changed later in Settings; no sentence states where the name is kept or that it is never sent.
- The name migration preserves every existing profile and dependent row; it needs an independent read-only review and a realistic device-database upgrade replay before shipping.

## Consequences

A versioned prompt adds durable profile state so the invitation does not repeat after relaunch and the existing-user walkthrough has its own gate. A named profile changes greeting and Closet copy without changing recommendation identity or triggers. The privacy policy is checked and updated at ship time. The walkthrough design remains a separate decision; only its one-time gate is settled here.
