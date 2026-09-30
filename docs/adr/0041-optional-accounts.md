# ADR 0041: Optional accounts

Status: Accepted (2026-09-30)

Implementation: not started. The shipped app has no sign-in. This ADR specifies the account, sync and account-deletion work of phase 9; the parts that need no live Supabase, Apple or Google account (the device migration, mappers, shared contracts, the Worker route and their tests) may be built now. The maintainer creates the Supabase project and the Apple and Google credentials; nobody else creates or calls them.

## Context

The first release shipped without accounts as a scope decision ([ADR 0022](0022-supabase-is-the-intended-backend-and-kuyara-is-not-local-first.md)). The approved base is: accounts are optional, Supabase Auth signs in with native Apple and Google ID tokens, account deletion ships with the first account, and weather and general recommendations work without an account. What a person loses today when they change phones is their Closet and their History; that is the reason for an account.

Five tables are already sync-ready: `local_profiles`, `wardrobe_items`, `dressing_day_choices`, `dressing_day_departures` and `outfit_history`. Each has a client UUID, `created_at`, `updated_at` and `deleted_at`, and profile-owned rows carry `local_profile_id`. Two forks waited for this decision: the one-profile-per-device rule (`singleton_key = 1`) and the conflict rule, because `updated_at` is written from the device clock and cannot arbitrate between devices.

Apple requires that deleting an account created with Sign in with Apple revokes its tokens through the Apple REST API. Revocation needs a client secret signed with Apple's private key and a refresh or access token, and that token is only obtainable by validating a single-use authorization code on a server within five minutes. Supabase's native Apple flow does not keep such a token, so one server step is unavoidable.

## Decision

### 1. Identity providers

- Supabase Auth is the identity service. Sign in with Apple uses `expo-apple-authentication` and `signInWithIdToken` with a nonce. The Supabase Apple provider lists only the bundle identifier `com.ubrn.kuyara` as a client ID; the native flow needs no Services ID and no six-monthly Apple secret.
- Sign in with Google uses Google's native sign-in library and `signInWithIdToken` with a nonce. kuyara uses the library's paid Universal edition, which runs on the current Google SDK and keeps the nonce check on. The free licence offered to EAS customers is requested first; otherwise the fixed yearly fee is paid. It has no overage.
- Apple is asked for the email address only, never the name; the name belongs to the local profile. The email serves support correspondence and the Account screen's "which account you signed in with" line.
- The name and profile picture a provider supplies are never stored by kuyara. Supabase keeps them in `user_metadata`; kuyara copies them into no table and never reads them.
- The Supabase project has the email provider and anonymous sign-in turned off. A new project enables email sign-in by default, so setup turns it off.
- Email sign-in is not part of the first account release and is not approved. A six-digit emailed code remains a candidate for a later release, with its own decision.
- A second sign-in method is linked only manually, while signed in, from the Account screen ("Add Google" or "Add Apple"), with Supabase manual linking enabled. Supabase's automatic linking of identical verified emails stays as Supabase provides it. Trying to add a Google or Apple identity that already belongs to another kuyara account shows a system alert with one "OK" button; signing in with an existing account on the sign-in page is not an error but a sign-in to that account.
- kuyara does not buy a domain now. Google brand verification is first tried with `ubrn.github.io`; a domain is bought only if that fails or email sign-in is approved.

### 2. The server step: Apple revocation and account deletion

Account deletion runs as a new versioned Worker route, `POST /v1/account/delete`; like `/v1/places/search`, each route carries its own version. The Worker is kuyara's only server and the owner of its secrets; no second server runtime is added. The route's request schema is strict (an optional `appleAuthorizationCode`; the Supabase access token travels only in the `Authorization: Bearer` header, never in the body) and its response and error schemas are tolerant, both in `packages/contracts`. The success body is `{ data: { status: 'deleted' } }`; the error codes are `invalid_request`, `not_found`, `method_not_allowed`, `unauthorized`, `apple_code_invalid`, `rate_limited`, `unavailable` and `internal_error`, read through the named unknown branch. The Worker is deployed before the binary that calls it.

The flow, in order:

