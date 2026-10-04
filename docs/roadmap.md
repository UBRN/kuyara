# kuyara roadmap

The [product decisions](product-decisions.md) and [ADRs](adr/) define the approved behavior. [Current status](current-status.md) records what is implemented and verified. A phase starts with a mockup approval, then a milestone, then implementation. Mockup sessions begin with phases 1 and 4.

## Phases

| Phase | Scope | Status |
| --- | --- | --- |
| 1. Today | Weather title, AI badge, one insight, alternatives, re-ask action and attribution placement | Shipped in build 15 |
| 2. Settings and store rows | Root order, Service providers, sharing, rating and brand emphasis | Implemented and Simulator verified |
| 3. Name and profile cleanup | Optional name, one-time prompt, location removal and the phase's migration | Implemented and Simulator verified |
| 4. Daily style and loading | Aesthetics, morning and evening sheets, first-generation runway and Today pill removal | Shipped in build 15 |
| 5. Colour and history | Outfit history and garment edit sheet shipped in build 15; wider Closet palette, patterns, migration 20 and camera capture implemented for build 16 | Implemented for build 16 |
| 6. Silhouettes and suggested colour | Ink-edge silhouettes, eight new drawings and 31-colour catalog colorways | Shipped in build 15 |
| 7. Manual mix-and-match | Catalog-piece swaps on outfit detail: row Change and picker, tap and swipe on the board; 7b: the tapped piece grows in place and changes by swipe or the candidate strip under the board; 7c: a mid or outer layer taken off or added, finishing touches taken off and added, and composing the rest of an outfit around up to three chosen pieces (members only, hidden until accounts open) | Implemented for build 16; gesture evidence is Simulator-only. 7b implemented on main for build 17; its Simulator walkthrough passed after the reopened-board and drag-start fixes. 7c implemented on main for the next release; its Simulator walkthrough passed, the members-only compose gate checked with the account screens switched on locally |
| 8. Onboarding walkthrough | Nine-step coach-mark tour over the real screens for new and existing users, its one-time gate (migration 22) and the Settings, Help row | Implemented for build 16; migration replay and Simulator walkthrough passed |
| 9. Optional accounts | Apple and Google sign-in through Supabase Auth, Closet and History sync with the server-arrival conflict rule, account deletion with Apple token revocation and the one members-only feature, composing around chosen pieces ([ADR 0041](adr/0041-optional-accounts.md)) | Built and switched off: live Supabase and Apple adapters, consent-gated sync, the sync consent sheet and records, deletion and the daily keep-alive, migration 28; Google waits for its licence. The schema is applied to the project and the Worker part is not deployed. Public accounts wait for the KVKK transfer contract, the open items in current status and device evidence; Supabase stays on the Free plan |

## Milestones and release scope

