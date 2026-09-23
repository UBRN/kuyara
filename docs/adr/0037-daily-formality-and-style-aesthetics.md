# ADR 0037: Daily formality and style aesthetics

Status: Accepted (2026-09-23)

## Context

A persistent dress-style default cannot express how someone wants to dress on a particular day. Aesthetic taste can order already-valid catalog looks without becoming a hard filter or a new personal-data category in analytics.

## Decision

The profile keeps `dressStyle` as its required `casual | smart | formal` default. Its Phase 4 migration adds `style_aesthetics TEXT NOT NULL DEFAULT '[]'`, a JSON array of at most three identifiers from `minimal | classic | sporty | streetwear | relaxed`. The SQLite mapper rejects unknown identifiers and stores the array sorted. The closed enum belongs in `packages/contracts` because it crosses to the Worker on `/v2/ai/recommend` (ADR 0039). A static domain table maps each of the twelve archetypes to its aesthetic affinities. Valid options are stable-sorted by affinity count, highest first, with composition order breaking ties. The deterministic fallback uses the same order. Aesthetics exclude nothing. The sorted list is one low-cardinality field in device cache identity and the Worker cache key, with at most 26 distinct values including empty.

The Phase 4 migration also adds `morning_sheet_enabled INTEGER NOT NULL DEFAULT 1` to the profile and creates `dressing_day_choices`. Migration numbers are assigned in ship order; phases sharing a binary share one migration. The table has `id TEXT` as a client UUID v4 primary key, `local_profile_id TEXT NOT NULL` as a profile foreign key, `day_key TEXT NOT NULL`, checked `formality` (`casual | smart | formal`), checked `source` (`morning | chip | plan | random`), required `created_at` and `updated_at`, nullable `deleted_at`, and `UNIQUE (local_profile_id, day_key)`. The key is the existing dressing-day key: a bare `YYYY-MM-DD` from 04:00 to 18:00 and that date plus `:evening` from 18:00 through 04:00 the next morning. The row's formality wins when present; otherwise the profile's `dress_style` resolves it. Only the resolved value enters the recommendation cache identity and the existing `dressStyle` AI request field. The stored enum stays `casual | smart | formal`; Relaxed, Sharp and Formal are presentation labels.

On the first open of a bare-date dressing day, the dismissible native sheet is offered only when no row exists for that key and the Settings switch is enabled. It asks "How do you want to dress today?" over the previous recommendation. Relaxed, Sharp and Formal are visible; More reveals the rest of the closed list. Its answer writes source `morning`. There is no second sheet at the 18:00 evening key. A chip row under Today's title upserts the bare-date row with source `chip` before 18:00 or the `:evening` row afterward. The morning look remains in history until the user explicitly records another through "Wore this today". A bottom "Plan tomorrow" row names tomorrow's weekday and date and writes tomorrow's bare-date key with source `plan` through the same sheet.

Dismissing through "Continue without choosing" presents a system alert. Its blue filled default is "Choose a style" and its red dim choice is "Continue without choosing". Continuing stores a random formality with source `random`, so the sheet does not return for that day and the chip shows the choice. AI and the deterministic engine still run. The sheet can reopen from the chip row. All copy is localized as whole sentences.

## Red lines

- Aesthetics and daily formality never turn valid candidates into invalid ones or introduce an occasion or age proxy.
- No new wire formality enum or free-form taste text is introduced.
- The evening key never prompts a second time merely because the clock reached 18:00.
- No second day clock or durable "sheet shown" flag is introduced; the row's presence is the gate.
- The chosen morning look is not erased from outfit history by a later chip answer.

## Risk accepted

- Chip changes do not count against the five daily AI regenerations. The extra provider quota exposure is accepted and remains under Worker limits.

## Consequences

The danger role also marks the non-destructive, quality-reducing continuation; its words and emphasis explain the choice. A soft aesthetic tie-break may have little visible effect when weather constraints leave few valid looks, while protecting the three-outfit guarantee. The persisted recommendation context and Worker cache key gain one low-cardinality sorted aesthetics field and use resolved daily formality. Analytics keeps `dress_style` as the scalar resolved formality and measures no aesthetics. A profile default change, aesthetic change or daily answer change is a generation trigger; a birth date or display-name change is not.
