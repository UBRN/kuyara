import type { ClothingPreference } from '@/domain/preferences';
import { garmentCatalogVersion } from '@/features/catalog/domain/garment-catalog';
import type { WornOutfit } from '@/features/recommendation/domain/outfit-history';
import type { ClothingRequirements } from '@/features/recommendation/domain/weather-to-clothing-requirements';

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
        .map(([key, nested]) => [key, canonicalize(nested)]),
    );
  }
  return value;
}

/**
 * What identifies one composed pool: the day's requirements, the preference, the day variant,
 * the catalog and the garments of the seven newest worn outfits, which the composition reads.
 * Property order does not matter, so requirements derived from the weather and the same
 * requirements read back from storage name the same pool.
 */
export function poolCompositionKey(
  requirements: ClothingRequirements,
  clothingPreference: ClothingPreference,
  dayVariant: number,
  recentWorn: readonly WornOutfit[] = [],
): string {
  return JSON.stringify(canonicalize([
    garmentCatalogVersion, requirements, clothingPreference, dayVariant,
    recentWorn.slice(0, 7).map(({ garments }) =>
      Object.values(garments).filter((id) => id !== undefined).sort()),
  ]));
}
