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
| 9. Optional accounts | Apple and Google sign-in through Supabase Auth, Closet and History sync with the server-arrival conflict rule, account deletion with Apple token revocation and the one members-only feature, composing around chosen pieces ([ADR 0041](adr/0041-optional-accounts.md)) | Built and switched off: live Supabase and Apple adapters, consent-gated sync, the sync consent sheet and records, deletion and the keep-alive every six hours, migration 28; Google waits for its licence. Both schema files (accounts and hardening) are applied to the project; the Worker code, which also counts members' AI re-asks, is not deployed (the deployed Worker carries an earlier, offline deletion route). Public accounts wait for the KVKK transfer contract, the open items in current status and device evidence; Supabase stays on the Free plan. Planned for build 20, which waits for the KVKK transfer contract rather than shipping without accounts ([path](#accounts-in-build-20)) |
| 10. Temperature colour scale | The Weather daily rows' low-to-high capsules and the hourly temperature line take their colour from one fixed Celsius scale, so a temperature has the same colour on every row and in the hourly line; the track keeps its shared week scale, today's row keeps its now dot, Fahrenheit changes only the numbers, and Easier to see and Increase Contrast switch to a stronger ramp. The stops keep the hues of approved condition and status values; the visual identity, design language and design system docs gain the scale as a third approved gradient use. No contract, migration or Worker change | Mockup option "A with the hourly line on the same scale" adopted on 5 October 2026; planned for build 20 |
| 11. Store page | New App Store screenshots for build 20 in English and Turkish; the live set predates builds 16 to 19 and still shows the line drawings and a Recommended pill that ADR 0021 now forbids | Planned with build 20; frame list, captions and video choice open |
| 12. Website | The landing page rebuilt around an interactive hero in which the visitor changes the temperature and sky and the app's own garment board re-dresses, generated from the app's recommendation rules and drawings; a scroll story of one day; the privacy, support and account-terms pages keep their paths | Concept prototype built; motion, boards, type and hosting open |

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
| Build 20 | The release shown to friends and family: everything on main since build 19 (schema 28), Phase 9 accounts with Apple and Google sign-in, Phase 10, the fixes from the final review below, then Phase 11. It is not submitted before the KVKK transfer contract is signed, and accounts are never switched on by an update | Planned |
| pnpm 12 | pnpm 12.6.0 replaces 11.18.0 in `packageManager` and both `eas.json` profiles. The lockfile keeps every resolved package and now opens with pnpm's own version record; `pnpm-workspace.yaml` needed no change. `pnpm check`, the component suite, Expo Doctor and a local Simulator build pass with it. It never rides an `eas update`, because the `appVersion` runtime policy lets an update reach installs without a native check | On main; first ships in build 16, never via an update |

Release evidence:

- Android verification, once Android work starts.
- Apple Intelligence measurement on eligible hardware.
- N2 background execution and delivery verification on a compatible device.

