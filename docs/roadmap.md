# kuyara roadmap

The [product decisions](product-decisions.md) and [ADRs](adr/) define the approved behavior. [Current status](current-status.md) records what is implemented and verified. A phase starts with a mockup approval, then a Goal, then implementation. Mockup sessions begin with phases 1 and 4.

## Phases

| Phase | Scope | Status |
| --- | --- | --- |
| 1. Today | Header, AI badge, two insights, alternatives, outfit action and attribution placement | Goal A landed on main; implemented and Simulator verified |
| 2. Settings and store rows | Root order, Service providers, sharing, rating and brand emphasis | Implemented and Simulator verified |
| 3. Name and profile cleanup | Optional name, one-time prompt, location removal and the phase's migration | Implemented and Simulator verified |
| 4. Daily style and loading | Aesthetics, morning sheet, loading and plan tomorrow; Today pill removal approved | Goals A and B landed on main; implemented controls are Simulator verified; the approved redesign is in the build 15 goals below |
| 5. Colour and history | Outfit history, mirror photo, garment edit sheet, 33-colour palette, patterns and migration 20 | Planned |
| 6. Silhouettes and suggested colour | Ink-edge silhouettes, eight new drawings and 31-colour catalog colorways | Planned |
| 7. Manual mix-and-match | Catalog-piece swaps on outfit detail | Planned |
| 8. Onboarding walkthrough | Walkthrough for new and existing users with one-time gate | Planned |
| 9. Optional accounts | Supabase Auth, sync and account deletion | Planned |

## Goals and build 15 scope

| Goal | Scope | Status |
| --- | --- | --- |
| A | Today layout, AI badges, the first morning-sheet step and the approved visual refinements | Landed on main |
| B | First-generation loading runway | Landed on main |
| C | “Ask the stylist again” and the approved outfit timing model: C1 and C2 domain landed (c330eb0, 53e6246), migration 19 landed (1fc733a) | C3 remains |
| Buttons | Capsule roles, toolbar save, press feedback and dark tonal fill (O5) | Approved for build 15 |
| C3 | Re-ask sheet with day type and Now or Later (O2-O4) | Approved for build 15 |
| Runway | Neutral five-slot drafts, condition fields and piece-by-piece dressing (O1, O17) | Approved for build 15 |
| Phase 6 | Ink-edge silhouettes, eight new drawings, 31-colour harmony and one catalog version bump (O15) | Approved for build 15 |
| Phase 5B | Detail sheet and garment rows, ownership match, “Wore this today” and history (O6, O7); the wide palette, second colour, patterns and migration 20 (O8) ship in build 16 (P5) | O6 and O7 landed on main (6d70cdb) |
| Closet | Open rack, six category counts, category tabs and owned/wanted sections (O9) | Approved for build 15 |
| Add a piece | Visual form: preview stage, owned and wanted cards, illustrated type picker, usual colours, the toolbar save pair and photo-library import; in-app camera capture ships in build 16 (O10, P5) | Approved for build 15 |
| Worker badge | Animated multicolour `sparkles` (O11) | Approved for build 15 |
| Accessibility and wave 2 | Easier to see switch (O13); cards, rows, back, name, weather and onboarding (O14) | Approved for build 15 |
| Sheet close button | The glass close button on the name, day-type (both steps), ask-again and piece-edit sheets draws a clipped glyph instead of an xmark on device and Simulator; the fix gives it an explicit `xmark` image and circle shape like the confirm button, keeps `role="close"`, and adds a close-button check to the Simulator tour | Fixed in code; reaches build 15 installs through `eas update --channel production` once build 15 is on the store |
| Build 15 | All approved Goals above, plus landed A and B; every automated, independent-review, migration, native and Simulator release gate applies | No date promised |
| pnpm 12 | Separate major upgrade from the pnpm 11.18.0 pinned since the scaffold: `packageManager` and both `eas.json` profiles move together, `pnpm install` regenerates the lockfile, `pnpm-workspace.yaml` passes pnpm 12's unknown-setting check, then `pnpm check`, the component suite and one local native build. It never rides an `eas update`, because the `appVersion` runtime policy lets an update reach installs without a native check | Build 16 maintenance; starts after the build 15 close-button update ships |

