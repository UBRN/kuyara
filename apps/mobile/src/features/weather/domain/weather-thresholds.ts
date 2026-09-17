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
