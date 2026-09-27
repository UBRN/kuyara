// Run from the repository root with Node's TypeScript resolver. This measures the full
// sorted pool, before the 24-option selection, without a Worker or Simulator.
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';

import { listGarmentTypesForPreference } from '@/features/catalog/domain/garment-catalog';
import {
  evaluateGarmentEligibility,
  projectCatalogEffectiveGarment,
} from '@/features/recommendation/domain/garment-eligibility';
import { collectValidOutfits } from '@/features/recommendation/domain/outfit-composition';
import { deriveClothingRequirements } from '@/features/recommendation/domain/weather-to-clothing-requirements';
import { gridRecommendationInput } from '../test/recommendation-grid.mjs';

const weatherCases = ['hot', 'mild', 'cold_rain', 'freezing'];
const cells = ['womens', 'mens'].flatMap((preference) =>
  ['casual', 'smart', 'formal'].flatMap((dressStyle) =>
    weatherCases.map((weather) => ({ preference, dressStyle, weather }))));

function compose(cell) {
  const input = gridRecommendationInput(
    cell.weather, cell.preference, cell.dressStyle,
  );
  const requirements = deriveClothingRequirements(input.snapshot, input.now);
  const candidates = listGarmentTypesForPreference(cell.preference).map(({ typeId }) =>
    evaluateGarmentEligibility(
      requirements,
      projectCatalogEffectiveGarment(typeId, cell.preference),
    ));
  const started = performance.now();
  const result = collectValidOutfits(requirements, candidates);
  return { result, ms: performance.now() - started };
}

function percentile(sorted, fraction) {
  return sorted[Math.ceil(sorted.length * fraction) - 1];
}

// One warmup pass followed by three measured passes. The hash covers every position and
// every outfit, while retaining only one JSON cell at a time.
for (const cell of cells) compose(cell);
const samples = [];
let goldenDigest = '';
let outfitCount = 0;
for (let pass = 0; pass < 3; pass += 1) {
  const hash = createHash('sha256');
  let count = 0;
  for (const cell of cells) {
    const { result, ms } = compose(cell);
    samples.push(ms);
    const ordered = result.status === 'composed'
      ? result.outfits.map((outfit, order) => ({
          order,
          compositionKey: outfit.compositionKey,
          score: outfit.score,
          formality: outfit.formality,
        }))
      : { failure: result.reasonCodes };
    if (Array.isArray(ordered)) count += ordered.length;
    hash.update(JSON.stringify({ cell, ordered }));
  }
  const digest = hash.digest('hex');
  if (goldenDigest && digest !== goldenDigest) {
    throw new Error('Composition output changed between identical benchmark passes');
  }
  goldenDigest = digest;
  outfitCount = count;
}
samples.sort((left, right) => left - right);
console.log(`Cells: ${cells.length}; ordered outfits per pass: ${outfitCount}`);
console.log(`Full composition: median ${percentile(samples, 0.5).toFixed(2)} ms; p90 ${percentile(samples, 0.9).toFixed(2)} ms (${samples.length} samples)`);
console.log(`Golden SHA-256: ${goldenDigest}`);
