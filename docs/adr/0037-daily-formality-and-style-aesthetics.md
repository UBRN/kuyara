# ADR 0037: Daily formality and style aesthetics

## Context

A persistent dress-style default cannot express how someone wants to dress on a particular day. Aesthetic taste can order already-valid catalog looks without becoming a hard filter or a new personal-data category in analytics.

## Decision

The profile keeps `dressStyle` as its required `casual | smart | formal` default. It also stores up to three `styleAesthetics` from the closed list `minimal | classic | sporty | streetwear | relaxed`. Aesthetics are sorted identifiers in AI input and the Worker cache key. They act only as a soft tie-break after weather validity and formality, in both AI ordering and the deterministic fallback. They never exclude an option. Migration 17 adds the profile columns while preserving existing rows. The day's formality answer overrides only that dressing-day key using the existing three-value permutation table; no new formality enum crosses the wire. The answer is stored per day key.

On the first open of a dressing day at the 04:00 boundary, a dismissible native bottom sheet asks "How do you want to dress today?" over the previous recommendation. Relaxed, Sharp and Formal are visible; More reveals the rest of the closed list. There is no second sheet at the 18:00 evening key. A Settings switch disables this prompt and resolves from the profile default. A chip row under Today's title lets the user answer again. Before 18:00 the chip regenerates the day; after 18:00 it plans the evening key. The morning look remains in history. A bottom "Plan tomorrow" row names tomorrow's weekday and date and opens the same sheet for that next dressing-day key.

Dismissing through "Continue without choosing" presents a system alert. Its blue filled default is "Choose a style" and its red dim choice is "Continue without choosing". Continuing picks random formality and still runs AI and the deterministic engine. The sheet can reopen from the chip row. All copy is localized as whole sentences.

## Red lines

- Aesthetics and daily formality never turn valid candidates into invalid ones or introduce an occasion or age proxy.
- No new wire formality enum or free-form taste text is introduced.
- The evening key never prompts a second time merely because the clock reached 18:00.
- The chosen morning look is not erased from outfit history by a later chip answer.

## Risk accepted

- The red danger role marks a quality-reducing, non-destructive continuation. This trades against the previous destructive-only use of ADR 0010.
- Chip changes do not count against the five daily AI regenerations. The extra provider quota exposure is accepted and remains under Worker limits.
- A soft aesthetic tie-break may have little visible effect when weather constraints leave few valid looks. It remains soft to protect the three-outfit guarantee.

## Consequences

The persisted recommendation context and Worker cache key gain one low-cardinality sorted aesthetics field and use resolved daily formality. Analytics keeps `dress_style` as the scalar resolved formality and measures no aesthetics. A profile default change, aesthetic change or daily answer change is a generation trigger; a birth date or display-name change is not.
