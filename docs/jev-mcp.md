# Jev evaluation MCP

Jev is TypeSafe's System One model: it returns typed judgments (a choice with probabilities and confidence, a yes/no probability, a graded score) instead of generated text. In kuyara it is an optional evaluation, routing and filtering layer for the agent workflow. It never generates code, runs tests, approves a deploy or migration, judges a screenshot, or overrides a mandatory instruction. It is not part of the kuyara runtime: the app, the Worker and the recommendation engine do not call it.

## Architecture

```
Human -> Claude Code orchestrator -> AGENTS.md and the loaded skills (mandatory, never filtered)
      -> optional Jev call: candidate relevance, claim-versus-evidence check, narrow classification
      -> Claude or Codex implementation -> deterministic tests -> Simulator or Maestro when applicable -> review
```

- Server: a local stdio MCP at `~/Developer/agent-tools/jev-mcp` (outside this repository). Its only dependency is `@typesafe-ai/sdk@0.6.0`, pinned in its lockfile; the JSON-RPC layer is about 170 lines with no MCP SDK.
- Provider: the OpenRouter Decisions endpoint (`POST https://openrouter.ai/api/alpha/decisions`) when `OPENROUTER_API_KEY` is present, or the TypeSafe API when `TYPESAFE_API_KEY` is present. Model `~typesafe/jev-latest`; every response carries the resolved snapshot in `model` (on 19 September 2026: `typesafe/jev-1.13-20260917`). Pin one snapshot for a measurement with `JEV_MODEL`.
- Registration: Claude Code local scope (`claude mcp add jev -s local -- ~/.local/bin/jev-mcp`), stored in `~/.claude.json` under this project path, never in a committed file.
- Tools: `jev_choice`, `jev_noul`, `jev_score`, `jev_batch`. Each returns the raw answer plus `usage` (input tokens, cost) and `ms`, with no interpretation and no threshold.

## Secret

The API key lives in the macOS login Keychain, never in the repository, an instruction file, a prompt, a log, a screenshot or a commit. `~/.local/bin/jev-mcp` reads it with `security find-generic-password` and passes it to the server's environment only. To add it (the value is typed at the prompt, not on the command line):

```
security add-generic-password -a "$USER" -s OPENROUTER_API_KEY -w
```

Without a key the server still starts and every tool answers `{"error": "no_api_key", "jev_unavailable": true}`.

## When to use it

Use Jev only when:

- there is a bounded candidate set (optional skills, ADR titles, finding classes) and the pick is not obvious from the request;
- a lane's claims must be compared against explicit evidence (a report line against a log line, a test list against a test output);
- a narrow classification can prevent an expensive model call (feedback kind, finding severity, task class).

Do not use it when:

- deterministic code answers (an exit code, a path intersection, a grep, a schema check);
- mandatory instructions are involved: AGENTS.md, CLAUDE.md, ADRs and the required checks are never candidates and never filtered;
- a test can verify the fact directly;
- the judgment is visual (Simulator frames, screenshots, design law compliance);
- the decision is destructive, a deploy, a migration, a credential or a spend limit;
- the context is already small and obvious.

Confidence gate: act on a Choice or Score only above 0.6; below that, or with a Noul between 0.35 and 0.65, the main session decides. A Noul carries no confidence field. Jev never marks a lane accepted: an unsupported claim it flags returns to the lane owner, and a supported claim still gets the main session's read of the scoped diff. Do not spawn a new agent solely because Jev found a minor issue; return it to the current owner first.

Failure mode: Jev being unreachable never blocks the workflow. Skill routing and classification fall open to today's flow. Evidence verification for security, migration, deploy and destructive changes was never delegated to Jev, so it needs no fallback.

## Data boundary

Only development-process text goes to Jev: a request summary, skill names and descriptions, a lane report, `git diff --stat`, log lines, a finding. Never a full diff, a source file, a secret, a kuyara user record, analytics, coordinates or a photo. The provider's data terms are TypeSafe's (no training on inputs, US hosting, retention not stated) and, through OpenRouter, the account's own logging preference.

## Measured on 19 September 2026

Benchmark of 40 synthetic examples (24 Turkish) in `~/Developer/agent-tools/jev-bench`: 55/58 answers correct, false positives 0, one false negative, p50 318 ms, 58 requests for 0.0013 USD. Three pilots (`jev-bench/pilots`): claim-versus-evidence 42/46 with 4 abstentions and 0 false positives (real reports 22/22, two hidden contradictions caught); feedback classification 18/20 with every ambiguous case abstaining or unclear; optional-skill routing 10/15, where four of the five misses were the delegation question (orch or none), which is policy, not request content, and the confidence gate held back three of them. Turkish accuracy matched English on this set.

## Verification

```
cd ~/Developer/agent-tools/jev-mcp && npm test
claude mcp list
cd ~/Developer/agent-tools/jev-bench && node run.mjs --dry
```

A live check costs under 0.0001 USD: `node run.mjs --limit 3`.

## Troubleshooting

- `no_api_key`: the Keychain entry is missing or empty (`security find-generic-password -s OPENROUTER_API_KEY -w | wc -c` should print about 74).
- `invalid_request`: usually a model id the provider does not know; `typesafe/jev-latest` without the tilde is rejected.
- `auth`: the key is revoked or its spend cap is reached.
- Tools missing in a session: `claude mcp get jev` must say Connected; the server is registered per project path.

## Disable and remove

- Disable for a session: `claude mcp remove jev -s local` (re-add with the command above).
- Remove entirely: also `rm -rf ~/Developer/agent-tools/jev-mcp ~/Developer/agent-tools/jev-bench ~/.local/bin/jev-mcp`, `claude plugin uninstall typesafe@typesafe-ai`, and `security delete-generic-password -s OPENROUTER_API_KEY`.

Nothing in the product changes either way.
