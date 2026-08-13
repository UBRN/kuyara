import type {
  AiCandidate,
  AiOutfitGarment,
  AiRecommendV1Request,
} from '@kuyara/contracts';

import type { AiProvider } from './ai-provider.ts';

function layerRole(candidate: AiCandidate): AiOutfitGarment['layerRole'] {
  return candidate.properties.supportedLayerRoles.includes('standalone')
    ? 'standalone'
    : candidate.properties.supportedLayerRoles[0] ?? null;
}

export class DeterministicStubAiProvider implements AiProvider {
  async generateOutfits(
    request: AiRecommendV1Request,
    signal: AbortSignal,
  ): Promise<unknown> {
    signal.throwIfAborted();

    const groups = new Map<AiCandidate['properties']['category'], AiCandidate[]>();
    for (const candidate of request.candidates) {
      const group = groups.get(candidate.properties.category) ?? [];
      group.push(candidate);
      groups.set(candidate.properties.category, group);
    }
    for (const group of groups.values()) {
      group.sort((left, right) => left.candidateKey.localeCompare(right.candidateKey));
    }

    const tops = groups.get('top') ?? [];
    const bottoms = groups.get('bottom') ?? [];
    const onePieces = groups.get('one_piece') ?? [];
    const footwear = groups.get('footwear') ?? [];
    const useSeparates = tops.length > 0 && bottoms.length > 0;
    if ((!useSeparates && onePieces.length === 0) || footwear.length === 0) {
      throw new Error('Cannot build three structurally complete outfits.');
    }

    const outfits = Array.from({ length: 3 }, (_, index): AiOutfitGarment[] => {
      const shoe = footwear[index % footwear.length];
      const body = useSeparates
        ? [
            {
              slot: 'primary_top' as const,
              layerRole: layerRole(tops[index % tops.length]),
              candidateKey: tops[index % tops.length].candidateKey,
            },
            {
              slot: 'bottom' as const,
              layerRole: layerRole(bottoms[index % bottoms.length]),
              candidateKey: bottoms[index % bottoms.length].candidateKey,
            },
          ]
        : [{
            slot: 'one_piece' as const,
            layerRole: layerRole(onePieces[index % onePieces.length]),
            candidateKey: onePieces[index % onePieces.length].candidateKey,
          }];
      return [...body, {
        slot: 'footwear',
        layerRole: null,
        candidateKey: shoe.candidateKey,
      }];
    });

    return { data: { outfits } };
  }
}
