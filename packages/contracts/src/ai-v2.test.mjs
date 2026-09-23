import assert from 'node:assert/strict';
import test from 'node:test';

import {
  aiRecommendV2Path,
  aiRecommendV2RequestSchema,
  aiRecommendV2SuccessSchema,
  styleAesthetics,
} from './ai-v2.ts';

const option = (optionId) => ({
  optionId,
  formality: 'casual',
  garments: [
    { slot: 'primary_top', layerRole: 'standalone', garmentTypeId: 't_shirt' },
    { slot: 'bottom', layerRole: 'standalone', garmentTypeId: 'trousers' },
    { slot: 'footwear', layerRole: null, garmentTypeId: 'sneakers' },
  ],
  traits: {
    hasMidLayer: false, hasOuterLayer: false, outerThermalHigh: false,
    outerWaterProtective: false, windResistant: false, tractionEnhanced: false,
    breathabilityHigh: true,
  },
});
const request = {
  clothingPreference: 'womens', catalogVersion: 1, dayVariant: 0,
  requirements: [], options: [option('option-1')], locale: 'en',
};
const success = {
  data: { picks: [
    { optionId: 'option-1', archetypeId: 'everyday_easy' },
    { optionId: 'option-2', archetypeId: 'smart_casual' },
    { optionId: 'option-3', archetypeId: 'office_ready' },
  ] },
};

test('v2 request requires the reader locale and a sorted closed aesthetics list', () => {
  assert.equal(aiRecommendV2Path, '/v2/ai/recommend');
  assert.deepEqual(styleAesthetics, ['minimal', 'classic', 'sporty', 'streetwear', 'relaxed']);
  for (const locale of ['en', 'tr']) {
    assert.equal(aiRecommendV2RequestSchema.safeParse({ ...request, locale }).success, true);
  }
  for (const fields of [
    { locale: undefined }, { locale: 'fr' },
    { styleAesthetics: ['minimal', 'classic'] },
    { styleAesthetics: ['classic', 'classic'] },
    { styleAesthetics: ['classic', 'minimal', 'sporty', 'streetwear'] },
    { styleAesthetics: ['unknown'] }, { privateField: 'no' },
    { options: [option('duplicate'), option('duplicate')] },
  ]) assert.equal(aiRecommendV2RequestSchema.safeParse({ ...request, ...fields }).success, false);
  assert.equal(aiRecommendV2RequestSchema.safeParse({
    ...request, styleAesthetics: ['classic', 'minimal', 'sporty'].sort(),
  }).success, true);
});

test('v2 sentence is optional, trimmed, one line, and at most 90 characters', () => {
  for (const sentence of ['A', 'x'.repeat(90), 'A clear day suits this outfit.']) {
    assert.equal(aiRecommendV2SuccessSchema.safeParse({
      data: { ...success.data, insightSentence: sentence },
    }).success, true);
  }
  assert.equal(aiRecommendV2SuccessSchema.safeParse(success).success, true);
  for (const sentence of ['', ' '.repeat(2), 'x'.repeat(91), 'A. B.',
    'A\nB', 'A\rB', ' A.', 'A. ']) {
    assert.equal(aiRecommendV2SuccessSchema.safeParse({
      data: { ...success.data, insightSentence: sentence },
    }).success, false, JSON.stringify(sentence));
  }
  assert.deepEqual(aiRecommendV2SuccessSchema.parse({
    extra: true, data: { ...success.data, extra: true, insightSentence: 'A clear day.' },
  }), { data: { ...success.data, insightSentence: 'A clear day.' } });
  assert.equal(aiRecommendV2SuccessSchema.safeParse({ data: { picks: [
    success.data.picks[0], success.data.picks[0], success.data.picks[2],
  ] } }).success, false);
});
