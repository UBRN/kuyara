# ADR 0024: Relicensing to PolyForm Noncommercial, and dropping the open-source claim

Status: Accepted (2026-09-04)

Implementation: applied in this change. `LICENSE` now carries the PolyForm Noncommercial
License 1.0.0, [`LICENSING.md`](../../LICENSING.md) records the history and the commercial
path, and the "open-source" wording is corrected wherever it described the project.

Supersedes: the MIT licensing of this repository for current and future work, and the
description of kuyara as open source in `README.md`, `AGENTS.md`, and
[`product-decisions.md`](../product-decisions.md).

## Context

kuyara has been MIT licensed since the repository was created on 2026-07-25, and three
documents describe it as an open-source application. MIT permits unrestricted commercial
use, including selling the software, and that no longer matches the maintainer's intent.

The intent, stated on 2026-09-04, is narrower than MIT and broader than closed source:
the source should stay publicly readable so people can inspect and learn from it,
noncommercial use and modification and redistribution should be permitted under a
standard licence, and commercial use should require the copyright holder's separate
permission.

That combination is not open source under the OSI definition, which forbids
discrimination against fields of endeavour. Continuing to call the project open source
after adding a commercial-use restriction would be inaccurate, which is why this ADR
covers the wording as well as the licence file.

Ownership was checked before deciding, because relicensing a project with outside
contributors raises a rights question this ADR could not resolve on its own. All 114
commits are authored by the maintainer under two identities, `utku <ubarin08@gmail.com>`
and the GitHub noreply address for the same account; no commit carries a `Co-authored-by`
or `Signed-off-by` trailer, and the single merged pull request came from a branch in the
maintainer's own repository. There is no third-party contribution and therefore no
contributor-rights ambiguity.

## Decision

### 1. PolyForm Noncommercial License 1.0.0

The project licence for current and future work is the PolyForm Noncommercial License
1.0.0, applied as the exact official text published by the PolyForm Project at
<https://polyformproject.org/licenses/noncommercial/1.0.0>. The text is unmodified. The
only addition is the `Required Notice:` line the licence's own Notices section provides
for, carrying the copyright holder.

The alternatives were considered and rejected: BSL and SSPL solve a hosted-competitor
problem kuyara does not have, Commons Clause is a rider on another licence rather than a
licence, and Creative Commons is not intended for software. None of them was already a
settled decision in this repository.

### 2. The wording changes with the licence

kuyara is described as **source-available**, not open source. "Publicly developed
source-available application" is accurate; "open-source" is not, once commercial use is
restricted.

### 3. Commercial use is available by separate permission

Commercial use requires separate written permission or a commercial licence from the
copyright holder. That path is recorded in `LICENSING.md` so the restriction reads as a
condition rather than a refusal.

### 4. The MIT history is not revoked

Every version distributed under MIT before this change stays under MIT, and the rights
already granted for those versions stand. A licence change is forward-looking: it governs
this and later versions. Anyone who obtained an earlier version keeps what MIT gave them,
including for commercial use of that version.

This is stated plainly in `LICENSING.md` rather than left implicit, because the failure
mode, claiming a retroactive revocation the maintainer cannot actually make, would be
both wrong and unenforceable.

## Consequences

- Contributions from anyone other than the maintainer would now arrive under the new
  terms. If outside contribution ever becomes a real possibility, a contribution policy
  or CLA is the next decision; none is needed today.
- The Open-Meteo free tier is noncommercial-use only, and
  [`product-decisions.md`](../product-decisions.md) records kuyara's free, ad-free,
  non-monetised nature as the reading that fits it. That reading is unaffected and, if
  anything, better supported: the project is now noncommercially licensed as well as
  noncommercially operated. The "re-check if the product ever monetizes" caveat stands
  unchanged.
- Nothing about the repository's visibility changes. The source stays public, and the
  existing rule that design mockups and session notes live outside the repository is
  unrelated to licensing and is unaffected.
- No dependency licence obligation changes. The project's own licence does not alter what
  its dependencies require.

## Out of scope

- A contributor licence agreement or contribution policy.
- Commercial licence terms, pricing, or a request process beyond naming the copyright
  holder as the contact.
- Dual licensing, trademark policy, or any assertion about the kuyara name.
- Any per-file licence header. The root `LICENSE` covers the repository.
