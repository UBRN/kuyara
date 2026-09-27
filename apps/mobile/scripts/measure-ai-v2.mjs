// Measures how the Worker's v2 AI selection behaves, not only whether it is valid: formality
// preference against the deterministic fallback, pick position, archetype spread, and the
// insight sentence. It is the before/after instrument for prompt changes, with the same
// hard call ceiling as measure-ai-chain.mjs. Run it from apps/mobile:
//
//   node --experimental-strip-types --import ./test/node-typescript-resolver.mjs \
//     ./scripts/measure-ai-v2.mjs --base-url <url> --out <dir outside the repo> \
//     --max-calls 30 --permutations 6 --salt 0
//
// There is no default base URL, and `--max-calls 0` (the default) prints the plan only.
//
// Cache: the Worker caches validated answers for 30 days under a key that includes
// a prompt version, dayVariant and styleAesthetics. The latter two do not reach the model
// (`aiModelInputFromRequest` leaves both out; the script asserts it per call), so each call
// carries a distinct salt in those two fields to miss every earlier entry. A later run after
// a prompt change must use a new `--salt` range, or it reads this run's answers back.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import {
  aiModelInputFromRequest,
  archetypeDayFromRequirements,
  aiRecommendV1BudgetHeader,
  aiRecommendV2Path,
  aiRecommendV2RequestSchema,
  aiRecommendV2SuccessSchema,
  formalityOrderByDressStyle,
  styleAesthetics,
} from '@kuyara/contracts';

import { recommendOutfits } from '@/features/recommendation/application/recommend-outfits.ts';
import { mapWorkerAiRecommendation } from '@/features/recommendation/data/worker-ai-recommendation-mapper.ts';
import { validateInsightSentence } from '@/features/recommendation/domain/insight-sentence.ts';

import { gridRecommendationInput, gridRequestCells } from '../test/recommendation-grid.mjs';

const hardCallCap = 30;
// AI_RECOMMEND_RATE_LIMIT allows 10 requests per 60 s per IP.
const callSpacingMs = 7_000;
// A model answer takes seconds; a shared-cache answer returns in milliseconds.
const likelyCachedBelowMs = 800;
const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url));

// Prefixes matched against the start of each lower-cased word. A sentence matching any of
// them can describe weather; the four day flags below check whether a claim is grounded.
// Short Turkish stems that collide with ordinary words are exact forms.
const weatherKeywords = Object.freeze({
  en: {
    prefixes: ['rain', 'drizzl', 'shower', 'wet', 'damp', 'snow', 'sleet', 'wind', 'breez', 'gust',
      'sun', 'heat', 'hot', 'warm', 'cold', 'chill', 'cool', 'freez', 'frost', 'icy', 'weather',
      'cloud', 'overcast', 'storm', 'humid', 'temperatur', 'degree', 'mild', 'brisk', 'crisp'],
    exact: [],
    excluded: ['sunday', 'sunglass', 'sunglasses', 'hotel', 'shower-proof'],
  },
  tr: {
    prefixes: ['yağmur', 'yağış', 'sağanak', 'çisent', 'ıslak', 'rüzgar', 'rüzgâr', 'esint',
      'fırtına', 'güneş', 'sıcak', 'ılık', 'soğuk', 'serin', 'ayaz', 'dondurucu', 'buz', 'bulut',
      'nem', 'derece', 'hava'],
    exact: ['kar', 'karlı', 'karda', 'kardan', 'karla'],
    excluded: ['havalı'],
  },
});

function weatherClaims(sentence, locale) {
  const { prefixes, exact, excluded } = weatherKeywords[locale];
  const words = sentence.toLocaleLowerCase(locale).match(/\p{L}+/gu) ?? [];
  return words.filter((word) => !excluded.includes(word)
    && (exact.includes(word) || prefixes.some((prefix) => word.startsWith(prefix))));
}

