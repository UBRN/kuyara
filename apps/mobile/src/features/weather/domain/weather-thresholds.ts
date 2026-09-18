import type { WeatherMeasurements } from '@/features/weather/domain/weather';

/**
 * The two boundaries at which the weather changes a clothing decision, and the wetness
 * predicate built on the first. All of them are read off `WeatherMeasurements`, so they
 * belong to the weather domain rather than to any one consumer: the notification rules
 * (ADR 0032) and the Weather screen's outlook line (ADR 0021 section 9) both read them, and
 * defining them in notifications would make weather depend on notifications.
 */
export const precipitationLikelyThreshold = 0.6;
export const temperatureSwingCelsius = 8;

/**
 * The six temperature and wind boundaries a day is read against. They were literals inside
 * the clothing-requirement rules, where the same numbers decide whether a garment property
 * becomes mandatory; naming them here is what lets a second reader of the same day, the
 * Today day-insight line, describe the day without re-guessing a single one of them.
 *
 * Every value is unchanged from the rules it was taken out of. They are boundaries on a
 * temperature and a wind speed, not on a particular reading of one: the requirement rules
 * compare them against the air and the apparent temperature together, the day-insight line
 * against the apparent temperature alone, and each consumer says which it uses.
 */
export const hotCelsius = 23;
export const veryHotCelsius = 28;
export const chillyCelsius = 18;
export const freezingCelsius = 5;
export const windyMetersPerSecond = 5;
export const veryWindyMetersPerSecond = 8;

const wetConditions: readonly string[] = [
  'drizzle', 'rain', 'heavy_rain', 'sleet', 'snow', 'thunderstorm',
];

/** Whether the condition code itself says precipitation is falling, probability aside. */
export function isWetCondition(condition: WeatherMeasurements['condition']): boolean {
  return wetConditions.includes(condition);
}

export function isWetMeasurement(measurement: WeatherMeasurements): boolean {
  return measurement.precipitationProbability >= precipitationLikelyThreshold
    || isWetCondition(measurement.condition);
}
