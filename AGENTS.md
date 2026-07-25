# kuyara repository instructions

## Project purpose

kuyara is an open-source, local-first weather and outfit recommendation
application built with Flutter for iOS and Android.

The first production release must remain focused, reliable, accessible, and
easy to maintain. The architecture must permit future additions without
requiring a rewrite, including:

- CloudKit synchronization on Apple platforms
- optional cross-platform account synchronization
- Apple Foundation Models integrations
- Android-specific AI providers
- home-screen widgets
- notifications
- additional languages
- additional weather providers

Do not implement future functionality before it is required. Create clear
extension points, but prefer the simplest implementation that satisfies the
current task.

## Sources of truth

Use these sources in this order:

1. The current user request
2. This `AGENTS.md`
3. Existing tests and executable project configuration
4. Architecture decision records under `docs/decisions/`
5. Other project documentation under `docs/`
6. Existing implementation patterns

When documentation and executable configuration disagree, report the
difference instead of silently choosing one.

For Flutter, Dart, Apple, Android, Material, or package behavior that may have
changed, prefer current official documentation. Do not rely on remembered API
details when they can be verified.

## Working approach

Before editing:

1. Read the relevant files and nearby tests.
2. Inspect `git status`.
3. Identify the smallest coherent change that fulfills the request.
4. Preserve unrelated user changes.
5. State any important assumption that cannot be verified from the repository.

During implementation:

- Make focused changes.
- Follow existing repository conventions.
- Do not perform unrelated cleanup or broad refactoring.
- Do not add speculative abstractions solely for hypothetical future features.
- Prefer readable and testable code over clever code.
- Update relevant documentation when behavior or architecture changes.
- Add or update tests for changed behavior.

Before finishing:

1. Review the diff.
2. Run the relevant formatting, analysis, and test commands.
3. Report exactly which checks were run and their results.
4. Report checks that could not be run and explain why.
5. Mention remaining risks, assumptions, or follow-up work.

Never claim that a command, build, simulator run, or test passed unless it was
actually executed successfully.

## Architecture

Use a feature-first layered architecture.

Organize feature code into these responsibilities when the feature is large
enough to justify them:

- `presentation`: screens, widgets, controllers, and UI state
- `domain`: application entities, use cases, and business rules
- `data`: repository implementations, data sources, DTOs, and mapping

Keep shared infrastructure under `lib/core/` and optional platform
integrations under `lib/platform_integrations/`.

Dependency direction must remain:

```text
presentation -> domain
data -> domain
platform integrations -> domain contracts
domain -> no Flutter UI, provider, database, or remote API implementation