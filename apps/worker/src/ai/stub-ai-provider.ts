import type {
  AiOption,
  AiRecommendV1Request,
  OutfitArchetypeId,
} from '@kuyara/contracts';

import type { AiProvider } from './ai-provider.ts';

function validArchetypes(option: AiOption): OutfitArchetypeId[] {
  const archetypes: OutfitArchetypeId[] = [];
  if (option.formality === 'formal') archetypes.push('office_ready');
  if (option.formality !== 'casual') archetypes.push('smart_casual');
  if (option.formality === 'casual') archetypes.push('weekend_relaxed');
  if (option.traits.hasMidLayer && option.traits.hasOuterLayer) {
    archetypes.push('layered_warmth');
  }
  if (option.traits.outerThermalHigh) archetypes.push('cold_shield');
  if (option.traits.outerWaterProtective) archetypes.push('rain_ready');
  if (option.traits.tractionEnhanced) archetypes.push('snow_day');
  if (option.traits.windResistant) archetypes.push('wind_guard');
  if (!option.traits.hasOuterLayer && option.traits.breathabilityHigh) {
    archetypes.push('light_and_airy');
  }
  if (option.garments.some(({ slot, garmentTypeId }) =>
    slot === 'footwear' && garmentTypeId === 'sneakers')) {
    archetypes.push('on_the_move');
  }
  if (option.traits.hasMidLayer && !option.traits.hasOuterLayer) {
    archetypes.push('in_between');
  }
  archetypes.push('everyday_easy');
  return archetypes;
}

export class DeterministicStubAiProvider implements AiProvider {
  async generateOutfits(
    request: AiRecommendV1Request,
    signal: AbortSignal,
  ): Promise<unknown> {
    signal.throwIfAborted();
    const options = request.options.slice(0, 3);
    if (options.length !== 3) throw new Error('Three options are required.');

    const used = new Set<OutfitArchetypeId>();
    const picks = options.map((option) => {
      const archetypeId = validArchetypes(option).find((candidate) => !used.has(candidate));
      if (!archetypeId) throw new Error('Three distinct archetypes are required.');
      used.add(archetypeId);
      return { optionId: option.optionId, archetypeId };
    });
    return { data: { picks } };
  }
}
