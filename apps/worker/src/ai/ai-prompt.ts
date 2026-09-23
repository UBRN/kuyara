import {
  aiModelInputFromRequest,
  outfitArchetypeIds,
  type AiRecommendV1Request,
  type AiRecommendV2Request,
} from '@kuyara/contracts';

export function buildPickJsonSchema(options: AiRecommendV1Request['options'], v2 = false) {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['data'],
    properties: {
      data: {
        type: 'object',
        additionalProperties: false,
        required: v2 ? ['insightSentence', 'picks'] : ['picks'],
        properties: {
          ...(v2 ? { insightSentence: { type: 'string', maxLength: 90 } } : {}),
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
    + ' different bottom) or in at least two slot/garmentTypeId pairs, not'
    + ' counting the head, neck, hands and handheld slots. A different'
    + ' formality alone is not a difference.',
  'All three picks must be meaningfully different from each other.',
  'Prefer formalities in the supplied formalityOrder; no formality is'
    + ' excluded.',
  'dayKind, when present, says whether today is a weekday or a weekend;'
    + ' prefer picks that suit it.',
  'Give each pick exactly one archetypeId, taken from that option\'s'
    + ' own eligibleArchetypeIds or the always-allowed everyday_easy. Any'
    + ' other archetypeId is rejected.',
  'Use three different archetypeIds.',
  'Output structured data only, with no prose.',
].join('\n');

export function buildMessages(request: AiRecommendV1Request | AiRecommendV2Request) {
  const v2Instruction = 'locale' in request
    ? `insightSentence: ${request.locale === 'tr' ? 'Turkish' : 'English'} only; weather/outfit sentence <=90 chars; no numbers/times/degrees/brands/models/AI/URLs/emoji`
    : null;
  return [
    { role: 'system', content: v2Instruction
      ? `${systemContent.replace('Output structured data only, with no prose.', 'Output structured data only.')}\n${v2Instruction}`
      : systemContent },
    {
      role: 'user',
      // The shared projection owns which fields a model may see.
      content: JSON.stringify(aiModelInputFromRequest(request)),
    },
  ];
}
