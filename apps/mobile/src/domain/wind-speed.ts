import type { WindSpeedUnitPreference } from '@/domain/preferences';

// Wind speed follows the stored choice; System follows the device's measurement system as the
// OS itself formats a speed: miles an hour on US customary and UK devices (Apple's en_GB gives
// mph), kilometres an hour everywhere else. Each unit is one row, carrying how many of it one
// metre per second makes.
const metresPerSecondIn = {
  kilometresPerHour: 3.6,
  milesPerHour: 3600 / 1609.344,
} as const;

export type WindSpeedUnit = keyof typeof metresPerSecondIn;

const unitByPreference = {
  kmh: 'kilometresPerHour',
  mph: 'milesPerHour',
} as const satisfies Record<Exclude<WindSpeedUnitPreference, 'system'>, WindSpeedUnit>;

// expo-localization's `measurementSystem`; a system with no row, or none at all, is metric.
const unitByMeasurementSystem: ReadonlyMap<unknown, WindSpeedUnit> = new Map([
  ['us', 'milesPerHour'],
  ['uk', 'milesPerHour'],
]);

export function windSpeedUnitFor(
  preference: WindSpeedUnitPreference,
  measurementSystem: unknown,
): WindSpeedUnit {
  if (preference !== 'system') return unitByPreference[preference];
  return unitByMeasurementSystem.get(measurementSystem) ?? 'kilometresPerHour';
}

// Whole numbers: the speed a reader knows from a road sign.
export function wholeWindSpeed(metresPerSecond: number, unit: WindSpeedUnit): number {
  return Math.round(metresPerSecond * metresPerSecondIn[unit]);
}