See [release state and known gaps](current-status.md#release-state).

## Build 20: the friends-and-family release

A read-only review of main at `e5e7f5b0` (recommendation and weather, the device database and migrations, every screen state, launch, consent and notifications, the Worker and contracts) found no defect that blocks the release. Migrations from every shipped schema to 28 pass, nothing account-related loads or calls the network while the switch is off, and the analytics, telemetry, `@expo/ui` and on-device AI import greps hold. The order below is release work first, then fixes, then evidence.

Release blockers:

1. The version string. Main still says `0.1.20261005`, build 19's version, while `expo-apple-authentication`, `expo-secure-store`, the Sign in with Apple entitlement and migration 28 arrived after it; one version string never carries two native builds, so build 20 takes a new date stamp.
2. Signing. Build 20 is the first binary with the Sign in with Apple entitlement: the App ID needs the capability and the provisioning profile must be regenerated before `eas build --local`; the built IPA's entitlements are checked with `codesign`.
3. Migration 28 evidence. The device-database replay test accepts only schema 24 to 26 and expects `pending_sync = 0` on every synced row, so it rejects a build 19 database; it is widened to schemas 19 to 27, keeps `pending_sync` from schema 25 on, and replays a database copied from a build 19 install. Migration 28 joins the released-migration hash lock and a frozen `build-19-schema-27.sql` fixture is added.
4. The independent review of the diff since build 19 (migration 28 and the native configuration).

Fix before the build:

- Today's day insight says rain is easing before it has started: when rain begins in the next full hour, `findDayInsight` reads it as already falling without checking current conditions, while Weather correctly says it starts at that hour; `wet_all_day` has the same gap.
- "Ask the stylist again" can return the same three outfits when the AI path is not used (the day's AI allowance is spent, or the phone is offline), and offline it still spends an allowance; the deterministic re-ask excludes the shown outfits or says that nothing else fits.
- A failed notification-permission read counts as a denial and cancels every scheduled weather alert.
- A `mens` profile changing the type of a stored one-piece or women-only piece gets an empty type grid with no category selected.
- Layout to confirm in the Simulator and fix if it shows: the Weather offline notice text running past its card, the onboarding preview title clipping at the largest standard text size, and the keyboard covering the Name field at the end of the Closet add and edit forms.

Small fixes that may ride along: the day variant follows the calendar date while the dressing day ends at 04:00; the day window ends an hour early where local midnight is skipped by a clock change (not Turkey); the insight-sentence word filter matches inside ordinary words such as "metallic"; the piece sheet hides Remove when the stored photo file is missing; Delete on the Closet form does nothing while a photo is being prepared; the spoken label for a photo with no type; a repeated Finish tap during onboarding's save announces a false required-field error; an unknown `kuyara://` path opens the router's default English page; photo files that no row names are never swept; `docs/testing.md` names the wrong replay versions; the unit suites pass only with the device time zone at UTC, so one focused run under a second zone is added.

Evidence before submission: one `pnpm check`, the component suite, a fresh native Simulator build of the release tree, one full Simulator walkthrough including the rows above and Phase 10, the upgrade from a build 19 install, and the release review once. Device-only questions stay recorded rather than blocking: whether the background alert task runs when the app was fully closed, and whether a time-zone change while backgrounded moves the dressing day and alert times before a restart.

The Worker on main is safe for every installed binary and build 20 needs nothing the deployed Worker lacks, so a Worker deploy is not part of build 20. Two Worker questions stay open with tests to write: Open-Meteo hours around a clock change (next in the EU on 25 October 2026), and whether the shared AI cache works on the `workers.dev` host.

### Accounts in build 20

Build 20 opens accounts, so it is submitted only after the KVKK transfer contract is signed; accounts are never switched on later by an EAS Update, because App Review must see sign-in and deletion and the binary must match its privacy answers. In order:

1. Console setup: the Turkish standard transfer contract with Supabase and the notice to the Authority; the Google sign-in library licence and the Google OAuth client; the Sign in with Apple key, Supabase's Apple and Google providers and the Hide My Email sending source; backup retention, two-step sign-in on every console and the breach runbook.
2. Code: Google sign-in through its native library with the nonce, the account terms pages in both languages (the app already links them), the privacy policy and support pages rewritten for accounts (the current policy also says deletion covers account-linked analytics, which ADR 0041 rules out), the privacy manifest's account data types, network-state detection, screens reloading after a pull, the History photo sweep for pulled deletions and the phone side of the member AI allowance. The site pages publish just before submission.
3. The Worker deploy with its secrets after one `wrangler dev` request, then a physical-iPhone run of Apple and Google sign-in, sync on two devices, deletion with revocation and the revoked-credential path.
4. The opening change: the switch on and its test inverted, the Supabase MCP back to read-only in both runtimes, the docs that say there is no sign-in rewritten, App Privacy updated in App Store Connect, review notes written, and the independent review of the whole account surface.

### Phase 11 and 12 decisions

Store page: the number of frames (eight recommended: Today, a piece swapped on the board, the reasons, tomorrow's board in dark appearance, Weather, the Closet rack, the share card, units and Easier to see), whether to make an App Preview video (not for build 20 recommended, since visitors arrive by link), the caption font and the first headline. The capture flows need the current onboarding order, the day-type sheet and the walkthrough skip before any capture.

Website: particles on the hero plate (a new place for an approved motion style), the self-playing sample day, colour boards with the board composition rule in place of the flat boards, type, hosting (GitHub Pages with committed generated data, a Pages build in GitHub Actions, or Cloudflare static assets with the github.io paths kept), whether the ADRs stay published as pages, and the new copy in both languages. The site's dark stage and cloudy tint have drifted from the app's tokens and are fixed in the same work.

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