1. After the system confirmation, the app asks Apple to re-authorize (Face ID) and receives a fresh `authorizationCode`. A Google account re-authenticates with Google instead.
2. The app sends the Supabase access token and, for Apple, the authorization code to the Worker.
3. The Worker verifies the token statelessly against the Supabase JWKS: signature, `exp`, `iss` (`https://<project>.supabase.co/auth/v1`, not the bare project address) and `aud = authenticated`. The only accepted algorithm is ES256. The user ID comes from `sub`, never from the request body. The JWKS is cached, and an unknown key ID triggers a refetch at most once per cooldown period, so a stream of forged key IDs cannot turn the route into a fetch amplifier; the route's per-IP rate limiter bounds the rest.
4. The Worker reads the account's identities through the Supabase admin API. When an Apple identity exists, an authorization code is required, also for a Google account with Apple linked; without one the answer is `apple_code_invalid` and nothing is deleted. When no Apple identity exists, step 5 is skipped.
5. The Worker builds the Apple client secret on every request (ES256; header `kid` is the Key ID; body `iss` is the Team ID, `aud` is `https://appleid.apple.com`, `sub` is `com.ubrn.kuyara`, short `exp`), exchanges the code at `https://appleid.apple.com/auth/token` with `grant_type=authorization_code`, and immediately revokes the refresh token at `https://appleid.apple.com/auth/revoke` with `token_type_hint=refresh_token`. The `client_id` is the bundle identifier. The `sub` of the exchange's `id_token` must equal the subject of the account's Apple identity; a mismatch answers `apple_code_invalid` and nothing is deleted, so a code from another Apple account can neither revoke that account's token nor authorize this deletion.
6. Only after revocation succeeds does the Worker call `auth.admin.deleteUser`. Account tables reference `auth.users` with `on delete cascade`, so the rows go with the user. A user the admin API no longer finds counts as already deleted. Storage deletion joins the later photo-backup decision; no bucket exists while photo backup is absent.
7. The Worker returns only a closed result: `deleted`, or a closed error code such as `apple_code_invalid`, `unauthorized` or `unavailable`. Apple and Supabase responses, tokens and internal errors never leave the Worker and are never logged.

Revocation comes first because a deletion that succeeds while revocation fails leaves Apple's requirement unmet with no way to obtain the token again. If revocation succeeds and deletion fails, the account and its data stay intact and the person retries with a fresh code, so the failure line's statement that nothing was deleted is true.

The Worker gains three secrets: `SUPABASE_SECRET_KEY`, `APPLE_SIGN_IN_PRIVATE_KEY` and `APPLE_SIGN_IN_KEY_ID`, and two non-secret variables, `SUPABASE_URL` and `APPLE_TEAM_ID`, plus the rate-limit binding `ACCOUNT_DELETE_RATE_LIMIT`. When any of them is missing, the route answers 503 `unavailable` and calls nothing. The WeatherKit key is not reused; Sign in with Apple has its own key so that each can be revoked alone. Every call to Supabase and Apple goes through an injected `fetch` with its own timeout, and the ES256 signing that WeatherKit's token also needs is one shared module.

An access token already issued to a deleted user stays valid until it expires (one hour by default). Its rows are gone, so it reads nothing, and the app deletes its local session after deletion.

Apple's server-to-server notification endpoint stays empty in the first account release, as Supabase's documentation advises.

### 3. Moving device data into the account

- On first sign-in, this phone's Closet and History are added to the account automatically, once the sync consent in section 10 is given. Until then only the profile fields in the table below go to the account. The welcome sheet states how many pieces and how many days were added; a day is a History day.
- What goes to the account:

| Device table | Goes to the account | Stays on the device |
| --- | --- | --- |
| `local_profiles` | display name, gender, dress style, style aesthetics | `birth_date`, `analytics_consent`, `notifications_opt_in`, language, appearance, Easier to see, the name and walkthrough prompt gates, the morning-sheet preference and every other device setting |
| `wardrobe_items` | every field except the photo | the photo relative path and the photo itself |
| `dressing_day_choices` | every field | nothing |
| `dressing_day_departures` | every field, including the departure time and its time zone | nothing |
| `outfit_history` | every field except the photo | `photo_path` and the mirror photo |

