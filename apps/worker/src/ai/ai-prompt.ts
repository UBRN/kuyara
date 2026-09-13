import {
  aiModelInputFromRequest,
  outfitArchetypeIds,
  type AiRecommendV1Request,
} from '@kuyara/contracts';

export function buildPickJsonSchema(options: AiRecommendV1Request['options']) {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['data'],
    properties: {
      data: {
        type: 'object',
        additionalProperties: false,
        required: ['picks'],
        properties: {
          picks: {
            type: 'array',
            minItems: 3,
            maxItems: 3,
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['optionId', 'archetypeId'],
              properties: {
                optionId: {
                  type: 'string',
                  enum: options.map(({ optionId }) => optionId),
                },
                archetypeId: { type: 'string', enum: outfitArchetypeIds },
              },
            },
          },
        },
      },
    },
  } as const;
}

// Every line states a rule the caller then enforces, so a reply that follows the
// prompt passes validation. A rule the caller checks but the prompt withholds can
// only be guessed at, and a guessed archetype fails its precondition.
const systemContent = [
  'Pick exactly three supplied options by optionId.',
  'Never invent an optionId.',
  'Two picks are meaningfully different only when they differ in the'
    + ' body core (a different one_piece, or a different primary_top, or a'
    + ' different bottom) or in at least two slot/garmentTypeId pairs. A'
    + ' different formality alone is not a difference.',
  'All three picks must be meaningfully different from each other.',
  'Prefer formalities in the supplied formalityOrder; no formality is'
    + ' excluded.',
  'Give each pick exactly one archetypeId, taken from that option\'s'
    + ' own eligibleArchetypeIds or the always-allowed everyday_easy. Any'
    + ' other archetypeId is rejected.',
  'Use three different archetypeIds.',
  'Output structured data only, with no prose.',
].join('\n');

export function buildMessages(request: AiRecommendV1Request) {
  return [
    { role: 'system', content: systemContent },
    {
      role: 'user',
      // The shared projection owns which fields a model may see.
      content: JSON.stringify(aiModelInputFromRequest(request)),
    },
  ];
}
