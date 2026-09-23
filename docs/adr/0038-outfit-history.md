# ADR 0038: Outfit history

## Context

A recommendation is not evidence that the user wore it. Recording a chosen outfit creates a truthful memory for the reader and a bounded basis for repeat avoidance. Streaks and gamified penalties do not belong in kuyara.

## Decision

"Wore this today" on outfit detail records one outfit per dressing-day key, overwritable by the user. A Profile History row below Closet opens a calendar and list with optional mirror photos. A photo uses the existing Wardrobe import, resize, compression and database-first cleanup pipeline, under its own managed `kuyara/history/photos/` path segment. It remains on the device and in the device backup and is never sent to AI, providers, analytics or telemetry. Migration 18 adds `outfit_history` with a stable client UUID, `localProfileId`, `createdAt`, `updatedAt` and nullable `deletedAt`, plus the day key, outfit reference and optional relative photo path. Repeat avoidance derives from the last N dressing days; choose N at implementation, with seven days as the default.

Analytics may emit only the closed `outfit_worn_logged` event with a schema-version bump, no garment or outfit identity and no photo data.

## Red lines

- History is evidence of a user action, never inferred from seeing a recommendation.
- No streak, streak-break warning, penalty, loss framing or fake urgency.
- The photo never joins the recommendation candidate set or AI input.
- Missing or corrupt photos do not break the history list, and file deletion follows a confirmed database write.
- Migration 18 preserves existing rows and receives the device-migration review and replay before shipping.

## Risk accepted

Device backup includes mirror photos even before accounts exist. This is accepted as part of the local photo record; later account photo backup requires its own sync and consent design.

## Consequences

The user can correct a day's record by overwriting it. History supports repeat avoidance without changing the catalog-only recommendation boundary. A future account can link the row through `localProfileId` without an outbox or sync engine now.
