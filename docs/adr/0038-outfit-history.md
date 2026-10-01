# ADR 0038: Outfit history

Status: Accepted (2026-09-23)

## Context

A recommendation is not evidence that the user wore it. Recording a chosen outfit creates a truthful memory for the reader and a bounded basis for repeat avoidance. Streaks and gamified penalties do not belong in kuyara.

## Decision

"Wore this today" on outfit detail records one outfit per bare-date dressing-day key, overwritable only by that action. The evening can replace the morning record when the user chooses it; a chip answer alone does not. A Profile History row below Closet opens History, a diary of small garment boards, newest first: the latest day stands large under its full date, the look's name and its day type, and earlier days follow two to a row under their month, each spoken with its full date, name and day type. A worn day stores types without colour or weather, so its board is drawn in the pieces' natural colourways for a mild day and carries no weather glyph. A day is a record to look at, not a control. The same rows give each owned Closet piece a worn count ([ADR 0029](0029-the-closet-grid.md)). Optional mirror photos are kept with the day. A photo reuses the Wardrobe import, resize, compression, staging and database-first cleanup pipeline under its own managed `kuyara/history/photos/` document segment. The stored path is relative. Missing or corrupt files do not break the list. Photos remain on the device and in device backup.

Migration 19 creates `outfit_history`: `id TEXT` is a client UUID v4 primary key, `local_profile_id TEXT NOT NULL` is a profile foreign key, `day_key TEXT NOT NULL` is the bare date, `outfit_json TEXT NOT NULL` holds catalog garment ids by slot, archetype id, resolved formality and source (`recommended | manual`), `photo_path TEXT` is nullable, `worn_at`, `created_at` and `updated_at` are required, `deleted_at TEXT` is nullable, and `(local_profile_id, day_key)` is unique. Logging a soft-deleted day revives its row. Replacing a day's outfit keeps its mirror photo unless explicitly removed or replaced. Manual mix-and-match writes source `manual` only through "Wore this today"; its temporary swaps do not enter the recommendation cache.

Before AI selection, composition reads the seven most recent valid history rows and excludes candidate outfits whose garment-id set equals a worn set. An invalid row is skipped in History and repeat avoidance; valid rows remain available, and an unreadable database still produces a read error. Seven is a domain constant. If fewer than three candidates remain, it relaxes exclusion oldest first until three are available. History rows never enter the AI request, Worker, analytics or telemetry; the AI input boundary stays unchanged.

Logging or replacing a worn outfit emits no new analytics event. History rows, garment and outfit identities, and mirror photos never enter analytics.

## Red lines

- History is evidence of a user action, never inferred from seeing a recommendation.
- No streak, streak-break warning, penalty, loss framing or fake urgency.
- History and photos never join the AI input. Closet items remain outside recommendation candidates.
- Missing or corrupt photos do not break the history list, and file deletion follows a confirmed database write.
- The history migration preserves existing rows and receives the device-migration review and replay before shipping.

## Consequences

Device backup includes mirror photos before accounts exist; later account photo backup requires its own sync and consent design. The user can correct a day's record by overwriting it. History supports repeat avoidance without changing the catalog-only recommendation boundary. A future account can link the row through `localProfileId` without an outbox or sync engine now.
