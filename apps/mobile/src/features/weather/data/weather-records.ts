export type ActiveLocationRecord = Readonly<{
  localProfileId: string;
  locationKey: string;
  source: string;
  manualCatalogId: string | null;
  displayName: string | null;
  latitudeE2: number;
  longitudeE2: number;
  timeZone: string;
  deviceAccuracy: string | null;
  createdAt: string;
  updatedAt: string;
}>;

export type HourlyWeatherRecord = Readonly<{
  forecastAt: string;
  temperatureCelsius: number;
  apparentTemperatureCelsius: number;
  condition: string;
  precipitationProbability: number;
  windSpeedMetersPerSecond: number;
  humidity: number;
  uvIndex: number;
}>;

export type WeatherSnapshotRecord = Readonly<{
  id: string;
  localProfileId: string;
  locationKey: string;
  timeZone: string;
  fetchedAt: string;
  observedAt: string;
  originKind: string;
  sourceId: string;
  temperatureCelsius: number;
  apparentTemperatureCelsius: number;
  minimumTemperatureCelsius: number;
  maximumTemperatureCelsius: number;
  condition: string;
  precipitationProbability: number;
  windSpeedMetersPerSecond: number;
  humidity: number;
  uvIndex: number;
  hourly: readonly HourlyWeatherRecord[];
  /**
   * The outlook as it sits in its column: one JSON document, or null for a row written
   * before the column existed. It is read whole and never queried by field, so it travels
   * with its snapshot the way `context_json` and `outfits_json` travel with a
   * recommendation, and the repository owns both the parse and the validation.
   */
  dailyJson: string | null;
}>;
