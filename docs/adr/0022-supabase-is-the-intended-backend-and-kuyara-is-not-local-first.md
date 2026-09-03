# ADR 0022: Supabase is the intended backend, and kuyara is not local-first

Status: Accepted (2026-09-04)

Implementation: not started, and deliberately so. This ADR changes how the product
describes itself and what the current schemas must preserve. It authorizes no Supabase
dependency, table, client, adapter, or sync code. See [Out of scope](#out-of-scope).

Supersedes: the framing that kuyara *is* a local-first product, as written in
`AGENTS.md`'s "Local-first data rules" section and repeated in
[`product-decisions.md`](../product-decisions.md) and
[`architecture.md`](../architecture.md).
Narrows: [`product-decisions.md`](../product-decisions.md)'s "a remote sync adapter may
later be implemented with either Supabase or Firebase".

## Context

Every durable document in this repository describes local-first as if it were kuyara's
identity. `AGENTS.md` gives it a section heading, and its first rule says Expo SQLite
"is the durable on-device source of truth for user-created data. It is not a temporary
database to be removed when remote sync is added." `product-decisions.md` says remote
sync "may complement, but must not replace, the local store." A whole section is titled
"Implemented local-first wardrobe persistence slice."

That wording was written to defend a real and still-correct engineering rule: nothing in
the MVP may assume a server, and no refresh failure may discard local data. But it was
written as a product identity, and as a product identity it is wrong. The maintainer's
actual intent, stated on 2026-09-04, is that the accountless first release is a scope
decision, not a philosophy. The product is expected to grow accounts, cross-device
persistence, and synchronized files.

Leaving the wording alone has a concrete cost. A future agent reading "must not replace
the local store" will treat a server-authoritative design as a rule violation and either
refuse it or route around it, and the copy rule in
[Approved account copy boundary](../product-decisions.md#approved-account-copy-boundary)
already exists precisely because the same confusion nearly reached users.

The opposite failure is just as real: this repository has an explicit rule against
speculative infrastructure, and "we will have a backend one day" is exactly the licence
an agent needs to build an outbox nobody asked for.

## Decision

### 1. Local-first describes the MVP's implementation, not the product

kuyara is not fundamentally a local-first product. The first production release has no
account and no cross-device synchronization because that keeps the first shippable scope
small, not because device-only storage is the intended end state.

For the MVP, all of the following remain true and unchanged:

- Expo SQLite is the durable device-side database for user-created data.
- No user account is required.
- No sync engine exists.
- All user data the current product needs may live on the device.
- The Cloudflare Worker stays the boundary for WeatherKit, AI, and provider secrets, and
  owns the versioned mobile API. Supabase does not displace it.

The phrase "local-first" may be used for that implementation behavior. It may not be
used as a description of what kuyara is.

### 2. Supabase is the intended long-term backend

- **Supabase Auth** for accounts.
- **Supabase PostgreSQL** for durable, account-backed remote data.
- **Supabase Storage** for synchronized files, with future Closet photos the obvious
  first candidate.

Firebase is not the planned production backend. If it is ever evaluated it belongs in an
isolated prototype or branch, never as a second production backend beside Supabase. The
existing rule that the two are never used simultaneously in production stands and is
narrowed: Supabase is the chosen one.

### 3. Postgres becomes authoritative for account-backed data; SQLite stays the device store

Decided 2026-09-04, in answer to the question this ADR exists to close. Once accounts
land, Supabase Postgres is the record of truth for account-backed user data. Expo SQLite
remains the store the application reads and writes first, so the app keeps working
offline and keeps rendering instantly, and it reconciles against the remote afterwards.

This is a reversal of emphasis, not a deletion. SQLite is not removed and is not reduced
to a throwaway cache: it is the device's working database. What changes is that it stops
being described as the permanent, final authority for the whole product.

### 4. What the MVP owes the future

The MVP is not built with sync in mind for its own sake. It is built so that a later
migration is ordinary work rather than a rewrite. These obligations are already met by
the current schema and boundaries, and must be preserved:

- Device-generated stable UUIDs for user-created records, never auto-increment ids.
- An explicit `localProfileId` on profile-owned rows, so local data can later be linked
  to an authenticated profile.
- Ordered, tested schema migrations from version 1.
- `createdAt` and `updatedAt` on syncable records, and `deletedAt` where a future
  cross-device deletion has to be representable.
- Domain models, SQLite records, API DTOs, and future remote records kept separate and
  converted by explicit, tested mappers.
- Repository interfaces and local data sources between the application and storage.
- UI and domain code that imports neither `expo-sqlite` nor any future Supabase SDK.

### 5. Accounts must earn themselves

Recorded as product direction, not as behavior to build now:

- Basic weather and general outfit recommendations should stay usable without an account
  unless a later product decision changes that.
- Richer personalization is the natural account-backed tier.
- The Closet is the strongest candidate for an account-required feature, because backup,
  cross-device persistence, and synchronized photos are the things a user actually loses
  today when they change phones.

No account gating is implemented, designed, or scheduled by this ADR.

## Consequences

- Documentation stops calling kuyara local-first as an identity. The section heading in
  `AGENTS.md` becomes a persistence-boundary rule rather than a philosophy.
- The historical section title "Implemented local-first wardrobe persistence slice" in
  `product-decisions.md` is left alone: it names a slice that shipped under that
  description, and rewriting shipped history to match a later decision is exactly what
  this repository's documentation rules forbid.
- A future agent now has an answer to "what happens after accounts" and therefore has no
  reason to invent one.
- The migration is still real work: promoting existing device rows into an authenticated
  remote profile needs its own ADR when it is scheduled.

## Out of scope

This ADR authorizes none of the following, and adding any of them without a further
approved decision is a violation of it:

- A sync engine, outbox, conflict-resolution protocol, or server revision system.
- Supabase tables, Auth, Storage buckets, client SDK, or remote repository
  implementations.
- Placeholder or "fake" sync abstractions with no current caller.
- Account UI, sign-in, or gating of any existing feature.
- Any change to the Cloudflare Worker's role.
