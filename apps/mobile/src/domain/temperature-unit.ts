import type { TemperatureUnitPreference } from '@/domain/preferences';

export type TemperatureUnit = 'celsius' | 'fahrenheit';

// The stored choice wins; System is the device's own Temperature setting, read at the edge.
export function temperatureUnitFor(
  preference: TemperatureUnitPreference,
  deviceUnit: TemperatureUnit,
): TemperatureUnit {
  return preference === 'system' ? deviceUnit : preference;
}
