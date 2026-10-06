import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import type { AiRecommendV1Request } from '@kuyara/contracts';
import { buildMessages, buildPickJsonSchema } from './ai-prompt.ts';

type Requirements = AiRecommendV1Request['requirements'];
type DressStyle = AiRecommendV1Request['dressStyle'];
// The v1 fields the prompt tests leave at their defaults; `catalogVersion` and `dayVariant`
// are not read by the prompt builder.
const baseRequest = { catalogVersion: 1, dayVariant: 0 };

test('prompt supplies the shared formality preference without personal facts', () => {
  const cases: [DressStyle, string[]][] = [
    ['casual', ['casual', 'smart', 'formal']],
    ['smart', ['smart', 'casual', 'formal']],
    ['formal', ['formal', 'smart', 'casual']],
    [undefined, ['smart', 'casual', 'formal']],
  ];
  for (const [dressStyle, order] of cases) {
    // The personal fields are not part of the request type: they are the extra input the
    // prompt must never forward, so the object is cast to the request type.
    const messages = buildMessages({ ...baseRequest, clothingPreference: 'womens', options: [],
      requirements: [], dressStyle,
      birthDate: '1960-01-01', birthYear: 1960, gender: 'woman' } as AiRecommendV1Request);
    assert.deepEqual(JSON.parse(messages[1].content), {
      clothingPreference: 'womens', options: [], formalityOrder: order,
    });
    for (const forbidden of ['dressStyle', ['age', 'Band'].join(''), 'birthDate', 'birthYear']) {
      assert.equal(messages[1].content.includes(forbidden), false);
    }
    assert.match(messages[0].content, /prefer/i);
  }
});

test('v2 alone asks for one locale-specific insight with closed day flags', () => {
  const base = { ...baseRequest, clothingPreference: 'womens' as const, options: [], requirements: [] };
  const v1 = buildMessages(base);
  const locales: ['tr' | 'en', string][] = [['tr', 'Turkish'], ['en', 'English']];
  for (const [locale, language] of locales) {
    const v2 = buildMessages({ ...base, locale });
    assert.deepEqual(JSON.parse(v2[1].content).day,
      { frozen: false, wet: false, cold: false, windy: false });
    assert.equal(JSON.parse(v1[1].content).day, undefined);
    assert.ok(v2[0].content.includes(`insightSentence: ${language} only`));
    assert.match(v2[0].content, /no numbers\/degrees/i);
    assert.match(v2[0].content, /chosen outfits/i);
    // The Worker drops a sentence under four words or without a closing mark, so the prompt
    // asks for more words than that, a closing period, and the wearer as the subject rather
    // than the catalog audience the input names.
    assert.match(v2[0].content, /5-10 word sentence/);
    // The provider schema caps the string at 90 characters, so the prompt states it too.
    assert.match(v2[0].content, /<=90 chars/);
    // The app's Turkish copy speaks to the reader informally.
    assert.match(v2[0].content, locale === 'tr' ? /to the wearer \(sen\)/ : /to the wearer \(you\)/);
    assert.match(v2[0].content, /ending in a period/);
    assert.match(v2[0].content, /no weather claim/i);
    assert.match(v2[0].content, /wet=rain possible\/likely/i);
    assert.match(v2[0].content, /frozen=snow\/sleet/i);
    assert.match(v2[0].content, /cold=cold day/i);
    assert.match(v2[0].content, /windy=wind/i);
    assert.match(v2[0].content, /no sun\/clear\/heat\/other weather/i);
    assert.equal(v2[0].content.includes('with no prose'), false);
  }
  assert.equal(v1[0].content.includes('insightSentence'), false);
  const v2Schema = buildPickJsonSchema([], true).properties.data;
  assert.deepEqual(v2Schema.properties.insightSentence, { type: 'string', maxLength: 90 });
  assert.deepEqual(v2Schema.required, ['picks', 'insightSentence']);
  assert.deepEqual(Object.keys(v2Schema.properties), ['picks', 'insightSentence']);
  assert.deepEqual(buildPickJsonSchema([]).properties.data.required, ['picks']);
  assert.equal('insightSentence' in buildPickJsonSchema([]).properties.data.properties, false);
});

