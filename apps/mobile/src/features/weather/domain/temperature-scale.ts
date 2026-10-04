import { chillyCelsius, freezingCelsius, hotCelsius, veryHotCelsius } from './weather-thresholds';

/**
 * The fixed Celsius scale the Weather screen colours temperature on: the daily rows'
 * low-to-high capsules and the hourly line read the same stops, so a temperature has one
 * colour on every row and in both cards. Four stops are the clothing boundaries the rest of
 * the app already decides on; the two ends hold the scale still below -5 and above 35, and
 * 12 splits the long cool stretch between freezing and chilly.
 *
 * The scale is in Celsius alone. A reader who sees Fahrenheit sees the same colours, because
 * every row and column carries its Celsius value and the unit only changes the numbers.
 */
export const temperatureScaleStopsCelsius = Object.freeze([
  -5,
  freezingCelsius,
  12,
  chillyCelsius,
  hotCelsius,
  veryHotCelsius,
  35,
] as const);

/**
 * Where a temperature sits on the scale, as a fractional stop index: 0 at the first stop,
 * 6 at the last, 2.5 halfway between the third and the fourth. Below and above the ends it
 * holds at the end.
 */
export function temperatureScalePosition(celsius: number): number {
  const stops = temperatureScaleStopsCelsius;
  const last = stops.length - 1;
  if (!(celsius > stops[0])) return 0;
  if (celsius >= stops[last]) return last;
  let index = 0;
  while (celsius > stops[index + 1]) index += 1;
  return index + (celsius - stops[index]) / (stops[index + 1] - stops[index]);
}
