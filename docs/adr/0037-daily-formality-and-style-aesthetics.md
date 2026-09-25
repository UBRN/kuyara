# ADR 0037: Daily formality and style aesthetics

Status: Accepted (2026-09-23)

## Context

A persistent dress-style default cannot express how someone wants to dress on a particular day. Aesthetic taste can order already-valid catalog looks without becoming a hard filter or a new personal-data category in analytics.

## Decision

The profile keeps `dressStyle` as its required `casual | smart | formal` default. Migration 18 adds `style_aesthetics TEXT NOT NULL DEFAULT '[]'`, a JSON array of at most three identifiers from `minimal | classic | sporty | streetwear | relaxed`. The SQLite mapper rejects unknown identifiers and stores the array sorted. The closed enum belongs in `packages/contracts` because it crosses to the Worker on `/v2/ai/recommend` (ADR 0039). A static domain table maps each of the twelve archetypes to its aesthetic affinities. Valid options are stable-sorted by affinity count, highest first, with composition order breaking ties. The deterministic fallback uses the same order. Aesthetics exclude nothing. The sorted list is one low-cardinality field in device cache identity and the Worker cache key, with at most 26 distinct values including empty.

Migration 18 adds `morning_sheet_enabled INTEGER NOT NULL DEFAULT 1` to the profile and creates `dressing_day_choices`. The table has `id TEXT` as a client UUID v4 primary key, `local_profile_id TEXT NOT NULL` as a profile foreign key, `day_key TEXT NOT NULL`, checked `formality` (`casual | smart | formal`), checked `source` (`morning | chip | plan | random`), required `created_at` and `updated_at`, nullable `deleted_at`, and `UNIQUE (local_profile_id, day_key)`. The key is the existing dressing-day key: a bare `YYYY-MM-DD` from 04:00 to 18:00 and that date plus `:evening` from 18:00 through 04:00 the next morning. The row's formality wins when present; otherwise the profile's `dress_style` resolves it. Only the resolved value enters the recommendation cache identity and the existing `dressStyle` AI request field. The stored enum stays `casual | smart | formal`; the English presentation labels are Casual, Smart and Formal, and the Turkish labels are Rahat, Şık and Resmî.

On the first open of a bare-date dressing day, the dismissible native sheet is offered only when no row exists for that key and the Settings switch is enabled. Over the previous recommendation, or over the first wait when there is none and never over an error card, it asks "What kind of day is it?" and offers Casual, Smart and Formal as three drawn tiles in one radio group with the current answer checked; on the day onboarding finishes the checked answer is the setup answer, with one caption saying so. A second gentle step brings forward style preferences (at most three) without turning the sheet into a form; that choice applies to the dressing day only, and lasting changes happen only in Settings. Every day-type and style option has a visual, an SF Symbol or small illustration rather than an emoji in copy, so it reads at a glance. Style preferences are also available in onboarding and Settings > Profile > Style preferences; the Settings values bring choices forward as defaults and do not answer the day's question. A formality answer writes source `morning`. At the first foreground open after the 18:00 evening-key flip, the app offers a second sheet for the evening key, starting empty; morning answers do not carry into it. Today has no day-type pill. During the day, "Ask the stylist again" opens one sheet with the current day type preselected, Now | Later, the warning sentence and a "Choose for now" confirmation. Changing the type writes the active bare-date or `:evening` row with the existing `chip` source before regeneration. The morning look remains in history until the user explicitly records another through "Wore this today". Today has no row for planning another day; source `plan` stays readable for rows already stored.

Dismissing the sheet answers it with the profile dress style, written with source `morning` through the same write an answer makes, so the sheet does not return for that day and no generation starts that the answer would not start. There is no confirmation alert and no random formality; source `random` stays readable for rows already stored. The choice can be changed in the re-ask sheet.

## Red lines

- Aesthetics and daily formality never turn valid candidates into invalid ones or introduce an occasion or age proxy.
- No new wire formality enum or free-form taste text is introduced.
- The evening sheet is offered once on the first foreground open after the 18:00 key flip; it starts empty and never carries the morning answer forward.
- No second day clock or durable "sheet shown" flag is introduced; the row's presence is the gate.
- The chosen morning look is not erased from outfit history by a later re-ask answer.

The dressing-day key is a preference identity, separate from outfit coverage. Coverage begins at the current instant or the saved Later departure and ends at 19:00 for starts from 04:00 to 10:59, 20:00 from 11:00 to 15:59, 22:00 from 16:00 to 17:59, the next 01:00 from 18:00 to 00:59, and 04:00 from 01:00 to 03:59, in the weather snapshot's time zone. The first four hours decide the main outfit. Short later cool spells are optional protection; later cold below 12 °C for two consecutive hours or below 5 °C once is mandatory. A saved departure belongs to the dressing-day key at its own instant. The coverage end is an optional field in the persisted recommendation JSON; it is not part of the cache identity. At the next foreground open after that end, the approved trigger evaluation reselects once. An unanswered evening key has its own pending state and holds automatic selection until the evening sheet's answer. The evening sheet opens with no tile checked.

## Risk accepted

- The re-ask sheet reserves one of five daily AI regenerations before starting the AI chain. The morning and evening answers remain automatic triggers outside that user-requested allowance.

## Consequences

The danger role also marks the non-destructive, quality-reducing continuation; its words and emphasis explain the choice. A soft aesthetic tie-break may have little visible effect when weather constraints leave few valid looks, while protecting the three-outfit guarantee. The persisted recommendation context and Worker cache key gain one low-cardinality sorted aesthetics field and use resolved daily formality. Analytics keeps `dress_style` as the scalar resolved formality and measures no aesthetics. A profile default change, aesthetic change or daily answer change is a generation trigger; a birth date or display-name change is not.