- Photos do not go to the account in the first account release. Photo backup comes later, after real photo sizes are measured, with its own decision.
- Remote schema: each synced table has a counterpart in the `public` schema. Its primary key is the client UUID, which never changes, so a retried upload rewrites the same row instead of adding a second one. Each row has `user_id uuid not null references auth.users on delete cascade`, the client's `created_at` and `updated_at`, `deleted_at`, and a server-written `server_updated_at` set to `now()` by a trigger that the client cannot write. Day-keyed tables are unique on `(user_id, day_key)`. The profile table holds one row per user. Remote records, SQLite records and domain models stay separate, joined by tested mappers.
- `local_profile_id` stays a device link, is never uploaded, and is never used for ownership checks, because the client can write any value into it. A pulled row takes this phone's profile id. The remote profile row is keyed by `user_id`.
- A pulled row that this app version's schema or catalog cannot parse (written by a newer version) is refused at the remote boundary, never overwrites a local row, and the cursor still advances. Remote enum values are as frozen as the v1 contracts.
- The first upload sends live rows and soft-deletion markers from the last 30 days.
- The one-profile-per-device rule (`singleton_key = 1`) stays. The account link lives in a new device table holding the linked user ID, the last linked user ID (kept after sign-out) and the last pull cursor.
- Pending changes: each of the five tables gains a `pending_sync` flag. Every local write sets it, except that on the profile only a write to one of the four synced fields does; a successful upload clears it when the row returns with the same `updated_at` (day-keyed tables match on `(day_key, updated_at)`). This is not an outbox or an operation log: the row's latest state is sent. The "N waiting" counts on the Account screen come from these flags.
- One new SQLite migration adds the flags and the link table, ordered after version 22 and tested with an upgrade from the last released schema and a realistic device-database replay. Existing rows start with the flag unset. Released migrations never change. The migration ships in the same binary as the account work, never on its own.

### 4. Merging and the conflict rule

- On a second phone where both the account and the phone hold data, the two merge. The Closet merges by ID, and when the same ID exists on both sides the account's copy wins; the same piece added separately on two phones can remain as two rows. For day-keyed tables, when both hold a record for the same day, the account's record stays. Display name, gender, dress style and style aesthetics come from the account. A result sheet states the counts.
- Duplicate pieces are never removed automatically. The merge result sheet offers "Open Closet" so the person can delete one.
- When the account's day-keyed record wins, this phone's mirror photo moves to the winning row and is not deleted ([ADR 0038](0038-outfit-history.md): replacing a day keeps its photo). Photos are not synced, so the winning row has no photo on other phones.
- The local profile stays authoritative for product logic: it reads profile fields only from the local profile, and the person edits them only there. The account's copy is their durable record; a merge writes it to the phone once, and afterwards every edit goes to the account. Birth date never goes to the account.
- Ongoing sync resolves conflicts per row by last writer wins, ordered by **arrival at the server** (`server_updated_at`), never by device clock. A soft-deletion marker is a write like any other. In day-keyed tables the identity is `(user_id, day_key)`: a same-day write arriving with a different UUID overwrites the existing row, and the phone adopts that row's ID on its next pull.
- Pulls use the `server_updated_at` cursor, so clock skew cannot reorder them.
- Ongoing sync uploads before it pulls and skips the pull when the upload fails; a pull never overwrites a row that is pending. The first link is the exception: it pulls and merges before it uploads.
- Sync runs on sign-in, when the app comes to the foreground, on "Sync now", and shortly after a local write. The background task (weather alerts) never touches Supabase.

### 5. Sign-in surfaces

- Sign-in is offered in two places: a dismissible card on the Profile tab and an always-present Account group in Settings, directly above the Profile group ([ADR 0030](0030-settings-as-a-native-grouped-list.md) section 2). The card's close button hides it for good.
- Both the Profile card and the sign-in page are titled "Complete your profile" / "Profilini tamamla". The page lists the benefits (moving to a new phone, continuing after a reinstall, and the app working the same without an account), then Apple and Google buttons of equal size at thumb reach, a centred "Not now", and a footnote linking the privacy policy and the account terms.
- A cancelled sign-in is not an error: a neutral status line with an information mark says so and invites a new choice. Being offline shows a warning line as the page opens, with the buttons still enabled; a provider failure shows an error line that suggests retrying or using the other provider.
- On a new phone the restore sheet can be closed while restoring continues. If it was closed, it does not reopen when restoring finishes; the Account screen and the Settings row show "Up to date" and the new counts.
- A sync failure never discards pending changes: it states how many are waiting, and "Sync now" becomes "Try again".
- Onboarding gains no sign-in step, and no existing feature is gated behind an account.

### 6. Signing out

- Signing out keeps everything on the phone, and kuyara continues without an account.
- If there is a connection, pending changes upload before sign-out. Without one, sign-out still proceeds and the flags remain. Signing back in with the same account syncs silently.
- Signing in with a different account asks, on a sheet that cannot be swiped away, whether the previous Closet and History should be added to this account, with two equally weighted options. "Add" adds the rows to the new account (the synced copy also stays in the previous account). "Don't add" shows only the new account's data on the phone and removes the previous rows locally. Because unsynced changes are lost with "Don't add", the sheet also states the number of pending changes when there are any.
- The session is deleted locally; an issued access token stays valid until it expires.
- After sign-out, Settings shows a neutral information row under the Account group. It disappears on the next visit to Settings, and the ordinary benefit footnote returns.

