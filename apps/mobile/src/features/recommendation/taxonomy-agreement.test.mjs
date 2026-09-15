// Sixteen closed vocabularies are declared twice on purpose: once in the mobile domain, once
// in the shared contract. AGENTS.md wants that duplication (domain models, DTOs and future
// remote records stay separate), so nothing here merges or dedupes them. What was missing is
// the assertion that the two copies still agree.
//
// The cost of silent drift is concrete. `data/worker-ai-recommendation-mapper.ts` (around
// line 95) builds `z.enum(garmentTypeIds)` from the *contract* tuple and validates candidates
// produced by the mobile catalog with it. A garment type added to the mobile taxonomy but not
// to the contract type-checks and lints clean, passes CI, and then fails runtime validation on
// a real device: the user sees "Standard suggestions" instead of an AI-selected outfit.
//
// So these tests compare membership, not order. The declaration order of a tuple is a local
// concern (it drives nothing across the boundary); its member set is the boundary.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  bodyRegions as contractBodyRegions,
  breathabilityLevels as contractBreathabilityLevels,
  clothingPreferences as contractClothingPreferences,
  clothingRequirementReasonCodes as contractClothingRequirementReasonCodes,
  colorFamilies as contractColorFamilies,
  coverageLevels as contractCoverageLevels,
  formalityLevels as contractFormalityLevels,
  garmentTypeIds as contractGarmentTypeIds,
  layerRoles as contractLayerRoles,
  outfitSlots as contractOutfitSlots,
  structuralCategories as contractStructuralCategories,
  thermalLevels as contractThermalLevels,
  tractionSuitabilities as contractTractionSuitabilities,
  waterProtections as contractWaterProtections,
  weatherConditionCodes as contractWeatherConditionCodes,
  windProtections as contractWindProtections,
} from '@kuyara/contracts';

import { clothingPreferences } from '../../domain/preferences.ts';
import {
  bodyRegions,
  breathabilityLevels,
  colorFamilies,
  coverageLevels,
  formalityLevels,
  garmentTypeIds,
  layerRoles,
  structuralCategories,
  thermalLevels,
  tractionSuitabilities,
  waterProtections,
  windProtections,
} from '../catalog/domain/garment-taxonomy.ts';
import { weatherConditionCodes } from '../weather/domain/weather.ts';
import { outfitSlots } from './domain/outfit-composition.ts';
import { clothingRequirementReasonCodes } from './domain/weather-to-clothing-requirements.ts';

const MOBILE = 'apps/mobile';
const CONTRACTS = 'packages/contracts';

function describeDifference(label, members) {
  return members.length === 0 ? `${label}: none` : `${label}: ${members.join(', ')}`;
}

// Fails naming the pair, the two source files, and every member each side is missing.
function assertSameVocabulary(name, mobileSource, mobileTuple, contractSource, contractTuple) {
  const mobileMembers = [...mobileTuple];
  const contractMembers = [...contractTuple];
  const mobileSet = new Set(mobileMembers);
  const contractSet = new Set(contractMembers);

  assert.equal(
    mobileSet.size,
    mobileMembers.length,
    `${name}: ${mobileSource} declares a duplicate member`,
  );
  assert.equal(
    contractSet.size,
    contractMembers.length,
    `${name}: ${contractSource} declares a duplicate member`,
  );

  const onlyInMobile = mobileMembers.filter((member) => !contractSet.has(member));
  const onlyInContract = contractMembers.filter((member) => !mobileSet.has(member));

  assert.ok(
    onlyInMobile.length === 0 && onlyInContract.length === 0,
    [
      `${name} disagrees between ${mobileSource} (${mobileMembers.length} members) and ${contractSource} (${contractMembers.length} members).`,
      describeDifference(`  in ${mobileSource} but missing from ${contractSource}`, onlyInMobile),
      describeDifference(`  in ${contractSource} but missing from ${mobileSource}`, onlyInContract),
      '  Add the member to the other side; do not merge the two tuples.',
    ].join('\n'),
  );
}

const catalogTaxonomyPairs = [
  ['garmentTypeIds', garmentTypeIds, contractGarmentTypeIds],
  ['structuralCategories', structuralCategories, contractStructuralCategories],
  ['layerRoles', layerRoles, contractLayerRoles],
  ['formalityLevels', formalityLevels, contractFormalityLevels],
  ['thermalLevels', thermalLevels, contractThermalLevels],
  ['coverageLevels', coverageLevels, contractCoverageLevels],
  ['breathabilityLevels', breathabilityLevels, contractBreathabilityLevels],
  ['waterProtections', waterProtections, contractWaterProtections],
  ['windProtections', windProtections, contractWindProtections],
  ['tractionSuitabilities', tractionSuitabilities, contractTractionSuitabilities],
  ['colorFamilies', colorFamilies, contractColorFamilies],
  ['bodyRegions', bodyRegions, contractBodyRegions],
];

catalogTaxonomyPairs.forEach(([name, mobileTuple, contractTuple]) => {
  test(`${name} agrees between the catalog taxonomy and the AI contract`, () => {
    assertSameVocabulary(
      name,
      `${MOBILE}/src/features/catalog/domain/garment-taxonomy.ts`,
      mobileTuple,
      `${CONTRACTS}/src/ai-v1.ts`,
      contractTuple,
    );
  });
});

test('outfitSlots agrees between outfit composition and the AI contract', () => {
  assertSameVocabulary(
    'outfitSlots',
    `${MOBILE}/src/features/recommendation/domain/outfit-composition.ts`,
    outfitSlots,
    `${CONTRACTS}/src/ai-v1.ts`,
    contractOutfitSlots,
  );
});

test('clothingRequirementReasonCodes agrees between the requirement rules and the AI contract', () => {
  assertSameVocabulary(
    'clothingRequirementReasonCodes',
    `${MOBILE}/src/features/recommendation/domain/weather-to-clothing-requirements.ts`,
    clothingRequirementReasonCodes,
    `${CONTRACTS}/src/ai-v1.ts`,
    contractClothingRequirementReasonCodes,
  );
});

test('clothingPreferences agrees between the preference domain and the AI contract', () => {
  assertSameVocabulary(
    'clothingPreferences',
    `${MOBILE}/src/domain/preferences.ts`,
    clothingPreferences,
    `${CONTRACTS}/src/ai-v1.ts`,
    contractClothingPreferences,
  );
});

test('weatherConditionCodes agrees between the weather domain and the weather contract', () => {
  assertSameVocabulary(
    'weatherConditionCodes',
    `${MOBILE}/src/features/weather/domain/weather.ts`,
    weatherConditionCodes,
    `${CONTRACTS}/src/weather-v1.ts`,
    contractWeatherConditionCodes,
  );
});