const weatherFlagPrefixes = Object.freeze({
  en: {
    frozen: ['snow', 'sleet', 'freez', 'frost', 'icy'],
    wet: ['rain', 'drizzl', 'shower', 'wet', 'damp'],
    cold: ['cold', 'chill', 'cool', 'brisk', 'crisp'],
    windy: ['wind', 'breez', 'gust'],
  },
  tr: {
    frozen: ['kar', 'buz', 'dondurucu'],
    wet: ['yağmur', 'yağış', 'sağanak', 'çisent', 'ıslak'],
    cold: ['soğuk', 'serin', 'ayaz'],
    windy: ['rüzgar', 'rüzgâr', 'esint'],
  },
});

function weatherContradictions(sentence, locale, day) {
  const claims = weatherClaims(sentence, locale);
  const classified = claims.map((word) => ({
    word,
    flag: Object.entries(weatherFlagPrefixes[locale])
      .find(([, prefixes]) => prefixes.some((prefix) => word.startsWith(prefix)))?.[0],
  }));
  const hasSpecificClaim = classified.some(({ flag, word }) =>
    flag !== undefined || (locale === 'en' ? word !== 'weather' : word !== 'hava'));
  return classified.filter(({ word, flag }) => {
    if (flag !== undefined) return !day[flag];
    if ((locale === 'en' && word === 'weather') || (locale === 'tr' && word === 'hava')) {
      return !hasSpecificClaim;
    }
    return true;
  }).map(({ word }) => word);
}

// Twelve cells spread evenly: each weather profile walked in order against each
// preference x dress-style pair walked in order, so every dress style appears four times.
function selectCells(count) {
  const cells = gridRequestCells().filter(({ request }) => request !== null);
  const weatherKeys = [...new Set(cells.map(({ weatherKey }) => weatherKey))];
  const pairs = [['womens', 'casual'], ['mens', 'smart'], ['womens', 'formal'],
    ['mens', 'casual'], ['womens', 'smart'], ['mens', 'formal']];
  return Array.from({ length: count }, (_unused, index) => {
    const [clothingPreference, dressStyle] = pairs[index % pairs.length];
    return cells.find((cell) => cell.weatherKey === weatherKeys[index % weatherKeys.length]
      && cell.clothingPreference === clothingPreference && cell.dressStyle === dressStyle);
  }).filter(Boolean);
}

// dayVariant 1..6 x every sorted one-to-three aesthetic set: 150 salts that never equal the
// grid's own key (dayVariant 0, no aesthetics).
const sortedAesthetics = [...styleAesthetics].sort();
const aestheticSets = sortedAesthetics.flatMap((first, i) => [
  [first],
  ...sortedAesthetics.slice(i + 1).flatMap((second, j) => [
    [first, second],
    ...sortedAesthetics.slice(i + j + 2).map((third) => [first, second, third]),
  ]),
]);
function saltFields(index) {
  return {
    dayVariant: 1 + (index % 6),
    styleAesthetics: aestheticSets[Math.floor(index / 6) % aestheticSets.length],
  };
}

function parseArguments() {
  const { values } = parseArgs({
    options: {
      'base-url': { type: 'string' },
      out: { type: 'string' },
      'max-calls': { type: 'string', default: '0' },
      cells: { type: 'string', default: '12' },
      locales: { type: 'string', default: 'tr,en' },
      permutations: { type: 'string', default: '0' },
      salt: { type: 'string', default: '0' },
    },
  });
  const maxCalls = Number(values['max-calls']);
  const cellCount = Number(values.cells);
  const permutations = Number(values.permutations);
  const salt = Number(values.salt);
  const locales = values.locales.split(',');
  if (!Number.isInteger(maxCalls) || maxCalls < 0 || maxCalls > hardCallCap) {
    throw new Error(`--max-calls must be an integer from 0 to ${hardCallCap}.`);
  }
  if (![cellCount, permutations, salt].every((value) => Number.isInteger(value) && value >= 0)) {
    throw new Error('--cells, --permutations and --salt must be non-negative integers.');
  }
  if (!locales.every((locale) => locale === 'tr' || locale === 'en')) {
    throw new Error('--locales accepts tr and en.');
  }
  if (maxCalls > 0 && values['base-url'] === undefined) {
    throw new Error('--base-url is required; there is no default so nothing hits production by accident.');
  }
  const out = values.out === undefined ? undefined : resolve(values.out);
  if (maxCalls > 0 && out === undefined) throw new Error('--out is required to keep raw responses.');
  if (out && (out + sep).startsWith(repositoryRoot)) {
    throw new Error('--out must be outside the repository; raw responses are never committed.');
  }
  return { baseUrl: values['base-url'], out, maxCalls, cellCount, locales, permutations, salt };
}