### 7. Account deletion

- Deletion removes everything in the account (section 2); what the phone shows stays, and kuyara continues without an account. The device's account link, the last linked user ID, the pull cursor and the session are cleared and the pending flags reset.
- Deletion lives in the app, under Settings > Account, two taps away. Its confirmation is the deletion page, the system's "Delete your account?" alert, then a fresh Apple (Face ID) or Google authorization. The page states how long deletion takes and that the person is told when it finishes.
- Deletion cannot start offline; the button is disabled with a warning line.
- While deletion runs the person may go anywhere in the app. The work continues, and when it finishes the result sheet appears wherever they are. A failure re-enables the button with an error line stating that nothing was deleted.
- After the result sheet closes, Settings shows a one-time confirmation row under the Account group. It disappears on the next visit to Settings, and the ordinary benefit footnote returns.
- The Free plan has no daily backups, so the only backups are the ones the maintainer takes by hand. A deleted account's data can remain in a manual backup until that backup is removed, and a restore never brings a deleted account back. The retention the maintainer sets for manual backups is fixed before accounts open, and the privacy policy states it.
- Analytics is not linked to the account (section 12), so PostHog holds no account data to delete.

### 8. What never leaves the device

`birth_date` (the account tables have no such column), `analytics_consent`, `notifications_opt_in`, the caches (`weather_snapshots`, `weather_hourly_entries`, `recommendation_snapshots`), `weather_alert_deliveries`, `active_locations`, device settings such as language and appearance, photos and photo paths. Account data never enters an AI request; the [AI input boundary](../product-decisions.md#approved-ai-input-privacy-boundary) is unchanged. Sync payloads, logs, analytics and telemetry carry none of these fields, and a test proves it.

### 9. Session storage

- After the app is deleted and reinstalled, the session starts signed out and one tap signs back in. The encryption key lives in the Keychain with `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY` (`expo-secure-store`) and the encrypted session in `expo-sqlite/kv-store`. The key does not travel in backups, so another device restored from an iCloud backup cannot open the session.
- Automatic token refresh runs in the foreground and stops in the background.

### 10. Region, data protection and consent

- The Supabase project is in Frankfurt (`eu-central-1`), inside the EU. The region cannot change later, and the project address is built into the binary.
- Every Supabase region is outside Turkey, so KVKK article 9 applies, and explicit consent is not the right basis for a regular transfer. Before accounts open, a lawyer reviews the transfer, Supabase is asked to sign the Personal Data Protection Authority's controller-to-processor standard contract, and the Authority is notified within five business days of signing. If the contract is not signed, accounts stay closed.
- KVKK article 6/1 lists dress as special-category data. Closet items, History and daily choices are treated as possibly special-category: their sync is turned on by a separate explicit consent, distinct from the privacy notice, and the Board's adequate measures apply. A lawyer confirms this reading. The consent covers four kinds of records: Closet items, History, daily choices and departure records (the departure time and its time zone). It is asked in the sign-in flow before the first upload. Declining still completes sign-in and only the profile fields in section 3 sync; the Account screen offers the same consent later. The consent belongs to the account, not to a phone: withdrawing it on one phone stops sync on every phone signed in to that account and deletes the account's copies of the four kinds of records, and giving it later on any phone turns it on for the account.
- A copy of the data is requested by email, and the maintainer sends a machine-readable JSON file within 30 days. Requests have 30 days under KVKK and one month under GDPR; breach notification is 72 hours under both.
- kuyara sets no minimum age of its own for an account. It relies on the age limits of the Apple and Google accounts that sign in, shows no age declaration and never uses the birth date; no age or birth date leaves the device. Whether a person under 16 in the EU can give the sync consent is a legal question, and a lawyer answers it before accounts open.
- Before the account binary ships, a lawyer is asked whether the Texas, Utah and Louisiana age rules apply to kuyara and whether adding accounts is a significant change; if they apply, Declared Age Range and the significant-change permission join the same binary.
- App Privacy adds Email Address, User ID and Other User Content, all linked to the user, for App Functionality, with no tracking. Photos is added only when photo backup arrives. The privacy manifest carries the same types and ships in the binary. The privacy policy (Turkish and English) is published before the account binary.
- A short Turkish and English "Account terms" page is published beside the privacy policy and linked from the sign-in page, with no checkbox. Apple's standard licence agreement remains the app licence.
- User-facing copy never says where data is kept. Sign-out and deletion screens say what remains in whole sentences without naming a place, such as "Your Closet and History stay in kuyara". The sync consent text is the one account surface that carries storage and transfer wording, because the law requires it there.

### 11. Spending limits and plans

- The Supabase project stays on the Free plan, in testing and after accounts open. Postgres is the authority for account data, and the Free plan has no daily backups and pauses a project after a week of inactivity. The maintainer accepts both: backups are taken by hand (section 7), and a paused project is resumed by hand. Keeping the project alive with artificial requests is forbidden.
- No paid Supabase plan and none of its add-ons (point-in-time recovery, custom domain, IPv4, log drains) are enabled; moving to a paid plan needs its own decision. No automatic top-up and no pay-as-you-go overage.
- The Worker stays on its free plan; the new route reads the JWKS from cache.
- Prices and quotas are reread from the official pricing pages at implementation time. This ADR freezes no price.

### 12. Security baseline and analytics

- From the first remote migration: row-level security on every synced table; one policy per operation with `user_id = (select auth.uid())`, plus `with check` on insert; explicit grants to the `authenticated` role and none to `anon`; no `raw_user_meta_data` in any policy condition; the new publishable and secret key types.
- The app contains only the project address and the publishable key. The Supabase client library is imported only from the account feature's data layer; UI and domain code never import it.
- PostHog is never linked to the account: `identify()` is never called, and analytics stays on its install identifier. Neither `localProfileId` nor the Supabase user ID becomes an analytics identifier.

### 13. Member AI allowance

- A signed-in member gets 10 "Ask the stylist again" requests per day, a separate allowance from the device's own. The Worker counts them; the device counter is not trusted for members. A person without an account keeps the device allowance that exists today.
- The member allowance ships with the first account release. The Worker identifies the member from the verified Supabase access token as in section 2 (user ID from `sub`), sent only in the `Authorization: Bearer` header, so no request or response shape of a shipped route changes. The user ID keys the counter and is never logged, sent to analytics or placed in an AI request; the [AI input boundary](../product-decisions.md#approved-ai-input-privacy-boundary) is unchanged.
- The Worker's daily Workers AI total stays at 50 for everyone together. The member allowance never raises it, and no paid model joins the chain for members. When the total is spent, recommendations fall back to the on-device deterministic choice, for members too.

## Red lines

- No outbox, operation log, server revision system or generic sync engine without a measured need. The per-row pending flag and the server timestamp are enough.
- The device clock never arbitrates a conflict.
- An account is never required. Onboarding gains no sign-in step, and weather and recommendations work without an account.
- Birth date, consents, the notification setting, caches and device settings never leave the device.
- The Supabase secret key, the Apple private key and client secrets never enter the app, Git, an `EXPO_PUBLIC_` variable or a log.
- Account deletion is never a deactivation, and deletion is never reported as finished before the Apple token is revoked.
- `localProfileId` and the Supabase user ID are never analytics identifiers.
- The Closet and History are never recommendation candidates or AI input.
- Supabase anonymous sign-in is never used.
- No account surface says where data is kept, apart from the sync consent text.
- No minimum-age rule or age declaration for accounts, and the birth date is never used to gate one.
- Sync consent is never per phone: withdrawing it stops sync for the whole account.
- Declining the sync consent never blocks or undoes sign-in.
- The member allowance never raises the Worker's daily Workers AI total and never pays for a model.
- No paid Supabase plan without its own decision, and no artificial requests to keep a Free project from pausing.

## Consequences

- The first account binary is a native change (the Sign in with Apple entitlement, the Google library, `expo-secure-store`, the privacy manifest): it needs a new binary with a date-stamp bump, an independent review of the migration, native configuration, credentials, and consent and data-collection surfaces, and a migration replay on a device database. Each new dependency is justified and checked against the current Expo SDK before it is added.
- The Worker gains secrets and one route; its role does not change.
- The maintainer sets up the Supabase project, the Apple key and the Google client. Acceptance includes physical-iPhone evidence for Sign in with Apple and revocation, which the Simulator cannot provide.
- Photo backup, email sign-in, a member AI allowance above 10 a day and Apple server notifications each come with their own decision.
- The project stays on the Supabase Free plan: there is no daily backup, the maintainer takes manual backups, and a paused project is resumed by hand.
- The privacy policy, the support page and the account terms page are rewritten before the account binary ships.