test('v2 day flags follow frozen, wet, cold and windy requirements', () => {
  const base = { ...baseRequest, clothingPreference: 'womens' as const, options: [] };
  const cases: [Requirements, Record<string, boolean>][] = [
    [[{ kind: 'traction', minimum: 'enhanced', priority: 'mandatory', reasonCodes: ['condition_snow'] }],
      { frozen: true, wet: false, cold: false, windy: false }],
    [[{ kind: 'water_protection', minimum: 'waterproof', target: 'body', priority: 'mandatory', reasonCodes: ['condition_rain'] }],
      { frozen: false, wet: true, cold: false, windy: false }],
    [[{ kind: 'thermal', minimum: 'moderate', priority: 'mandatory', reasonCodes: ['temperature_low'] }],
      { frozen: false, wet: false, cold: true, windy: false }],
    [[{ kind: 'wind_protection', minimum: 'wind_resistant', priority: 'optional', reasonCodes: ['wind_elevated'] }],
      { frozen: false, wet: false, cold: false, windy: true }],
  ];
  for (const [requirements, expected] of cases) {
    const v2 = buildMessages({ ...base, requirements, locale: 'en' });
    assert.deepEqual(JSON.parse(v2[1].content).day, expected);
    assert.equal(JSON.parse(buildMessages({ ...base, requirements })[1].content).day, undefined);
  }
});

// The 503 regression: every reply was rejected for an archetype precondition the
// prompt never stated and the model input never carried, so the prompt has to name
// both rules the handler enforces before it collapses a request into ai_unavailable.
test('prompt states the rules the handler enforces on a reply', () => {
  const request: AiRecommendV1Request = {
    clothingPreference: 'mens',
    dressStyle: 'smart',
    catalogVersion: 3,
    dayVariant: 0,
    requirements: [],
    options: [{
      optionId: 'opt-1',
      formality: 'casual',
      garments: [
        { slot: 'primary_top', layerRole: 'standalone', garmentTypeId: 't_shirt' },
        { slot: 'bottom', layerRole: 'standalone', garmentTypeId: 'shorts' },
        { slot: 'footwear', layerRole: null, garmentTypeId: 'sneakers' },
      ],
      traits: {
        hasMidLayer: false,
        hasOuterLayer: false,
        outerThermalHigh: false,
        outerWaterProtective: false,
        windResistant: false,
        tractionEnhanced: false,
        breathabilityHigh: true,
      },
    }],
  };
  const messages = buildMessages(request);

  assert.match(messages[0].content, /eligibleArchetypeIds/);
  assert.match(messages[0].content, /meaningfully different/i);
  assert.match(messages[0].content, /formality alone is not a difference/i);
  assert.match(messages[0].content, /dayKind/);

  const [projected] = JSON.parse(messages[1].content).options;
  assert.deepEqual(
    projected.eligibleArchetypeIds,
    ['weekend_relaxed', 'light_and_airy', 'on_the_move'],
  );
  assert.equal(messages[1].content.includes('traits'), false);
});

// The Swift module claims to mirror this prompt line for line, and the two executors pass
// the same validation gate, so a rule stated to one and withheld from the other sends that
// tier's replies back as failures. Reading the source keeps the claim honest.
const swiftModulePath = path.resolve(
  import.meta.dirname,
  '../../../mobile/modules/kuyara-on-device-ai/ios/KuyaraOnDeviceAiModule.swift',
);

function swiftInstructions() {
  const source = readFileSync(swiftModulePath, 'utf8');
  const start = source.indexOf('private let instructions = [');
  assert.notEqual(start, -1, 'the Swift module no longer declares `instructions`');
  const end = source.indexOf('].joined(separator:', start);
  assert.notEqual(end, -1, 'the Swift `instructions` array is not terminated as expected');
  return source
    .slice(source.indexOf('[', start) + 1, end)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('"'))
    .map((line) => JSON.parse(line.replace(/,$/, '')));
}

test('the on-device prompt states the same rules as the Worker prompt', () => {
  const worker = buildMessages({ ...baseRequest, clothingPreference: 'mens', options: [], requirements: [] })[0]
    .content.split('\n');
  assert.deepEqual(swiftInstructions(), worker);
});

test('both prompts name the eligibility field and the unconditional archetype', () => {
  const worker = buildMessages({ ...baseRequest, clothingPreference: 'mens', options: [], requirements: [] });
  for (const rules of [swiftInstructions(), worker[0].content.split('\n')]) {
    const joined = rules.join('\n');
    assert.match(joined, /eligibleArchetypeIds/);
    assert.match(joined, /always-allowed everyday_easy/);
    assert.match(joined, /formality alone is not a difference/);
  }
});
