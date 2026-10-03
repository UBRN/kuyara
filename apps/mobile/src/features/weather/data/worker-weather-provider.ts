import {
  weatherV1ErrorSchema,
  weatherV1RequestSchema,
  weatherV2Path,
  weatherV2SuccessSchema,
  type WeatherV1Error,
} from '@kuyara/contracts';

import { fetchJsonWithTimeout, type Fetch } from '@/infrastructure/network/fetch-json-with-timeout';
import { mapWorkerWeatherToProvidedSnapshot } from '@/features/weather/data/worker-weather-mapper';
import type {
  ProvidedWeatherSnapshot,
  WeatherProvider,
} from '@/features/weather/data/weather-provider';
import {
  WeatherProviderError,
  type WeatherProviderFailureKind,
} from '@/features/weather/domain/weather-provider-error';
import type { ActiveLocation } from '@/features/weather/domain/weather';

const requestTimeoutMilliseconds = 10000;

type Dependencies = Readonly<{
  baseUrl: string;
  fetch?: Fetch;
  requestTimeoutMilliseconds?: number;
}>;

// The code as the response schema reads it, which is the closed Worker list plus the
// named 'unknown' for a code this binary does not know.
type ReadErrorCode = WeatherV1Error['error']['code'];

export class WorkerWeatherProviderError extends WeatherProviderError {
  readonly code: ReadErrorCode | null;

  constructor(kind: WeatherProviderFailureKind, code: ReadErrorCode | null = null) {
    super(kind);
    this.name = 'WorkerWeatherProviderError';
    this.code = code;
  }
}

export class WorkerWeatherProvider implements WeatherProvider {
  private readonly baseUrl: string;
  private readonly fetch: Fetch;
  private readonly requestTimeoutMilliseconds: number;

  constructor(dependencies: Dependencies) {
    this.baseUrl = dependencies.baseUrl.replace(/\/$/, '');
    this.fetch = dependencies.fetch ?? globalThis.fetch;
    this.requestTimeoutMilliseconds = dependencies.requestTimeoutMilliseconds ?? requestTimeoutMilliseconds;
  }

  async fetchSnapshot(location: ActiveLocation): Promise<ProvidedWeatherSnapshot> {
    const request = weatherV1RequestSchema.parse({
      latitudeE2: location.coordinates.latitudeE2,
      longitudeE2: location.coordinates.longitudeE2,
      timeZone: location.timeZone,
    });

    const { response, body } = await fetchJsonWithTimeout(
      this.fetch,
      `${this.baseUrl}${weatherV2Path}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(request),
      },
      this.requestTimeoutMilliseconds,
      {
        network: () => new WorkerWeatherProviderError('network'),
        invalidJson: () => new WorkerWeatherProviderError('invalid-response'),
      },
    );
    if (!response.ok) {
      const error = weatherV1ErrorSchema.safeParse(body);
      if (!error.success) throw new WorkerWeatherProviderError('invalid-response');
      const kind = response.status === 429 || error.data.error.code === 'rate_limited'
        ? 'rate-limited'
        : 'service';
      throw new WorkerWeatherProviderError(kind, error.data.error.code);
    }

    // The v2 success schema is v1's plus `daily`, and it strips unknown keys the same
    // way, so a Worker that adds a response field later still parses here.
    const success = weatherV2SuccessSchema.safeParse(body);
    if (!success.success) throw new WorkerWeatherProviderError('invalid-response');

    try {
      return mapWorkerWeatherToProvidedSnapshot(location, success.data.data);
    } catch {
      throw new WorkerWeatherProviderError('invalid-response');
    }
  }
}