// Forward calls first (every cell in every locale), then the reversed-order twins, so a run
// cut short keeps complete forward data.
function buildPlan({ cellCount, locales, permutations, salt }) {
  const cells = selectCells(cellCount);
  const forward = cells.flatMap((cell) => locales.map((locale) => ({ cell, locale, reversed: false })));
  // Twin i reverses cell i in alternating locales.
  const reversed = cells.slice(0, permutations).map((cell, index) => ({
    cell, locale: locales[index % locales.length], reversed: true,
  }));
  return [...forward, ...reversed].map((entry, index) => {
    const base = entry.cell.request;
    const options = entry.reversed ? [...base.options].reverse() : base.options;
    const request = aiRecommendV2RequestSchema.parse({
      ...base, options, locale: entry.locale, ...saltFields(salt + index),
    });
    const unsalted = { ...base, options };
    if (JSON.stringify(aiModelInputFromRequest(request)) !== JSON.stringify(aiModelInputFromRequest(unsalted))) {
      throw new Error('The cache salt changed the model input; refusing to measure.');
    }
    return { ...entry, request };
  });
}

function fallbackFor(cell) {
  const result = recommendOutfits(gridRecommendationInput(cell.weatherKey, cell.clothingPreference,
    cell.dressStyle));
  return result.status === 'recommended' ? result.outfits : [];
}

