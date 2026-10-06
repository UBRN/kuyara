import { createContext, use, type ReactNode } from 'react';

import type { ClothingPreference } from '@/domain/preferences';

/**
 * The cut a profile's garments are drawn in before it has one: onboarding before the gender
 * step. Women's is the first gender the onboarding offers.
 */
export const defaultGarmentCut: ClothingPreference = 'womens';

const GarmentCutContext = createContext<ClothingPreference>(defaultGarmentCut);

/**
 * Every garment drawing under it is drawn in `cut`, the profile's catalog: the composition
 * root mounts it once from the profile, and onboarding follows the gender being chosen.
 */
export function GarmentCutProvider({ cut, children }: Readonly<{ cut: ClothingPreference; children: ReactNode }>) {
  return <GarmentCutContext value={cut}>{children}</GarmentCutContext>;
}

export function useGarmentCut(): ClothingPreference {
  return use(GarmentCutContext);
}
