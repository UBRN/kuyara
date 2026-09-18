/**
 * Sunrise and sunset for a place and a day, computed on the device.
 *
 * The arithmetic is the NOAA solar position algorithm, which is why this is a module and
 * not a dependency: it is four trigonometric series and one hour angle. Nothing here reads
 * the clock, touches storage, formats anything or knows about React. It takes a latitude,
 * a longitude and an instant, and answers with two instants.
 *
 * Accuracy is about a minute at temperate latitudes, degrading near the poles where the
 * sun crosses the horizon at a shallow angle. That is far inside what a condition glyph
 * can express, and the fixed window it replaces was wrong by the better part of an hour.
 */

const MS_PER_DAY = 86_400_000;
const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 3_600_000;
const J2000 = 2_451_545;
const JULIAN_DAY_AT_EPOCH = 2_440_587.5;
const DAYS_PER_JULIAN_CENTURY = 36_525;
const MINUTES_PER_DEGREE = 4;
const SOLAR_NOON_MINUTES = 720;

/**
 * The centre of the sun sits 50 arcminutes below the horizon at the moment the upper limb
 * appears: 34 of refraction and 16 of the disc's own radius. This is the zenith angle the
 * almanacs publish their times against.
 */
const SUNRISE_ZENITH_DEGREES = 90.833;

export type SolarEvents = Readonly<{
  sunriseMs: number;
  sunsetMs: number;
}>;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function toDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

/**
 * The sun's declination and the equation of time for a Julian century, both in the form
 * the hour angle below wants them: declination in degrees, equation of time in minutes.
 */
function solarPositionOf(julianCentury: number): Readonly<{
  declinationDegrees: number;
  equationOfTimeMinutes: number;
}> {
  const t = julianCentury;
  const meanLongitude = (280.46646 + t * (36_000.76983 + t * 0.0003032)) % 360;
  const meanAnomaly = 357.52911 + t * (35_999.05029 - 0.0001537 * t);
  const eccentricity = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
  const centre = Math.sin(toRadians(meanAnomaly)) * (1.914602 - t * (0.004817 + 0.000014 * t))
    + Math.sin(toRadians(2 * meanAnomaly)) * (0.019993 - 0.000101 * t)
    + Math.sin(toRadians(3 * meanAnomaly)) * 0.000289;
  const apparentLongitude = meanLongitude
    + centre
    - 0.00569
    - 0.00478 * Math.sin(toRadians(125.04 - 1934.136 * t));
  const meanObliquity = 23
    + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60;
  const obliquity = meanObliquity + 0.00256 * Math.cos(toRadians(125.04 - 1934.136 * t));

  const declinationDegrees = toDegrees(
    Math.asin(Math.sin(toRadians(obliquity)) * Math.sin(toRadians(apparentLongitude))),
  );

  const varY = Math.tan(toRadians(obliquity / 2)) ** 2;
  const equationOfTimeMinutes = 4 * toDegrees(
    varY * Math.sin(2 * toRadians(meanLongitude))
    - 2 * eccentricity * Math.sin(toRadians(meanAnomaly))
    + 4 * eccentricity * varY
      * Math.sin(toRadians(meanAnomaly))
      * Math.cos(2 * toRadians(meanLongitude))
    - 0.5 * varY * varY * Math.sin(4 * toRadians(meanLongitude))
    - 1.25 * eccentricity * eccentricity * Math.sin(2 * toRadians(meanAnomaly)),
  );

  return { declinationDegrees, equationOfTimeMinutes };
}

/**
 * The sunrise and sunset instants of the solar day that contains `instantMs`, or `null`
 * when the sun does not cross the horizon there that day: a polar day or a polar night.
 *
 * The day is bounded by the place's own solar midnight rather than by its civil date, so
 * the pair always brackets the instant it was asked about even where a political time zone
 * pushes sunset past midnight, as Iceland's does in June.
 */
export function solarEventsOf(
  latitudeDegrees: number,
  longitudeDegrees: number,
  instantMs: number,
): SolarEvents | null {
  if (
    !Number.isFinite(latitudeDegrees)
    || !Number.isFinite(longitudeDegrees)
    || !Number.isFinite(instantMs)
    || Math.abs(latitudeDegrees) > 90
    || Math.abs(longitudeDegrees) > 180
  ) {
    return null;
  }

  const longitudeOffsetMs = (longitudeDegrees / 15) * MS_PER_HOUR;
  const solarDayStartMs = Math.floor((instantMs + longitudeOffsetMs) / MS_PER_DAY) * MS_PER_DAY;
  const julianDay = solarDayStartMs / MS_PER_DAY + JULIAN_DAY_AT_EPOCH;
  // Evaluate the sun where it will be at this day's noon, not at its midnight: the
  // declination moves far enough in twelve hours to shift sunrise by a minute.
  const julianCentury = (julianDay + 0.5 - longitudeDegrees / 360 - J2000)
    / DAYS_PER_JULIAN_CENTURY;
  const { declinationDegrees, equationOfTimeMinutes } = solarPositionOf(julianCentury);

  const latitude = toRadians(latitudeDegrees);
  const declination = toRadians(declinationDegrees);
  const cosHourAngle = Math.cos(toRadians(SUNRISE_ZENITH_DEGREES))
    / (Math.cos(latitude) * Math.cos(declination))
    - Math.tan(latitude) * Math.tan(declination);
  if (!Number.isFinite(cosHourAngle) || cosHourAngle > 1 || cosHourAngle < -1) return null;

  const hourAngleDegrees = toDegrees(Math.acos(cosHourAngle));
  const solarNoonMinutes = SOLAR_NOON_MINUTES
    - MINUTES_PER_DEGREE * longitudeDegrees
    - equationOfTimeMinutes;
  const halfDayMinutes = MINUTES_PER_DEGREE * hourAngleDegrees;

  return Object.freeze({
    sunriseMs: solarDayStartMs + (solarNoonMinutes - halfDayMinutes) * MS_PER_MINUTE,
    sunsetMs: solarDayStartMs + (solarNoonMinutes + halfDayMinutes) * MS_PER_MINUTE,
  });
}
