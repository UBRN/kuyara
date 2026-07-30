# kuyara testing conventions

## Mobile unit and boundary tests

The mobile workspace uses Node's built-in test runner with Node's TypeScript stripping and the checked-in path resolver. Run every current mobile test from the repository root with:

```bash
pnpm --filter @kuyara/mobile test
```

Run the focused local-profile persistence suite with:

```bash
pnpm --filter @kuyara/mobile test:profile
```

The profile migration and data-source tests use Node 24's built-in in-memory SQLite implementation through a test-only adapter for the small project-owned executor contract. This executes the production migration SQL, constraints, parameterized writes, transaction rollback, and repository mappings without mocking SQL statements or importing the Expo native module into Node.

Production still opens Expo SQLite on device. The Node adapter is test infrastructure only and must not become an application persistence implementation.

Migration tests must verify empty-database application, ordered version changes, idempotent re-entry, required constraints, and rollback without data deletion. Data-source/repository tests must cover singleton creation, concurrent initialization, row/domain mapping, explicit preference updates, atomic onboarding completion, invalid stored values, and sanitized errors. Controller tests cover loading, incomplete, completed, failure, repeated initialization, saving, and refreshed profile state.

Presentation tests should focus on pure onboarding/route decisions, localization completeness, accessibility contracts, and source boundaries. Simulator verification remains required for genuine persistence across termination/relaunch, navigation behavior, native accessibility output, Dynamic Type, appearances, Reduced Motion, and visual regressions.
