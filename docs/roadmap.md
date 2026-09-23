# kuyara roadmap

The [product decisions](product-decisions.md) and [ADRs](adr/) define the approved behavior. [Current status](current-status.md) records what is implemented and verified. A phase starts with a mockup approval, then a Goal, then implementation. Mockup sessions begin with phases 1 and 4.

## Phases

| Phase | Scope | Status | Open item beside the phase |
| --- | --- | --- | --- |
| 1. Today | Header, AI badge, two insights, alternatives, outfit action and attribution placement | Planned | Build 14 App Review outcome |
| 2. Settings and store rows | Root order, Service providers, sharing, rating and brand emphasis | Planned | App Privacy answer set before submission |
| 3. Name and profile cleanup | Optional name, one-time prompt, location removal and migration 17 | Planned | Independent migration review at implementation |
| 4. Daily style and loading | Aesthetics, morning sheet, formality chips, loading and plan tomorrow | Planned | Apple Intelligence measurement on eligible hardware |
| 5. Colour and history | Quick-add colour, outfit history, mirror photo and migration 18 | Planned | Choose repeat-avoidance horizon at implementation (default seven days) |
| 6. Silhouettes and suggested colour | Approved silhouette redraw and closed catalog colorways | Planned | Approve any ADR 0025 vocabulary extension |
| 7. Manual mix-and-match | Catalog-piece swaps on outfit detail | Planned | Complete phase 6 drawings first |
| 8. Onboarding walkthrough | Walkthrough for new and existing users with one-time gate | Planned | Approve design details in its own session |
| 9. Optional accounts | Supabase Auth, sync and account deletion | Planned | Separate accounts ADR and consent decisions |