function mean(values) {
  return values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function analyse({ cell, locale, request }, body) {
  const order = formalityOrderByDressStyle[cell.dressStyle];
  const options = request.options;
  const modelOptions = aiModelInputFromRequest(request).options;
  const indexOf = new Map(modelOptions.map((option, index) => [option.optionId, index]));
  const picks = body?.data?.picks ?? [];
  const pickFormalities = picks.map(({ optionId }) => modelOptions[indexOf.get(optionId)]?.formality);
  const fallback = fallbackFor(cell);
  let gateAccepts = false;
  try {
    mapWorkerAiRecommendation(request, body.data, 'ai-assisted', { locale });
    gateAccepts = true;
  } catch {
    // A reply the gate rejects is the measurement, not an error here.
  }
  const sentence = typeof body?.data?.insightSentence === 'string' ? body.data.insightSentence : null;
  const day = archetypeDayFromRequirements(request.requirements);
  const finalPunctuation = sentence !== null && /[.!?…]$/u.test(sentence);
  return {
    schemaAccepts: aiRecommendV2SuccessSchema.safeParse(body).success,
    gateAccepts,
    picks: picks.map((pick, index) => ({ ...pick, index: indexOf.get(pick.optionId) ?? null,
      formality: pickFormalities[index] ?? null })),
    optionCount: options.length,
    topFormality: order[0],
    topFormalityShare: picks.length ? pickFormalities.filter((value) => value === order[0]).length / picks.length : null,
    poolTopFormalityShare: options.filter(({ formality }) => formality === order[0]).length / options.length,
    fallbackTopFormalityShare: fallback.length
      ? fallback.filter(({ formality }) => formality === order[0]).length / fallback.length : null,
    fallbackOptionIds: fallback.map(({ optionId }) => optionId),
    overlapWithFallback: picks.filter(({ optionId }) => fallback.some((outfit) => outfit.optionId === optionId)).length,
    meanPickIndex: mean(picks.map(({ optionId }) => indexOf.get(optionId)).filter((value) => value !== undefined)),
    sentence,
    sentenceAccepted: sentence !== null && validateInsightSentence({ sentence, locale }) !== null,
    sentenceLength: sentence?.length ?? null,
    weatherClaimWords: sentence === null ? [] : weatherClaims(sentence, locale),
    weatherContradictionWords: sentence === null ? [] : weatherContradictions(sentence, locale, day),
    noFinalPunctuation: sentence !== null && !finalPunctuation,
    endsAtLengthCap: sentence !== null && !finalPunctuation && sentence.length >= 85,
  };
}

async function send(baseUrl, request) {
  const startedAt = Date.now();
  try {
    const response = await fetch(new URL(aiRecommendV2Path, baseUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json', [aiRecommendV1BudgetHeader]: '37000' },
      body: JSON.stringify(request),
    });
    const body = await response.json().catch(() => null);
    return { status: response.status, body, latencyMs: Date.now() - startedAt, transportError: null };
  } catch (error) {
    return { status: null, body: null, latencyMs: Date.now() - startedAt,
      transportError: error instanceof Error ? error.message : String(error) };
  }
}

function share(results, predicate) {
  return `${results.filter(predicate).length}/${results.length}`;
}

function format(value) {
  return value === null ? 'n/a' : value.toFixed(2);
}

function summarise(results, locales) {
  for (const locale of locales) {
    const answered = results.filter((result) => result.locale === locale && !result.reversed && result.status === 200);
    const withSentence = answered.filter(({ metrics }) => metrics.sentence !== null);
    const archetypes = new Map();
    for (const { metrics } of answered) {
      for (const { archetypeId } of metrics.picks) archetypes.set(archetypeId, (archetypes.get(archetypeId) ?? 0) + 1);
    }
    console.log(`\n[${locale}] forward answers n=${answered.length} (likely cached ${share(answered, (result) => result.likelyCached)})`);
    console.log(`  gate accepts ${share(answered, ({ metrics }) => metrics.gateAccepts)}`);
    console.log(`  top-formality share: AI ${format(mean(answered.map(({ metrics }) => metrics.topFormalityShare)))}, fallback same cells ${format(mean(answered.map(({ metrics }) => metrics.fallbackTopFormalityShare)))}, pool base rate ${format(mean(answered.map(({ metrics }) => metrics.poolTopFormalityShare)))} (n=${answered.length})`);
    console.log(`  picks shared with the fallback triple: mean ${format(mean(answered.map(({ metrics }) => metrics.overlapWithFallback)))} of 3`);
    console.log(`  mean pick index ${format(mean(answered.map(({ metrics }) => metrics.meanPickIndex)))} (options per cell ${format(mean(answered.map(({ metrics }) => metrics.optionCount)))}, uniform expectation ${format(mean(answered.map(({ metrics }) => (metrics.optionCount - 1) / 2)))})`);
    console.log(`  archetypes (${answered.length * 3} picks): ${[...archetypes].sort((a, b) => b[1] - a[1]).map(([id, count]) => `${id}=${count}`).join(' ')}`);
    console.log(`  sentence present ${share(answered, ({ metrics }) => metrics.sentence !== null)}, mobile validator accepts ${share(withSentence, ({ metrics }) => metrics.sentenceAccepted)} of present`);
    console.log(`  weather claim ${share(withSentence, ({ metrics }) => metrics.weatherClaimWords.length > 0)}, contradicts day flags ${share(withSentence, ({ metrics }) => metrics.weatherContradictionWords.length > 0)}, no final punctuation ${share(withSentence, ({ metrics }) => metrics.noFinalPunctuation)}, ends at the 85-90 char cap without punctuation ${share(withSentence, ({ metrics }) => metrics.endsAtLengthCap)}, mean length ${format(mean(withSentence.map(({ metrics }) => metrics.sentenceLength)))}`);
    for (const { name, metrics } of answered) {
      console.log(`    ${name}: ${JSON.stringify(metrics.sentence)}${metrics.weatherClaimWords.length ? ` weather=${metrics.weatherClaimWords.join(',')}` : ''}${metrics.weatherContradictionWords.length ? ` contradicts=${metrics.weatherContradictionWords.join(',')}` : ''}`);
    }
  }
  const reversed = results.filter((result) => result.reversed && result.status === 200);
  if (reversed.length) console.log('\nPermutation (same cell and locale, option order reversed):');
  for (const twin of reversed) {
    const original = results.find((result) => !result.reversed && result.status === 200
      && result.name === twin.name && result.locale === twin.locale);
    if (!original) continue;
    const forwardIds = original.metrics.picks.map(({ optionId }) => optionId);
    const forwardIndex = new Map(aiModelInputFromRequest(original.request).options
      .map((option, index) => [option.optionId, index]));
    const overlap = twin.metrics.picks.filter(({ optionId }) => forwardIds.includes(optionId)).length;
    console.log(`  ${twin.name} ${twin.locale}: overlap ${overlap}/3; forward-order indexes ${original.metrics.picks.map(({ index }) => index).join(',')} vs reversed ${twin.metrics.picks.map(({ optionId }) => forwardIndex.get(optionId)).join(',')}; top-formality ${format(original.metrics.topFormalityShare)} vs ${format(twin.metrics.topFormalityShare)}`);
  }
}

async function main() {
  const options = parseArguments();
  const plan = buildPlan(options);
  console.log(`Plan: ${plan.length} requests (${plan.filter(({ reversed }) => reversed).length} reversed); sending at most ${options.maxCalls}${options.baseUrl ? ` to ${options.baseUrl}` : ''}. Salt range ${options.salt}..${options.salt + plan.length - 1}.`);
  for (const locale of options.locales) {
    const { prefixes, exact, excluded } = weatherKeywords[locale];
    console.log(`Weather keywords ${locale}: prefixes ${prefixes.join(' ')}; exact ${exact.join(' ') || '-'}; excluded ${excluded.join(' ')}`);
  }
  for (const [index, { cell, locale, reversed, request }] of plan.entries()) {
    console.log(`  ${index + 1}. ${cell.name} ${locale}${reversed ? ' reversed' : ''}: ${request.options.length} options, dayVariant ${request.dayVariant}, aesthetics ${request.styleAesthetics.join('+')}`);
  }
  if (options.maxCalls === 0) {
    console.log('--max-calls 0: nothing sent.');
    return;
  }

  mkdirSync(options.out, { recursive: true });
  const results = [];
  for (const [index, entry] of plan.slice(0, options.maxCalls).entries()) {
    if (index > 0) await new Promise((done) => setTimeout(done, callSpacingMs));
    const reply = await send(options.baseUrl, entry.request);
    const result = {
      index: index + 1,
      name: entry.cell.name,
      locale: entry.locale,
      reversed: entry.reversed,
      salt: { dayVariant: entry.request.dayVariant, styleAesthetics: entry.request.styleAesthetics },
      ...reply,
      likelyCached: reply.status === 200 && reply.latencyMs < likelyCachedBelowMs,
      metrics: reply.status === 200 ? analyse(entry, reply.body) : null,
      request: entry.request,
    };
    results.push(result);
    writeFileSync(resolve(options.out, `${String(index + 1).padStart(2, '0')}-${entry.cell.name.replaceAll('/', '-')}-${entry.locale}${entry.reversed ? '-reversed' : ''}.json`),
      `${JSON.stringify(result, null, 2)}\n`);
    console.log(`[${index + 1}/${options.maxCalls}] ${result.name} ${result.locale}${result.reversed ? ' reversed' : ''} HTTP ${result.status ?? 'none'} ${result.latencyMs}ms${result.likelyCached ? ' likely-cached' : ''}${result.metrics ? ` gate=${result.metrics.gateAccepts} picks=${result.metrics.picks.map(({ index: pickIndex }) => pickIndex).join(',')}` : ''}${result.body?.error?.code ? ` error=${result.body.error.code}` : ''}${result.transportError ? ` transport=${result.transportError}` : ''}`);
    // Any other answer is a quota, rate-limit, budget or request error: stop, keep what we have.
    if (result.status !== 200) {
      console.log('Stopped at the first non-200 answer.');
      break;
    }
  }
  summarise(results, options.locales);
  writeFileSync(resolve(options.out, 'summary.json'), `${JSON.stringify(results.map(({ request: _request, ...rest }) => rest), null, 2)}\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
