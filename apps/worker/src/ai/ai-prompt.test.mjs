import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { buildMessages, buildPickJsonSchema } from './ai-prompt.ts';

test('prompt supplies the shared formality preference without personal facts', () => {
  for (const [dressStyle, order] of [
    ['casual', ['casual', 'smart', 'formal']],
    ['smart', ['smart', 'casual', 'formal']],
    ['formal', ['formal', 'smart', 'casual']],
    [undefined, ['smart', 'casual', 'formal']],
  ]) {
    const messages = buildMessages({ clothingPreference: 'womens', options: [],
      requirements: [], dressStyle,
      birthDate: '1960-01-01', birthYear: 1960, gender: 'woman' });
    assert.deepEqual(JSON.parse(messages[1].content), {
      clothingPreference: 'womens', options: [], formalityOrder: order,
    });
    for (const forbidden of ['dressStyle', ['age', 'Band'].join(''), 'birthDate', 'birthYear']) {
      assert.equal(messages[1].content.includes(forbidden), false);
    }
    assert.match(messages[0].content, /prefer/i);
  }
});

test('v2 alone asks for one locale-specific insight without changing model input', () => {
  const base = { clothingPreference: 'womens', options: [], requirements: [] };
  const v1 = buildMessages(base);
  for (const [locale, language] of [['tr', 'Turkish'], ['en', 'English']]) {
    const v2 = buildMessages({ ...base, locale });
    assert.equal(v1[1].content, v2[1].content);
    assert.ok(v2[0].content.includes(`insightSentence: ${language} only`));
    assert.match(v2[0].content, /no numbers\/times\/degrees/);
    assert.equal(v2[0].content.includes('with no prose'), false);
  }
  assert.equal(v1[0].content.includes('insightSentence'), false);
  const v2Schema = buildPickJsonSchema([], true).properties.data;
  assert.deepEqual(v2Schema.properties.insightSentence, { type: 'string', maxLength: 90 });
  assert.deepEqual(v2Schema.required, ['insightSentence', 'picks']);
  assert.deepEqual(buildPickJsonSchema([]).properties.data.required, ['picks']);
  assert.equal('insightSentence' in buildPickJsonSchema([]).properties.data.properties, false);
});

// The 503 regression: every reply was rejected for an archetype precondition the
// prompt never stated and the model input never carried, so the prompt has to name
// both rules the handler enforces before it collapses a request into ai_unavailable.
test('prompt states the rules the handler enforces on a reply', () => {
  const request = {
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
  const worker = buildMessages({ clothingPreference: 'mens', options: [], requirements: [] })[0]
    .content.split('\n');
  assert.deepEqual(swiftInstructions(), worker);
});

test('both prompts name the eligibility field and the unconditional archetype', () => {
  const worker = buildMessages({ clothingPreference: 'mens', options: [], requirements: [] });
  for (const rules of [swiftInstructions(), worker[0].content.split('\n')]) {
    const joined = rules.join('\n');
    assert.match(joined, /eligibleArchetypeIds/);
    assert.match(joined, /always-allowed everyday_easy/);
    assert.match(joined, /formality alone is not a difference/);
  }
});
