import { locationCaptionKey } from '@/features/weather/domain/location-caption';
import type { ActiveLocation } from '@/features/weather/domain/weather';
import type { AppMessages } from '@/localization/messages/types';

type WeatherCopy = AppMessages['weather'];

/**
 * The words that name the active location and say how it was resolved, so Weather's location
 * row and the picker's current-location row cannot disagree about the same place.
 */
export function locationName(location: ActiveLocation, copy: WeatherCopy): string {
  // Both members of the union carry `displayName`; a device fix has one only when the
  // reverse geocode resolved a locality, and without one the generic copy still answers.
  return location.displayName ?? copy.currentLocation;
}

export function locationCaption(
  location: ActiveLocation | null,
  isPermissionGranted: boolean,
  copy: WeatherCopy,
): string | null {
  const key = locationCaptionKey(location, isPermissionGranted);
  return key ? copy[key] : null;
}
