import type { ProvidedWeatherSnapshot } from '@/features/weather/domain/weather-provider';
import type { ActiveLocation, WeatherSnapshot } from '@/features/weather/domain/weather';

/** The persisted weather the application reads and writes; `LocalWeatherRepository` implements it. */
export interface WeatherRepository {
  getActiveLocation(localProfileId: string): Promise<ActiveLocation | null>;
  setActiveLocation(localProfileId: string, location: ActiveLocation): Promise<ActiveLocation>;
  getSnapshot(localProfileId: string, locationKey: string): Promise<WeatherSnapshot | null>;
  saveSnapshot(localProfileId: string, snapshot: ProvidedWeatherSnapshot): Promise<WeatherSnapshot>;
}

export class WeatherRepositoryError extends Error {
  readonly code: 'invalid-input' | 'invalid-data' | 'unavailable';
  constructor(code: 'invalid-input' | 'invalid-data' | 'unavailable') {
    super('The local weather operation could not be completed.');
    this.name = 'WeatherRepositoryError';
    this.code = code;
  }
}
