// Lists the free OpenRouter models a structured-output request can reach, most popular first,
// as the candidate list for `measure:ai-chain` (docs/testing.md, "AI tiers in E2E"). Reads only
// the public model list, without a key, and sends no completion request:
//
//   pnpm --filter @kuyara/mobile rank:free-ai-models
//
// Limit: popularity is OpenRouter's documented `sort=top-weekly` (all users' tokens of the last week), volume and not quality, and it moves weekly.
const modelsUrl = 'https://openrouter.ai/api/v1/models?sort=top-weekly';

const response = await fetch(modelsUrl);
if (!response.ok) throw new Error(`Model list request failed with HTTP ${response.status}.`);
const { data } = await response.json();

// The OpenRouter adapter sends a strict `json_schema` response_format with
// `provider.require_parameters`, so a model is reachable only when its endpoint lists both.
const rows = data
  .map((model, index) => ({ model, popularity: index + 1 }))
  .filter(({ model }) => model.id.endsWith(':free')
    && model.pricing?.prompt === '0'
    && model.pricing?.completion === '0'
    && (model.supported_parameters.includes('response_format')
      || model.supported_parameters.includes('structured_outputs')));

const yesNo = (value) => (value ? 'yes' : 'no');
console.log(`Source: ${modelsUrl}, ${data.length} models, read ${new Date().toISOString()}.`);
console.log('| Popularity | Model | response_format | structured_outputs | Reasoning |');
console.log('|---|---|---|---|---|');
for (const { model, popularity } of rows) {
  const parameters = model.supported_parameters;
  const reasoning = model.reasoning === undefined
    ? 'none'
    : model.reasoning.mandatory ? 'mandatory' : `optional, default ${model.reasoning.default_enabled ? 'on' : 'off or unstated'}`;
  console.log(`| ${popularity} | ${model.id} | ${yesNo(parameters.includes('response_format'))} | ${yesNo(parameters.includes('structured_outputs'))} | ${reasoning} |`);
}
