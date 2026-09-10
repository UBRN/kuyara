---
name: kuyara-next-goal
description: Use only when the user explicitly asks what kuyara's next Goal is, asks for a Goal proposal or a Goal prompt, asks to execute an explicitly approved Goal, or asks to review a completed Goal or its diff. Not for questions about how the project is going, what is being done wrong, process, strategy, or documentation governance.
---

# Kuyara Next Goal

Three modes, each entered only by an explicit request. Repository evidence owns project
state and decisions; the current request owns intent and authorization. `AGENTS.md`
holds every rule, permission, and validation requirement; this skill adds only the mode
behaviour below and repeats none of them.

## Triggers

- **Propose:** "what's next", "next Goal", "propose a Goal", "write the Goal prompt".
- **Execute:** "execute / implement the approved Goal", naming a Goal that is explicit or
  already approved.
- **Review:** "review this Goal", "review this diff / implementation result".

Not a trigger, and not turned into a Goal proposal: "how are we doing", "what are we
doing wrong", process critique, strategy, mental-model, or documentation questions.
Answer those directly without this skill.

## Establish context

Read `AGENTS.md`, `git status --short` and the branch, then `docs/current-status.md`.
Read only the documentation and code the active work needs. If the status document is
missing, outdated, or conflicts with executable evidence, report the discrepancy instead
of guessing.

## Propose

Read-only. Choose the next smallest coherent approved item from
`docs/current-status.md`, release blockers first, then prerequisites that unblock product
work. Do not reorder milestones silently or combine unrelated work; concluding that the
open Goal should simply be finished is a valid answer.

Return exactly these sections:

1. `Current state`
2. `Recommended next Goal`
3. `Why now`
4. `Decision needed before execution` (omit when none; include only for an unresolved,
   consequential architectural or product choice)
5. `Goal prompt`: goal, task-specific context, scope, out of scope, permissions,
   measurable acceptance criteria, risk-proportionate validation, Git boundaries, and
   a concise final-report requirement, referencing `AGENTS.md` rather than copying it.

## Execute

Only for an explicit or already approved Goal. Implement the smallest coherent change,
run the focused checks the Goal names, and update `docs/current-status.md` only when the
project state materially changes. Execution never grants Git or release permissions the
request did not grant.

## Review

Read-only. Inspect the actual diff and the task-relevant files, verify claims against
evidence, and report confirmed defects, risks, and uncertainties separately, ordered by
severity. Do not invent defects or rerun a successful check without a concrete reason. A
review is evidence for the main session's acceptance, not the acceptance itself.
