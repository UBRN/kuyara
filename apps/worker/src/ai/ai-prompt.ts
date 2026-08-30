import {
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

const systemContent = [
  'Pick exactly three supplied options by optionId.',
  'Never invent an optionId.',
  'Make the three picks meaningfully different.',
  'Give each pick one archetypeId from the allowed list.',
  'Use three different archetypeIds.',
  'Output structured data only, with no prose.',
].join('\n');

export function buildMessages(request: AiRecommendV1Request) {
  return [
    { role: 'system', content: systemContent },
    {
      role: 'user',
      // Cache-key and validation-only fields are deliberately omitted from model input.
      content: JSON.stringify({
        clothingPreference: request.clothingPreference,
        options: request.options.map(({ optionId, formality, garments }) => ({
          optionId,
          formality,
          garments: garments.map(({ slot, garmentTypeId }) => ({
            slot,
            garmentTypeId,
          })),
        })),
      }),
    },
  ];
}
