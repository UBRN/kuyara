import { createContext, use, type ReactNode } from 'react';

import type { ClothingPreference } from '@/domain/preferences';

/**
 * The cut a profile's garments are drawn in while it has no catalogue. Onboarding sets its
 * own cut (a unisex preview, then the chosen gender's), so nothing it draws reads this.
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
