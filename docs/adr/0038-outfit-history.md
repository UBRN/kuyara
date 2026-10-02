# ADR 0038: Outfit history

Status: Accepted (2026-09-23)

## Context

A recommendation is not evidence that the user wore it. Recording a chosen outfit creates a truthful memory for the reader and a bounded basis for repeat avoidance. Streaks and gamified penalties do not belong in kuyara.

## Decision

"Wore this today" on outfit detail records one outfit per bare-date dressing-day key, overwritable only by that action. The evening can replace the morning record when the user chooses it; a chip answer alone does not. A Profile History row below Closet opens History, a diary of small garment boards, newest first: the latest day stands large under its full date, the look's name and its day type, and earlier days follow two to a row under their month, each spoken with its full date, name and day type. A worn day stores its types and the swatch each piece was drawn in on outfit detail, so History draws the day in the colours the reader saw; it stores no weather, so its board carries no weather glyph. A day without stored colours (every day recorded before migration 24, or one whose colours no longer parse) is drawn in the pieces' natural colourways for a mild day. A day is a record to look at, not a control. On Sunday from 18:00 until the dressing day turns at 04:00 on Monday, History opens with a look back at the seven local days ending that Sunday, above the days: the number of recorded days, how many were dressed for rain, cold or light as read from their pieces' catalog water protection and warmth, and the piece worn on the most days (two or more), drawn in the colour it was worn in most. It is derived on read from the rows and the dressing-day key the application already holds; no summary, table or migration exists, and it reaches no analytics, telemetry or notification. A week without a recorded day shows no summary. The same rows give each owned Closet piece a worn count ([ADR 0029](0029-the-closet-grid.md)). Optional mirror photos are kept with the day. A photo reuses the Wardrobe import, resize, compression, staging and database-first cleanup pipeline under its own managed `kuyara/history/photos/` document segment. The stored path is relative. Missing or corrupt files do not break the list. Photos remain on the device and in device backup.

Migration 19 creates `outfit_history`: `id TEXT` is a client UUID v4 primary key, `local_profile_id TEXT NOT NULL` is a profile foreign key, `day_key TEXT NOT NULL` is the bare date, `outfit_json TEXT NOT NULL` holds catalog garment ids by slot, archetype id, resolved formality and source (`recommended | manual`), `photo_path TEXT` is nullable, `worn_at`, `created_at` and `updated_at` are required, `deleted_at TEXT` is nullable, and `(local_profile_id, day_key)` is unique. Migration 24 adds nullable `piece_colors_json TEXT`: a JSON object from slot to palette swatch id (`{"primary_top":"navy","bottom":"indigo","footwear":"white"}`). A swatch id names the whole colourway a drawing is painted in, because each drawing's second material and hardware are fixed by its garment type. The value is parsed once at the repository boundary against the swatch vocabulary and the day's own slots; anything else reads as no colour and never hides the day. Swatch ids are stored values: new ones may be added, none renamed or removed. A new outfit for the day replaces its colours. The colours are display data and, like the rest of the row, never reach a recommendation, the AI request, analytics or telemetry. Logging a soft-deleted day revives its row. Replacing a day's outfit keeps its mirror photo unless explicitly removed or replaced. Manual mix-and-match writes source `manual` only through "Wore this today"; its temporary swaps do not enter the recommendation cache.

Before AI selection, composition reads the seven most recent valid history rows and excludes candidate outfits whose garment-id set equals a worn set. An invalid row is skipped in History and repeat avoidance; valid rows remain available, and an unreadable database still produces a read error. Seven is a domain constant. If fewer than three candidates remain, it relaxes exclusion oldest first until three are available. History rows never enter the AI request, Worker, analytics or telemetry; the AI input boundary stays unchanged.

Logging or replacing a worn outfit emits no new analytics event. History rows, garment and outfit identities, and mirror photos never enter analytics.

## Red lines

- History is evidence of a user action, never inferred from seeing a recommendation.
- No streak, streak-break warning, penalty, loss framing or fake urgency. The week's look back counts only recorded days and never names a missing day, a goal or a score.
- History and photos never join the AI input. Closet items remain outside recommendation candidates.
- Missing or corrupt photos do not break the history list, and file deletion follows a confirmed database write.
- The history migration preserves existing rows and receives the device-migration review and replay before shipping.

## Consequences

Device backup includes mirror photos before accounts exist; later account photo backup requires its own sync and consent design. The user can correct a day's record by overwriting it. History supports repeat avoidance without changing the catalog-only recommendation boundary. A future account can link the row through `localProfileId` without an outbox or sync engine now.
