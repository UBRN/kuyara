import {
  aiModelInputFromRequest,
  archetypeDayFromRequirements,
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
        required: v2 ? ['picks', 'insightSentence'] : ['picks'],
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
          ...(v2 ? { insightSentence: { type: 'string', maxLength: 90 } } : {}),
        },
      },
    },
  } as const;
}

// Every line states a rule the caller then enforces, so a reply that follows the
// prompt passes validation. A rule the caller checks but the prompt withholds can
// only be guessed at, and a guessed archetype fails its precondition.
const meaningfulDifferenceDetail = 'Two picks are meaningfully different only when they differ in the'
  + ' body core (a different one_piece, or a different primary_top, or a'
  + ' different bottom) or in at least two slot/garmentTypeId pairs, not'
  + ' counting the head, neck, hands and handheld slots. A different'
  + ' formality alone is not a difference.';

const systemContent = [
  'Pick exactly three supplied options by optionId.',
  'Never invent an optionId.',
  meaningfulDifferenceDetail,
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
    ? `insightSentence: ${request.locale === 'tr' ? 'Turkish' : 'English'} only; one 5-10 word sentence, <=90 chars, to the wearer (${request.locale === 'tr' ? 'sen' : 'you'}) about the chosen outfits, ending in a period. Weather only from true flags: wet=rain possible/likely (never raining now); frozen=snow/sleet; cold=cold day; windy=wind. No sun/clear/heat/other weather; all false=no weather claim. No numbers/degrees/brands/models/AI/URLs/emoji.`
    : null;
  const projection = aiModelInputFromRequest(request);
  return [
    { role: 'system', content: v2Instruction
      ? `${systemContent.replace(`${meaningfulDifferenceDetail}\n`, '').replace('Output structured data only, with no prose.', 'Output structured data only.')}\n${v2Instruction}`
      : systemContent },
    {
      role: 'user',
      content: JSON.stringify('locale' in request
        ? { ...projection, day: archetypeDayFromRequirements(request.requirements) }
        : projection),
    },
  ];
}
