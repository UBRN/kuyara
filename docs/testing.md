# kuyara testing conventions

## Mobile unit and boundary tests

The mobile workspace uses Node's built-in test runner with Node's TypeScript stripping and the checked-in path resolver. Run every current mobile test from the repository root with:

```bash
pnpm --filter @kuyara/mobile test
```

React Native component tests use Jest, `jest-expo`, React Native Testing Library 14, and the React 19-compatible `test-renderer` package. They remain separate from the Node suites and run with:

```bash
pnpm --filter @kuyara/mobile test:components
```

The component suite renders the production tab-bar presentation, localized Weather and Wardrobe placeholders, and the profile route gate. Expo Router 57's `renderRouter` helper assumes the older synchronous Testing Library renderer, while React Native Testing Library 14 uses an asynchronous React 19 renderer. The suite therefore does not force the native route tree through that incompatible helper: it tests production navigation controls and intents directly and mocks only the Expo Router boundary for the gate. Device-level path transitions, nested native Stack behavior, VoiceOver/TalkBack output, and platform visuals remain simulator or device verification concerns.

Run the focused local-profile persistence suite with:

```bash
pnpm --filter @kuyara/mobile test:profile
```

Run the focused wardrobe persistence and migration suite with:

```bash
pnpm --filter @kuyara/mobile test:wardrobe
```

The profile migration and data-source tests use Node 24's built-in in-memory SQLite implementation through a test-only adapter for the small project-owned executor contract. This executes the production migration SQL, constraints, parameterized writes, transaction rollback, and repository mappings without mocking SQL statements or importing the Expo native module into Node.

Production still opens Expo SQLite on device. The Node adapter is test infrastructure only and must not become an application persistence implementation.

Migration tests must verify empty-database application, ordered version changes, version 1 upgrades, idempotent re-entry, required constraints, and rollback without data deletion or version advancement. Profile data-source/repository tests cover singleton creation, concurrent initialization, row/domain mapping, explicit preference updates, atomic onboarding completion, invalid stored values, and sanitized errors. Controller tests cover loading, incomplete, completed, failure, repeated initialization, saving, and refreshed profile state.

Wardrobe persistence tests execute the production migrations through version 3 and cover foreign-key/category/enum constraints, version 2 row preservation, rollback, UUID creation, profile isolation, explicit domain-record mapping, active list/get behavior, taxonomy and nullable-override round trips, lifecycle preservation, atomic soft deletion, missing/deleted write behavior, relative photo-path validation, bound parameters, and sanitized repository errors. Deleted rows must disappear from default reads while remaining available only through the explicit include-deleted operation.

The same focused suite validates every taxonomy enum and Zod schema, all 30 immutable canonical catalog entries, duplicate and category-shape rejection, deprecation cycles, Turkish/English localization completeness, approved clothing-preference applicability, and pure effective-garment resolution for defaults, overrides, legacy rows, and invalid data.

Presentation tests should focus on pure onboarding/route decisions, localization completeness, accessibility contracts, navigation intents, and source boundaries. Simulator verification remains required for genuine persistence across termination/relaunch, complete navigation behavior, native accessibility output, Dynamic Type, appearances, Reduced Motion, and visual regressions.