Release evidence:

- Privacy check before build 15.
- iOS 27 SDK build requirement before April 2027.
- Android verification when the owner gives the go-ahead.
- Apple Intelligence measurement on eligible hardware.
- N2 background execution and delivery verification on a compatible device.

See [release state and known gaps](current-status.md#release-state).

## Decision log

Every decision below, including AR1 through AR16, was approved on 2026-09-23. Each row names the repository documents that carry it; this log tracks placement, not a second product specification.

| ID | Decision in one clause | Documents |
| --- | --- | --- |
| A1 | Today uses a one-line dated weather header and small archetype label | [product](product-decisions.md), [ADR 0021](adr/0021-direction-e-a-visual-first-design-language.md), [ADR 0027](adr/0027-the-app-shell-and-its-three-tabs.md) |
| A2 | AI provenance becomes a prominent filled badge | [product](product-decisions.md), [ADR 0034](adr/0034-on-device-ai-selection-through-apple-foundation-models.md), [design language](design/design-language.md) |
| A3 | Today removes requirement-rationale copy | [product](product-decisions.md), [ADR 0026](adr/0026-the-recommendation-detail-surface.md) |
| A4 | Today has two bounded insight lines; AR8 places their rules in weather domain | [product](product-decisions.md), [ADR 0032](adr/0032-local-weather-alert-rules.md), [architecture](architecture.md) |
| A5 | AI may supply one validated insight sentence; AR7 gives it a v2 route | [AGENTS](../AGENTS.md), [product](product-decisions.md), [ADR 0039](adr/0039-ai-v2-route-and-the-validated-insight-sentence.md), [architecture](architecture.md) |
| A6 | Alternative outfits is the overview label | [product](product-decisions.md) |
| A7 | Exhausted distinct outfit pools hide the action; AR9 derives the flag | [product](product-decisions.md), [architecture](architecture.md), [status](current-status.md) |
| A8 | Today uses primary body insight copy and a bold title | [ADR 0021](adr/0021-direction-e-a-visual-first-design-language.md), [design language](design/design-language.md) |
| A9 | Weather attribution is reachable only in Settings | [product](product-decisions.md), [ADR 0002](adr/0002-real-weather-provider-chain.md) |
| A10 | Plan tomorrow stores the next day answer; AR1 uses the existing day key | [product](product-decisions.md), [ADR 0037](adr/0037-daily-formality-and-style-aesthetics.md) |
| B1 | Settings uses five ordered groups | [product](product-decisions.md), [ADR 0030](adr/0030-settings-as-a-native-grouped-list.md) |
| B2 | Service providers combines AI and weather status; AR11 reads the stored snapshot | [AGENTS](../AGENTS.md), [ADR 0030](adr/0030-settings-as-a-native-grouped-list.md), [ADR 0034](adr/0034-on-device-ai-selection-through-apple-foundation-models.md) |
| B3 | Share and Rate open platform surfaces | [product](product-decisions.md), [ADR 0030](adr/0030-settings-as-a-native-grouped-list.md) |
| B4 | App-owned kuyara text receives display-role brand emphasis | [visual identity](design/visual-identity.md), [ADR 0030](adr/0030-settings-as-a-native-grouped-list.md) |
| B5 | Temperature unit follows device locale; AR14 keeps storage in Celsius | [product](product-decisions.md), [architecture](architecture.md) |
| C1 | Optional local display name uses a versioned prompt gate; AR5 and AR12 keep it device-only | [ADR 0036](adr/0036-display-name-and-one-time-prompt-gate.md), [architecture](architecture.md), [taxonomy](analytics-taxonomy.md) |
| C2 | Profile removes its location row | [product](product-decisions.md), [ADR 0028](adr/0028-the-profile-tab-and-the-list-row-anatomy.md) |
| C3 | The name and prompt-gate fields are in migration 17; the migration receives independent review | [ADR 0036](adr/0036-display-name-and-one-time-prompt-gate.md), [architecture](architecture.md) |
| D1 | Persistent aesthetics and daily formality reorder valid outfits; AR2, AR3 and AR16 define storage and measurement | [ADR 0031](adr/0031-dress-style-is-the-formality-signal.md), [ADR 0037](adr/0037-daily-formality-and-style-aesthetics.md), [architecture](architecture.md) |
| D2 | Morning and evening sheets set day type; re-ask changes it during the day; AR1, AR2 and AR15 define key and allowance | [product](product-decisions.md), [ADR 0037](adr/0037-daily-formality-and-style-aesthetics.md) |
| D3 | Continuing without a choice uses the red quality-warning action | [ADR 0010](adr/0010-status-colours-destructive-variant-and-defined-borders.md), [ADR 0037](adr/0037-daily-formality-and-style-aesthetics.md) |
| D4 | First-day loading fills a garment board and allows skip; AR9 derives overlay state | [product](product-decisions.md), [architecture](architecture.md), [ADR 0020](adr/0020-rewriting-the-motion-law.md) |
| D5 | The app does not read the OS motion preference | [AGENTS](../AGENTS.md), [ADR 0020](adr/0020-rewriting-the-motion-law.md) |
| D6 | Plan tomorrow ships with daily style | [product](product-decisions.md), [ADR 0037](adr/0037-daily-formality-and-style-aesthetics.md) |
| E1 | Detail edit uses 33 colours, a system picker, second colour and 14 pattern options | [product](product-decisions.md), [ADR 0026](adr/0026-the-recommendation-detail-surface.md) |
| E2 | One daily outfit and optional mirror photo enter history; AR6, AR13 and AR16 define storage and boundaries | [ADR 0038](adr/0038-outfit-history.md), [architecture](architecture.md), [taxonomy](analytics-taxonomy.md) |
| F1 | Garment silhouettes become more realistic within approved vocabulary | [product](product-decisions.md), [ADR 0025](adr/0025-the-garment-board-composition-rule.md) |
| F2 | Catalog colorways suggest quick-add colour | [product](product-decisions.md), [ADR 0007](adr/0007-ai-selects-precomposed-outfits.md) |
| G1 | Manual catalog swaps allow unusual combinations with a note; AR10 keeps them transient until worn | [product](product-decisions.md), [ADR 0021](adr/0021-direction-e-a-visual-first-design-language.md), [ADR 0026](adr/0026-the-recommendation-detail-surface.md) |
| H1 | New and existing users get a one-time walkthrough; AR5 gives it a separate version column | [ADR 0036](adr/0036-display-name-and-one-time-prompt-gate.md) |
| I1 | Optional native-token accounts preserve local profile authority | [product](product-decisions.md), [architecture](architecture.md) |
| I2 | Profile completion is dismissible and members gain sync benefits | [product](product-decisions.md) |
| I3 | New records stay sync-ready without building a sync engine; AR13 specifies the fields | [architecture](architecture.md), [ADR 0038](adr/0038-outfit-history.md) |
| I4 | Sending coarse profile metadata to Worker AI remains deferred | [roadmap](roadmap.md), Turkish vault note |
| J1 | This roadmap and its Turkish vault twin carry the plan | [AGENTS](../AGENTS.md), [status](current-status.md) |
| J2 | New localized copy uses whole sentences | [product](product-decisions.md) |
| J3 | Nine phases follow approved mockups and Goals | [roadmap](roadmap.md) |
| J4 | ADR decisions state current truth and rejected approaches as red lines | [AGENTS](../AGENTS.md) |

## Lessons index

- [Current release and verification gaps](current-status.md#known-issues-and-manual-verification-gaps)
- [ADR 0002 attribution and quota red lines](adr/0002-real-weather-provider-chain.md)
- [ADR 0020 motion red lines](adr/0020-rewriting-the-motion-law.md)
- [ADR 0034 AI selection red lines](adr/0034-on-device-ai-selection-through-apple-foundation-models.md#red-lines)
