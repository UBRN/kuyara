import type { ActiveLocation } from '@/features/weather/domain/weather';

/**
 * Which caption describes how the active location was resolved. A manual place was chosen
 * by name and is neither precise nor approximate, so it gets no caption at all; only a
 * device location does. The value is a locale-independent message key, translated at each
 * presentation boundary, so Weather and Profile cannot disagree about the same location.
 */
export type LocationCaptionKey =
  | 'locationAccessOff'
  | 'fullLocation'
  | 'approximateLocation';

export function locationCaptionKey(
  activeLocation: ActiveLocation | null | undefined,
  isPermissionGranted: boolean,
): LocationCaptionKey | null {
  if (activeLocation?.source !== 'device') return null;
  if (!isPermissionGranted) return 'locationAccessOff';
  return activeLocation.accuracy === 'full' ? 'fullLocation' : 'approximateLocation';
}
