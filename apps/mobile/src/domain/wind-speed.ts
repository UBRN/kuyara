// Wind speed follows the device's measurement system: miles an hour where the device uses US
// customary units, kilometres an hour everywhere else. Each unit is one row, carrying how many
// of it one metre per second makes; the device's system picks a row from the second table.
const metresPerSecondIn = {
  kilometresPerHour: 3.6,
  milesPerHour: 3600 / 1609.344,
} as const;

export type WindSpeedUnit = keyof typeof metresPerSecondIn;

// expo-localization's `measurementSystem`; a system with no row, or none at all, is metric.
const unitByMeasurementSystem: ReadonlyMap<unknown, WindSpeedUnit> = new Map([['us', 'milesPerHour']]);

export function windSpeedUnitFor(measurementSystem: unknown): WindSpeedUnit {
  return unitByMeasurementSystem.get(measurementSystem) ?? 'kilometresPerHour';
}

// Whole numbers: the speed a reader knows from a road sign.
export function wholeWindSpeed(metresPerSecond: number, unit: WindSpeedUnit): number {
  return Math.round(metresPerSecond * metresPerSecondIn[unit]);
}
