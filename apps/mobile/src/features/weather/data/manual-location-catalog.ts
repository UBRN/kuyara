import {
  manualLocationKey,
  normalizeCoordinates,
  type ManualActiveLocation,
  type ManualLocationId,
} from '@/features/weather/domain/weather';

function location(
  catalogId: ManualLocationId,
  latitude: number,
  longitude: number,
  timeZone: string,
): ManualActiveLocation {
  return Object.freeze({
    source: 'manual',
    catalogId,
    locationKey: manualLocationKey(catalogId),
    coordinates: Object.freeze(normalizeCoordinates(latitude, longitude)),
    timeZone,
  });
}

export const manualLocationCatalog = Object.freeze([
  location('sample.istanbul', 41.01, 28.98, 'Europe/Istanbul'),
  location('sample.ankara', 39.93, 32.86, 'Europe/Istanbul'),
  location('sample.london', 51.51, -0.13, 'Europe/London'),
] as const);

export function getManualLocation(id: ManualLocationId): ManualActiveLocation | null {
  return manualLocationCatalog.find((entry) => entry.catalogId === id) ?? null;
}
