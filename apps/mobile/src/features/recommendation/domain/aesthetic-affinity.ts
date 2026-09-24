import { outfitArchetypeIds, type OutfitArchetypeId, type StyleAesthetic } from '@kuyara/contracts';

export const archetypeAesthetics: Readonly<Record<OutfitArchetypeId, readonly StyleAesthetic[]>> = {
  rain_ready: ['sporty', 'relaxed'],
  snow_day: ['sporty', 'relaxed'],
  cold_shield: ['classic', 'minimal'],
  wind_guard: ['sporty', 'streetwear'],
  layered_warmth: ['classic', 'streetwear'],
  in_between: ['minimal', 'relaxed'],
  light_and_airy: ['minimal', 'relaxed'],
  office_ready: ['classic', 'minimal'],
  smart_casual: ['classic', 'minimal'],
  weekend_relaxed: ['relaxed', 'streetwear'],
  on_the_move: ['sporty', 'streetwear'],
  everyday_easy: ['minimal', 'relaxed'],
};

export function sortByAestheticAffinity<T>(
  options: readonly T[],
  aesthetics: readonly StyleAesthetic[],
  matches: (option: T, archetype: OutfitArchetypeId) => boolean,
): readonly T[] {
  if (aesthetics.length === 0) return options;
  const score = (option: T) => Math.max(0, ...outfitArchetypeIds
    .filter((id) => matches(option, id))
    .map((id) => archetypeAesthetics[id].filter((value) => aesthetics.includes(value)).length));
  return [...options].sort((left, right) => score(right) - score(left));
}