Other release and verification items remain open: the iOS 27 SDK build requirement before April 2027; Android verification when the owner gives the go-ahead; N2 background execution and delivery on a compatible device; and the App Privacy answer set and build 14 review noted above. See [release state and known gaps](current-status.md#release-state).

## Decision log

Every decision below was approved on 2026-09-23. Each row names the repository documents that carry it; this log tracks placement, not a second product specification.

| ID | Decision in one clause | Documents |
| --- | --- | --- |
| A1 | Today uses a one-line dated weather header and small archetype label | [product](product-decisions.md), [ADR 0021](adr/0021-direction-e-a-visual-first-design-language.md), [ADR 0027](adr/0027-the-app-shell-and-its-three-tabs.md) |
| A2 | AI provenance becomes a prominent filled badge | [product](product-decisions.md), [ADR 0034](adr/0034-on-device-ai-selection-through-apple-foundation-models.md), [design language](design/design-language.md) |
| A3 | Today removes requirement-rationale copy | [product](product-decisions.md), [ADR 0026](adr/0026-the-recommendation-detail-surface.md) |
| A4 | Today has two bounded insight lines | [product](product-decisions.md), [ADR 0032](adr/0032-local-weather-alert-rules.md) |
| A5 | AI may supply one validated insight sentence | [AGENTS](../AGENTS.md), [product](product-decisions.md), [ADR 0007](adr/0007-ai-selects-precomposed-outfits.md), [architecture](architecture.md) |
| A6 | Alternative outfits is the overview label | [product](product-decisions.md) |
| A7 | Exhausted distinct outfit pools hide the action | [product](product-decisions.md), [status](current-status.md) |
| A8 | Today uses primary body insight copy and a bold title | [ADR 0021](adr/0021-direction-e-a-visual-first-design-language.md), [design language](design/design-language.md) |
| A9 | Weather attribution is reachable only in Settings | [product](product-decisions.md), [ADR 0002](adr/0002-real-weather-provider-chain.md) |
| A10 | Plan tomorrow stores the next day answer | [product](product-decisions.md), [ADR 0037](adr/0037-daily-formality-and-style-aesthetics.md) |
| B1 | Settings uses five ordered groups | [product](product-decisions.md), [ADR 0030](adr/0030-settings-as-a-native-grouped-list.md) |
| B2 | Service providers combines AI and weather status | [AGENTS](../AGENTS.md), [ADR 0030](adr/0030-settings-as-a-native-grouped-list.md), [ADR 0034](adr/0034-on-device-ai-selection-through-apple-foundation-models.md) |
| B3 | Share and Rate open platform surfaces | [product](product-decisions.md), [ADR 0030](adr/0030-settings-as-a-native-grouped-list.md) |
| B4 | App-owned kuyara text receives display-role brand emphasis | [visual identity](design/visual-identity.md), [ADR 0030](adr/0030-settings-as-a-native-grouped-list.md) |
| B5 | Temperature unit follows device locale | [product](product-decisions.md) |
| C1 | Optional local display name uses a versioned prompt gate | [ADR 0036](adr/0036-display-name-and-one-time-prompt-gate.md), [architecture](architecture.md), [taxonomy](analytics-taxonomy.md) |
| C2 | Profile removes its location row | [product](product-decisions.md), [ADR 0028](adr/0028-the-profile-tab-and-the-list-row-anatomy.md) |
| C3 | Migration 17 receives independent review | [ADR 0036](adr/0036-display-name-and-one-time-prompt-gate.md), [architecture](architecture.md) |
| D1 | Persistent aesthetics and daily formality reorder valid outfits | [ADR 0031](adr/0031-dress-style-is-the-formality-signal.md), [ADR 0037](adr/0037-daily-formality-and-style-aesthetics.md), [architecture](architecture.md) |
| D2 | One dismissible morning sheet and chip row set the day's answer | [product](product-decisions.md), [ADR 0037](adr/0037-daily-formality-and-style-aesthetics.md) |
| D3 | Continuing without a choice uses the red quality-warning action | [ADR 0010](adr/0010-status-colours-destructive-variant-and-defined-borders.md), [ADR 0037](adr/0037-daily-formality-and-style-aesthetics.md) |
| D4 | First-day loading fills a garment board and allows skip | [product](product-decisions.md), [ADR 0020](adr/0020-rewriting-the-motion-law.md), [ADR 0021](adr/0021-direction-e-a-visual-first-design-language.md) |
| D5 | The app makes no Reduced Motion support claim | [AGENTS](../AGENTS.md), [ADR 0020](adr/0020-rewriting-the-motion-law.md) |
| D6 | Plan tomorrow ships with daily style | [product](product-decisions.md), [ADR 0037](adr/0037-daily-formality-and-style-aesthetics.md) |
| E1 | Quick-add selects a closed colour family | [product](product-decisions.md), [ADR 0026](adr/0026-the-recommendation-detail-surface.md) |
| E2 | One daily outfit and optional mirror photo enter history | [ADR 0038](adr/0038-outfit-history.md), [architecture](architecture.md), [taxonomy](analytics-taxonomy.md) |
| F1 | Garment silhouettes become more realistic within approved vocabulary | [product](product-decisions.md), [ADR 0025](adr/0025-the-garment-board-composition-rule.md) |
| F2 | Catalog colorways suggest quick-add colour | [product](product-decisions.md), [ADR 0007](adr/0007-ai-selects-precomposed-outfits.md) |
| G1 | Manual catalog swaps allow unusual combinations with a note | [product](product-decisions.md), [ADR 0021](adr/0021-direction-e-a-visual-first-design-language.md), [ADR 0026](adr/0026-the-recommendation-detail-surface.md) |
| H1 | New and existing users get a one-time walkthrough | [ADR 0036](adr/0036-display-name-and-one-time-prompt-gate.md) |
| I1 | Optional native-token accounts preserve local profile authority | [product](product-decisions.md), [architecture](architecture.md) |
| I2 | Profile completion is dismissible and members gain sync benefits | [product](product-decisions.md) |
| I3 | New records stay sync-ready without building a sync engine | [architecture](architecture.md), [ADR 0038](adr/0038-outfit-history.md) |
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
