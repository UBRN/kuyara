export type ActiveLocationRecord = Readonly<{
  localProfileId: string;
  locationKey: string;
  source: string;
  manualCatalogId: string | null;
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
}>;
