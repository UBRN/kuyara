# ADR 0036: Display name and one-time prompt gate

## Context

A personal greeting and Closet heading need an optional name. Existing installations must receive the invitation without repeating it on every launch. A walkthrough also needs a once-per-version invitation after its design is settled.

## Decision

The display name is optional, 2 to 30 characters, and stored only in the local profile. Onboarding asks for it immediately after welcome and offers "Not now". Existing users see the name prompt once after the update. A versioned prompt gate in the profile row records which invitation has been handled and is shared by the later walkthrough; migration 17 adds `display_name` and `name_prompt_version` without resetting onboarding or existing answers. The walkthrough receives its own versioned gate use, so handling the name does not mark the walkthrough complete.

Today greets a named user with "Welcome back, {name}" / "Tekrar hoş geldin, {name}"; a time-of-day variant may replace that sentence. Profile uses "{name}'s Closet" in English and "Gardırop · {name}" in Turkish. Without a name, both use the current copy. Settings > Profile edits the name. Every sentence is localized whole rather than assembled from translated fragments.

## Red lines

- The name never enters AI requests, analytics, telemetry, providers or logs.
- The prompt never blocks use. Skipping it is a complete answer for that version.
- Turkish copy never adds a possessive suffix to the user's name.
- Migration 17 preserves every existing profile and dependent row; it needs an independent read-only review and a realistic device-database upgrade replay before shipping.

## Risk accepted

A versioned prompt adds durable profile state for a single interruption. The cost is accepted because a process-local flag could repeat after relaunch and could not govern the existing-user walkthrough.

## Consequences

A named profile changes greeting and Closet copy without changing recommendation identity or triggers. The privacy policy is checked and updated at ship time. The walkthrough design remains a separate decision; only its one-time gate is settled here.
