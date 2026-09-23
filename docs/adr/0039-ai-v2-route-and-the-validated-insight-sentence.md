# ADR 0039: AI v2 route and the validated insight sentence

## Context

Today has one AI-authored insight line when the Worker can supply it, and daily style aesthetics must reach AI as closed identifiers. Installed builds 8 and 9 read the `/v1/ai/recommend` response strictly. An added response key would make those builds reject an otherwise valid recommendation. The weather API already uses a successor route for its daily outlook while preserving v1.

## Decision

`/v1/ai/recommend` keeps its exact request and response shapes. `POST /v2/ai/recommend` has the v1 request plus optional `styleAesthetics`, a sorted array of at most three identifiers from the closed `minimal | classic | sporty | streetwear | relaxed` enum. Its response has the v1 picks plus optional `insightSentence`, one sentence of 1 to 90 characters without a line break. Both versioned schemas live in `packages/contracts`; requests stay strict and the v2 response strips unknown keys. The Worker uses one handler, with the route deciding whether to request and emit the sentence. Older builds continue on v1. Mobile adopts v2 for the insight in Phase 1 and starts sending aesthetics in Phase 4.

After Zod parsing and before display or persistence, the recommendation domain rejects any decimal digit in the sentence. The approved AI input projection contains no numeric weather, so temperatures, clock times, percentages and wind speeds cannot appear in AI prose. The language signal uses a closed per-locale function-word list: Turkish accepts a list word or a Turkish-specific letter, while English requires a list word and rejects those letters. It must contain no entry from a closed banned-content list covering provider and model names, "AI", URLs and emoji. The schema enforces length, one sentence and no line break. A failed sentence is discarded alone: valid picks remain valid, and Today uses its deterministic localized first insight line. Accepted text and its requested locale are optional paired fields inside the existing `recommendation_snapshots.context_json`; older rows without them still parse. Today shows accepted prose only when its stored locale matches the current language. Outfit picks continue through their full shared and domain validation gates.

## Red lines

- Never add the field to the v1 response or change its frozen shape for strict installed readers.
- Never expose provider or model names in the sentence.
- Never widen the approved AI input projection for the sentence, including with a name, history, photo, identifier or coordinate.
- Never repair invalid prose or reject otherwise valid outfit picks because only the optional sentence failed.

## Consequences

A closed function-word check is a limited language signal and can reject valid phrasing or accept awkward phrasing. The deterministic localized sentence covers rejection without losing the selected outfits. A tolerant v2 response reader still requires strict validation of the fields it knows.

The v2 route separates a new mobile-facing shape from installed v1 readers. The insight is AI's only visible prose field; every other visible string comes from localization keys. The v2 aesthetics list adds one low-cardinality Worker cache-key field without putting free text into the request. The on-device selection tier retains its structured pick boundary and can use the deterministic first insight line.
