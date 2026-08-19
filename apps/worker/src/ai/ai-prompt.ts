import {
  layerRoles,
  outfitSlots,
  type AiRecommendV1Request,
} from '@kuyara/contracts';

export const outfitJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['data'],
  properties: {
    data: {
      type: 'object',
      additionalProperties: false,
      required: ['outfits'],
      properties: {
        outfits: {
          type: 'array',
          minItems: 3,
          maxItems: 3,
          items: {
            type: 'array',
            minItems: 2,
            maxItems: 5,
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['slot', 'layerRole', 'candidateKey'],
              properties: {
                slot: { type: 'string', enum: outfitSlots },
                layerRole: {
                  type: ['string', 'null'],
                  enum: [...layerRoles, null],
                },
                candidateKey: { type: 'string' },
              },
            },
          },
        },
      },
    },
  },
} as const;

const systemContent = [
  'Return exactly three outfits.',
  'Use ONLY the candidateKey values supplied in the user message; never invent one.',
  'Give each outfit exactly one body core: either one one_piece, or one primary_top plus one bottom; never use both forms.',
  'Give each outfit exactly one footwear.',
  'Use at most one mid_layer and at most one outer_layer per outfit.',
  'Do not repeat a slot or candidateKey within an outfit.',
  'Set layerRole only to a value the candidate lists in supportedLayerRoles, or null.',
  'Make the three outfits meaningfully different from each other.',
  'Satisfy every mandatory requirement; prefer satisfying optional requirements.',
  'Output structured data only, with no prose or explanation.',
].join('\n');

export function buildMessages(request: AiRecommendV1Request) {
  return [
    { role: 'system', content: systemContent },
    {
      role: 'user',
      content: JSON.stringify({
        clothingPreference: request.clothingPreference,
        requirements: request.requirements,
        candidates: request.candidates,
      }),
    },
  ];
}
