import {
  archetypeDayFromRequirements,
  meetsArchetypePrecondition,
  picksAreMeaningfullyDifferent,
  type AiOption,
  type AiRecommendV1Request,
  type AiRecommendV2Request,
  type OutfitArchetypeId,
} from '@kuyara/contracts';

import type { AiAttemptFailureReason } from './ai-provider.ts';

export type SelectionFailure = Extract<
  AiAttemptFailureReason,
  'unknown_option' | 'picks_not_distinct' | 'archetype_precondition'
>;

/**
 * The one selection gate. It judges a model reply and a cached answer alike and names why
 * a selection fails; `undefined` is a selection the client's own gate accepts too.
 */
export function selectionFailure(
  picks: readonly { optionId: string; archetypeId: OutfitArchetypeId }[],
  request: AiRecommendV1Request | AiRecommendV2Request,
  options: ReadonlyMap<string, AiOption>,
): SelectionFailure | undefined {
  const picked = picks.map(({ optionId }) => options.get(optionId));
  if (!picked.every((option): option is AiOption => option !== undefined)) {
    return 'unknown_option';
  }
  if (!picksAreMeaningfullyDifferent(picked)) return 'picks_not_distinct';
  const day = archetypeDayFromRequirements(request.requirements);
  const preconditionsMet = picks.every(({ archetypeId }, index) => meetsArchetypePrecondition(
    archetypeId,
    picked[index]!,
    request.dayKind,
    day,
  ));
  return preconditionsMet ? undefined : 'archetype_precondition';
}
