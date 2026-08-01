import {
  weatherV1ErrorSchema,
  weatherV1Path,
  weatherV1RequestSchema,
  weatherV1SuccessSchema,
  type WeatherV1ErrorCode,
} from '@kuyara/contracts';

import { mapWorkerWeatherToProvidedSnapshot } from '@/features/weather/data/worker-weather-mapper';
import {
  WeatherProviderError,
  type ProvidedWeatherSnapshot,
  type WeatherProvider,
  type WeatherProviderFailureKind,
} from '@/features/weather/data/weather-provider';
import type { ActiveLocation } from '@/features/weather/domain/weather';

type Fetch = (input: string, init: RequestInit) => Promise<Response>;
type Dependencies = Readonly<{
  baseUrl: string;
  fetch?: Fetch;
}>;

export class WorkerWeatherProviderError extends WeatherProviderError {
  readonly code: WeatherV1ErrorCode | null;

  constructor(kind: WeatherProviderFailureKind, code: WeatherV1ErrorCode | null = null) {
    super(kind);
    this.name = 'WorkerWeatherProviderError';
    this.code = code;
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new WorkerWeatherProviderError('invalid-response');
  }
}

export class WorkerWeatherProvider implements WeatherProvider {
  private readonly baseUrl: string;
  private readonly fetch: Fetch;

  constructor(dependencies: Dependencies) {
    this.baseUrl = dependencies.baseUrl.replace(/\/$/, '');
    this.fetch = dependencies.fetch ?? globalThis.fetch;
  }

  async fetchSnapshot(location: ActiveLocation): Promise<ProvidedWeatherSnapshot> {
    const request = weatherV1RequestSchema.parse({
      latitudeE2: location.coordinates.latitudeE2,
      longitudeE2: location.coordinates.longitudeE2,
      timeZone: location.timeZone,
    });

    let response: Response;
    try {
      response = await this.fetch(`${this.baseUrl}${weatherV1Path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(request),
      });
    } catch {
      throw new WorkerWeatherProviderError('network');
    }

    const body = await readJson(response);
    if (!response.ok) {
      const error = weatherV1ErrorSchema.safeParse(body);
      if (!error.success) throw new WorkerWeatherProviderError('invalid-response');
      throw new WorkerWeatherProviderError('service', error.data.error.code);
    }

    const success = weatherV1SuccessSchema.safeParse(body);
    if (!success.success) throw new WorkerWeatherProviderError('invalid-response');

    try {
      return mapWorkerWeatherToProvidedSnapshot(location, success.data.data);
    } catch {
      throw new WorkerWeatherProviderError('invalid-response');
    }
  }
}
