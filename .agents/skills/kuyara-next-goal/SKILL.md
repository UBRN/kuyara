---
name: kuyara-next-goal
description: Determine Kuyara's current state, propose the next approved MVP Goal, execute an explicit or approved Goal, or review a completed Goal or diff. Use when asked what comes next, to continue the project, prepare or implement a Goal, or inspect a Goal result. Default to Propose mode unless the user explicitly requests Execute or Review mode.
---

# Kuyara Next Goal

Use repository evidence, not conversation memory, as the source of truth.

## Establish context

1. Read the applicable `AGENTS.md`.
2. Inspect `git status --short` and the current branch.
3. Read `docs/current-status.md`.
4. Read only documentation and implementation files relevant to the active milestone.
5. Treat recorded product and architecture decisions as authoritative.

Keep inspection narrow and output bounded. Do not perform a repository-wide review unless required, repeat completed environment setup merely to reconfirm it, or reread unchanged documents without a task-specific reason. If the status document is missing, outdated, or conflicts with executable evidence, report the discrepancy instead of guessing.

## Select the mode

Default to **Propose** when no mode or implementation permission is explicit.

No mode grants implicit permission to stage, commit, push, deploy, publish, create branches or worktrees, mutate external systems, or perform release operations. Perform any such action only when the current user request explicitly authorizes it.

### Propose

Do not modify files, install packages, run builds or broad validation, commit, or push.

Choose the next smallest coherent approved MVP milestone from `docs/current-status.md`. Prioritize the App Store path and prerequisites that unblock product work. Keep tooling and product work separate; avoid speculative infrastructure, unrelated features, deferred work, and silent milestone reordering.

Return these sections:

1. `Current state`
2. `Recommended next Goal`
3. `Why now`
4. `Plan Mode decision`
5. `Goal prompt`

Use Plan Mode only for unresolved, consequential architectural choices. Make the Goal prompt concise and executable, containing only the goal, task-specific context, scope, out of scope, permissions, measurable acceptance criteria, risk-proportionate validation, Git boundaries, and concise final-report requirements. Reference repository rules rather than reproducing them.

### Execute

Use only when the user explicitly asks to implement or execute an explicit or already approved Goal.

- Inspect only task-relevant files and follow `AGENTS.md` efficient-execution and validation guidance.
- Implement the smallest coherent change and preserve unrelated changes.
- Run focused checks during development and one consolidated final pass only when proportionate to risk.
- Update `docs/current-status.md` only when project state or the milestone materially changes.
- Do not silently change confirmed decisions.

### Review

Use when asked to inspect a completed Goal, diff, implementation, or Codex result. Do not modify files, install packages, commit, or push.

Inspect the actual diff and task-relevant files, then verify claims against available evidence. Report confirmed defects, risks, and uncertainties separately, with findings ordered by severity. Do not invent defects or repeat successful validation without a concrete reason.

## Working constraints

- Protect correctness, safety, and architecture before token savings.
- Batch related inspection and avoid full-tree scans.
- Distinguish prerequisites from product implementation.
- Choose one small vertical slice and do not combine unrelated work.
- Do not request repetitive progress reports. Delegate per the repository delegation rules and verify delegated output before accepting it.
- Do not rerun successful checks unless affected implementation changed.
- Keep proposed Goal prompts substantially shorter than older long-form Kuyara prompts.
