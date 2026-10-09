import type { LocationPermissionState } from '@/features/weather/domain/device-location-gateway';
import type { ActiveLocation } from '@/features/weather/domain/weather';

/**
 * Which caption describes how the active location was resolved. A manual place was chosen
 * by name and is neither precise nor approximate, so it gets no caption at all; only a
 * device location does. Without granted access the stored fix is only the last known place:
 * a refusal says access is off, while a permission the system has not settled yet (an expired
 * one-time grant, or "Ask Next Time") only says the place may be stale. The value is a
 * locale-independent message key, translated at each presentation boundary, so Weather's
 * location row and the picker's current-location row cannot disagree about the same location.
 */
export type LocationCaptionKey =
  | 'locationAccessOff'
  | 'lastKnownPlace'
  | 'fullLocation'
  | 'approximateLocation';

export function locationCaptionKey(
  activeLocation: ActiveLocation | null | undefined,
  permission: LocationPermissionState['kind'],
): LocationCaptionKey | null {
  if (activeLocation?.source !== 'device') return null;
  switch (permission) {
    case 'denied':
      return 'locationAccessOff';
    case 'undetermined':
      return 'lastKnownPlace';
    case 'granted':
      return activeLocation.accuracy === 'full' ? 'fullLocation' : 'approximateLocation';
  }
}
