import type { GarmentOutfitPalette } from '@/components/ui';

/**
 * The sky History draws a worn piece under: a mild, cloudy day, so a piece whose day kept no
 * colours shows its natural colourway.
 */
export const historyDrawingSky = Object.freeze({
  temperatureC: 18,
  condition: 'cloudy',
  isNight: false,
} as const satisfies Pick<GarmentOutfitPalette, 'temperatureC' | 'condition' | 'isNight'>);