| Milestone | Scope | Status |
| --- | --- | --- |
| A | Today layout, AI badges, the first morning-sheet step and the approved visual refinements | Shipped in build 15 |
| B | First-generation loading runway | Shipped in build 15 |
| C | “Ask the stylist again” and the approved outfit timing model: C1 and C2 domain (eb35988, caf5c08), migration 19 (1763109), and the C3 re-ask sheet (O2-O4) | Shipped in build 15 |
| Buttons | Capsule roles, toolbar save, press feedback and dark tonal fill (O5) | Shipped in build 15 |
| C3 | Re-ask sheet with day type and Now or Later (O2-O4) | Shipped in build 15 |
| Runway | Neutral five-slot drafts, condition fields and piece-by-piece dressing (O1, O17) | Shipped in build 15 |
| Phase 6 | Ink-edge silhouettes, eight new drawings, 31-colour harmony and one catalog version bump (O15) | Shipped in build 15 |
| Phase 5B | Detail sheet and garment rows, ownership match, “Wore this today” and history (O6, O7); wide palette, second colour, patterns and migration 20 (O8) implemented for build 16 (P5) | O6 and O7 shipped in build 15; O8 implemented for build 16 |
| Closet | Open rack, six category counts, category tabs and owned/wanted sections (O9) | Shipped in build 15 |
| Add a piece | Visual form: preview stage, owned and wanted cards, illustrated type picker, toolbar save pair and photo-library import; in-app camera capture implemented for build 16 (O10, P5) | Base form shipped in build 15; camera implemented for build 16 |
| Worker badge | Animated multicolour `sparkles` (O11) | Shipped in build 15 |
| Accessibility and wave 2 | Easier to see switch (O13); cards, rows, back, name, weather and onboarding (O14) | O14 shipped in build 15; O13 implemented for build 16 with migration 21, device replay and Simulator evidence |
| Sheet close button | The glass close button on the name, day-type (both steps), ask-again and piece-edit sheets draws a clipped glyph instead of an xmark on device and Simulator; the fix gives it an explicit `xmark` image and circle shape like the confirm button, keeps `role="close"`, and adds a close-button check to the Simulator walkthrough | Shipped to build 15 installs by the production EAS Update from commit `7b5b4f8` ([procedure](testing.md#javascript-only-fix-for-the-live-version)) |
| Build 15 | Completed build 15 milestones, including A and B | On the App Store (`READY_FOR_SALE`) |
| Build 16 | Phase 5 colour and camera work; O13 Easier to see; Phase 7 manual mix; Phase 8 walkthrough; consent and analytics copy, and the Worker free-model guard | Submitted for App Review on 28 September 2026 (version 0.1.20260928) |
| Build 17 | Illustrated garments, shareable outfit card, History diary and the account screens behind a switch that is off (schema 23) | Approved (version 0.1.20261002) |
| Build 18 | Schema 25, built from `cdead67e` | On the App Store (`READY_FOR_SALE`), phased release started 3 October 2026 (version 0.1.20261003) |
| Build 19 | Settings unit choices (schema 27), morning and evening question switch, re-ask past the shared cache, recommendation timing and UI fixes | Submitted for App Review on 4 October 2026 (version 0.1.20261005) |
| pnpm 12 | pnpm 12.6.0 replaces 11.18.0 in `packageManager` and both `eas.json` profiles. The lockfile keeps every resolved package and now opens with pnpm's own version record; `pnpm-workspace.yaml` needed no change. `pnpm check`, the component suite, Expo Doctor and a local Simulator build pass with it. It never rides an `eas update`, because the `appVersion` runtime policy lets an update reach installs without a native check | On main; first ships in build 16, never via an update |

Release evidence:

- Android verification, once Android work starts.
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
| A4 | Today has one insight line; deterministic weather rules live in weather domain | [product](product-decisions.md), [ADR 0032](adr/0032-local-weather-alert-rules.md), [architecture](architecture.md) |
| A5 | AI may supply one validated insight sentence; AR7 gives it a v2 route | [product](product-decisions.md), [ADR 0039](adr/0039-ai-v2-route-and-the-validated-insight-sentence.md), [architecture](architecture.md) |
| A6 | Alternative outfits is the overview label | [product](product-decisions.md) |
| A7 | A pool with no other valid option hides the re-ask; AR9 derives the flag | [product](product-decisions.md), [architecture](architecture.md), [status](current-status.md) |
| A8 | Today uses primary body insight copy and a bold title | [ADR 0021](adr/0021-direction-e-a-visual-first-design-language.md), [design language](design/design-language.md) |
| A9 | Weather attribution is reachable only in Settings | [product](product-decisions.md), [ADR 0002](adr/0002-real-weather-provider-chain.md) |
| A10 | Today has no row for planning another day | [product](product-decisions.md), [ADR 0037](adr/0037-daily-formality-and-style-aesthetics.md) |
| B1 | Settings uses five ordered groups | [product](product-decisions.md), [ADR 0030](adr/0030-settings-as-a-native-grouped-list.md) |
| B2 | Service providers combines AI and weather status; AR11 reads the stored snapshot | [ADR 0030](adr/0030-settings-as-a-native-grouped-list.md), [ADR 0034](adr/0034-on-device-ai-selection-through-apple-foundation-models.md) |
| B3 | Share and Rate open platform surfaces | [product](product-decisions.md), [ADR 0030](adr/0030-settings-as-a-native-grouped-list.md) |
| B4 | App-owned kuyara text receives display-role brand emphasis | [visual identity](design/visual-identity.md), [ADR 0030](adr/0030-settings-as-a-native-grouped-list.md) |
| B5 | Temperature unit follows device locale; AR14 keeps storage in Celsius | [product](product-decisions.md), [architecture](architecture.md) |
| C1 | Optional local display name uses a versioned prompt gate; AR5 and AR12 keep it device-only | [ADR 0036](adr/0036-display-name-and-one-time-prompt-gate.md), [architecture](architecture.md), [taxonomy](analytics-taxonomy.md) |
| C2 | Profile removes its location row | [product](product-decisions.md), [ADR 0028](adr/0028-the-profile-tab-and-the-list-row-anatomy.md) |
| C3 | The name and prompt-gate fields are in migration 17; the migration receives independent review | [ADR 0036](adr/0036-display-name-and-one-time-prompt-gate.md), [architecture](architecture.md) |
| D1 | Persistent aesthetics and daily formality reorder valid outfits; AR2, AR3 and AR16 define storage and measurement | [ADR 0031](adr/0031-dress-style-is-the-formality-signal.md), [ADR 0037](adr/0037-daily-formality-and-style-aesthetics.md), [architecture](architecture.md) |
| D2 | Morning and evening sheets set day type; re-ask changes it during the day; AR1, AR2 and AR15 define key and allowance | [product](product-decisions.md), [ADR 0037](adr/0037-daily-formality-and-style-aesthetics.md) |
| D3 | Dismissing the day-type sheet uses the profile dress style, with no alert or random formality | [product](product-decisions.md), [ADR 0037](adr/0037-daily-formality-and-style-aesthetics.md) |
| D4 | First-day loading fills a garment board and allows skip; AR9 derives overlay state | [product](product-decisions.md), [architecture](architecture.md), [ADR 0020](adr/0020-rewriting-the-motion-law.md) |
| D5 | The app does not read the OS motion preference | [ADR 0020](adr/0020-rewriting-the-motion-law.md) |
| D6 | Morning and evening sheets write the current dressing-day answer | [product](product-decisions.md), [ADR 0037](adr/0037-daily-formality-and-style-aesthetics.md) |
| E1 | Build 16 detail edit adds 33 colours, a system picker, second colour and 14 pattern options | [product](product-decisions.md), [ADR 0026](adr/0026-the-recommendation-detail-surface.md) |
| E2 | One daily outfit and optional mirror photo enter history; AR6, AR13 and AR16 define storage and boundaries | [ADR 0038](adr/0038-outfit-history.md), [architecture](architecture.md), [taxonomy](analytics-taxonomy.md) |
| F1 | Garment silhouettes become more realistic within approved vocabulary | [product](product-decisions.md), [ADR 0025](adr/0025-the-garment-board-composition-rule.md) |
| F2 | Catalog colorways suggest quick-add colour | [product](product-decisions.md), [ADR 0007](adr/0007-ai-selects-precomposed-outfits.md) |
| G1 | Manual catalog swaps allow unusual combinations with a note; AR10 keeps them transient until worn | [product](product-decisions.md), [ADR 0021](adr/0021-direction-e-a-visual-first-design-language.md), [ADR 0026](adr/0026-the-recommendation-detail-surface.md) |
| H1 | New and existing users get a one-time walkthrough; AR5 gives it a separate version column | [ADR 0036](adr/0036-display-name-and-one-time-prompt-gate.md) |
| I1 | Optional native-token accounts preserve local profile authority | [ADR 0041](adr/0041-optional-accounts.md), [product](product-decisions.md), [architecture](architecture.md) |
| I2 | Profile completion is dismissible and members gain sync benefits | [ADR 0041](adr/0041-optional-accounts.md), [product](product-decisions.md) |
| I3 | New records carry the sync-ready fields that AR13 specifies, and ADR 0041 defines the sync that uses them | [ADR 0041](adr/0041-optional-accounts.md), [architecture](architecture.md), [ADR 0038](adr/0038-outfit-history.md) |
| I4 | Sending coarse profile metadata to Worker AI remains deferred | [roadmap](roadmap.md), [ADR 0041](adr/0041-optional-accounts.md), Turkish vault note |
| J1 | This roadmap and its Turkish vault twin carry the plan | [status](current-status.md) |
| J2 | New localized copy uses whole sentences | [product](product-decisions.md) |
| J3 | Nine phases follow approved mockups and milestones | [roadmap](roadmap.md) |
| J4 | ADR decisions state current truth and rejected approaches as red lines | Project documentation rule |

## Lessons index

- [Current release and verification gaps](current-status.md#known-issues-and-manual-verification-gaps)
- [ADR 0002 attribution and quota red lines](adr/0002-real-weather-provider-chain.md)
- [ADR 0020 motion red lines](adr/0020-rewriting-the-motion-law.md)
- [ADR 0034 AI selection red lines](adr/0034-on-device-ai-selection-through-apple-foundation-models.md#red-lines)
