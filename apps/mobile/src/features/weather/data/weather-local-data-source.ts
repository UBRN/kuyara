import type {
  ActiveLocationRecord,
  WeatherSnapshotRecord,
} from '@/features/weather/data/weather-records';

export interface WeatherLocalDataSource {
  getActiveLocation(localProfileId: string): Promise<ActiveLocationRecord | null>;
  setActiveLocation(record: ActiveLocationRecord): Promise<ActiveLocationRecord>;
  getSnapshot(localProfileId: string, locationKey: string): Promise<WeatherSnapshotRecord | null>;
  replaceSnapshot(record: WeatherSnapshotRecord): Promise<WeatherSnapshotRecord>;
}

export class WeatherDataSourceError extends Error {
  constructor() {
    super('The local weather data operation failed.');
    this.name = 'WeatherDataSourceError';
  }
}
