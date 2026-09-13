// Measures the Worker's live AI provider chain with real request bodies and a hard call
// ceiling, so a measurement can never become the load that exhausts the shared free quota.
// Usage is documented in docs/testing.md, "AI tiers in E2E". Run it from the repository root:
//
//   pnpm --filter @kuyara/mobile measure:ai-chain --base-url http://127.0.0.1:8788
//
// There is deliberately no default base URL: the deployed Worker is only ever measured on
// purpose. `--max-calls 0` builds and prints the fixture grid without sending anything.
import { parseArgs } from 'node:util';

import {
  aiRecommendV1BudgetHeader,
  aiRecommendV1Path,
  aiRecommendV1SuccessSchema,
} from '@kuyara/contracts';

import { mapWorkerAiRecommendation } from '@/features/recommendation/data/worker-ai-recommendation-mapper.ts';

import { gridRequestCells } from '../test/recommendation-grid.mjs';

const hardCallCap = 30;

// The grid is the AI-selection suite's own: clothing preference x dress style x weather
// profile, built by the functions the application itself calls. Sharing it means a change in
// the catalog, the requirement thresholds or the composition rules moves what is measured
// too, instead of leaving this script measuring a second, drifting set of fixtures.
function buildFixtures() {
  return gridRequestCells()
    .filter(({ request }) => request !== null)
    .map(({ name, request }) => ({ name, request }));
}

function parseArguments() {
  const { values } = parseArgs({
    options: {
      'base-url': { type: 'string' },
      'max-calls': { type: 'string', default: '10' },
    },
  });
  const maxCalls = Number(values['max-calls']);
  if (values['base-url'] === undefined) {
    throw new Error('--base-url is required; there is no default so nothing hits production by accident.');
  }
  if (!Number.isInteger(maxCalls) || maxCalls < 0 || maxCalls > hardCallCap) {
    throw new Error(`--max-calls must be an integer from 0 to ${hardCallCap}.`);
  }
  return { baseUrl: values['base-url'], maxCalls };
}

async function measure({ baseUrl, request, name }) {
  const startedAt = Date.now();
  let status = null;
  let body = null;
  let transportError = null;
  try {
    const response = await fetch(new URL(aiRecommendV1Path, baseUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json', [aiRecommendV1BudgetHeader]: '37000' },
      body: JSON.stringify(request),
    });
    status = response.status;
    body = await response.json().catch(() => null);
  } catch (error) {
    transportError = error instanceof Error ? error.message : String(error);
  }
  const latencyMs = Date.now() - startedAt;

  const schemaAccepts = status === 200 && aiRecommendV1SuccessSchema.safeParse(body).success;
  let gateAccepts = false;
  if (schemaAccepts) {
    try {
      mapWorkerAiRecommendation(request, body.data);
      gateAccepts = true;
    } catch {
      // A reply the gate rejects is the measurement, not an error here.
    }
  }
  return {
    name,
    status,
    latencyMs,
    schemaAccepts,
    gateAccepts,
    errorCode: body?.error?.code ?? null,
    transportError,
  };
}

// The free-model allowance the recon exhausted. Read directly from OpenRouter, and only when
// a key is already in the environment; the key itself is never printed.
async function printOpenRouterQuota() {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) {
    console.log('OpenRouter quota: OPENROUTER_API_KEY not in the environment, not checked.');
    return;
  }
  try {
    const response = await fetch('https://openrouter.ai/api/v1/key', {
      headers: { authorization: `Bearer ${key}` },
    });
    const body = await response.json();
    const data = body?.data ?? {};
    console.log(
      `OpenRouter quota: HTTP ${response.status} usage=${data.usage ?? 'unknown'} limit=${data.limit ?? 'none'} remaining=${data.limit_remaining ?? 'unknown'} free-tier=${data.is_free_tier ?? 'unknown'}`,
    );
  } catch (error) {
    console.log(`OpenRouter quota: not readable (${error instanceof Error ? error.message : String(error)}).`);
  }
}

async function main() {
  const { baseUrl, maxCalls } = parseArguments();
  const fixtures = buildFixtures();
  console.log(`Built ${fixtures.length} requests; sending at most ${maxCalls} to ${baseUrl}.`);
  for (const { name, request } of fixtures) {
    console.log(`  ${name}: ${request.options.length} options`);
  }
  if (maxCalls === 0) {
    console.log('--max-calls 0: nothing sent.');
    return;
  }

  const results = [];
  for (const fixture of fixtures.slice(0, maxCalls)) {
    const result = await measure({ ...fixture, baseUrl });
    results.push(result);
    console.log(
      `[${results.length}/${maxCalls}] ${result.name} HTTP ${result.status ?? 'none'} ${result.latencyMs}ms schema=${result.schemaAccepts} gate=${result.gateAccepts}${result.errorCode ? ` error=${result.errorCode}` : ''}${result.transportError ? ` transport=${result.transportError}` : ''}`,
    );
  }

  // The recommend response is a strict object of picks: no provider or model identifier
  // crosses this route (packages/contracts, `aiRecommendV1SuccessSchema`). Which provider
  // answered is readable only from `wrangler tail` or the probe route.
  console.log('Provider identifier: not carried by the recommend contract.');
  const accepted = results.filter(({ gateAccepts }) => gateAccepts);
  const latencies = results.map(({ latencyMs }) => latencyMs).sort((a, b) => a - b);
  console.log(
    `Summary: ${accepted.length}/${results.length} accepted by the mobile gate; latency min ${latencies.at(0)}ms median ${latencies[Math.floor(latencies.length / 2)]}ms max ${latencies.at(-1)}ms.`,
  );
  const byStatus = new Map();
  for (const { status, errorCode } of results) {
    const key = `${status ?? 'transport failure'}${errorCode ? ` ${errorCode}` : ''}`;
    byStatus.set(key, (byStatus.get(key) ?? 0) + 1);
  }
  for (const [key, count] of byStatus) console.log(`  ${key}: ${count}`);
  await printOpenRouterQuota();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
