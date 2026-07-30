import type {
  ActiveLocation,
  HourlyWeather,
  WeatherConditionCode,
} from '@/features/weather/domain/weather';
import type {
  ProvidedWeatherSnapshot,
  WeatherProvider,
} from '@/features/weather/data/weather-provider';

type FakeScenario = 'success' | 'delayed-success' | 'failure';
type FakeDependencies = Readonly<{
  now: () => string;
  delay?: (milliseconds: number) => Promise<void>;
  scenarios?: Readonly<Record<string, readonly FakeScenario[]>>;
}>;

const defaultScenarios: Readonly<Record<string, readonly FakeScenario[]>> = {
  'manual:sample.istanbul': ['success'],
  'manual:sample.ankara': ['delayed-success', 'failure'],
  'manual:sample.london': ['failure'],
};

const templates: Readonly<Record<string, Readonly<{
  temperature: number;
  apparent: number;
  minimum: number;
  maximum: number;
  condition: WeatherConditionCode;
  precipitation: number;
  wind: number;
  humidity: number;
  uv: number;
}>>> = {
  'manual:sample.istanbul': {
    temperature: 16, apparent: 15, minimum: 12, maximum: 19,
    condition: 'rain', precipitation: 0.55, wind: 4.2, humidity: 0.72, uv: 3,
  },
  'manual:sample.ankara': {
    temperature: 11, apparent: 8, minimum: 5, maximum: 14,
    condition: 'partly_cloudy', precipitation: 0.15, wind: 6.4, humidity: 0.48, uv: 4,
  },
};

function localDateKey(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function createHourly(
  fetchedAt: string,
  timeZone: string,
  template: (typeof templates)[string],
): readonly HourlyWeather[] {
  const fetched = new Date(fetchedAt);
  const day = localDateKey(fetched, timeZone);
  const start = new Date(fetched);
  start.setUTCMinutes(0, 0, 0);
  const entries: HourlyWeather[] = [];

  for (let offset = 0; offset < 24; offset += 1) {
    const forecast = new Date(start.getTime() + offset * 60 * 60 * 1000);
    if (localDateKey(forecast, timeZone) !== day) {
      break;
    }
    const warmer = Math.min(offset, 4) * 0.7;
    entries.push({
      forecastAt: forecast.toISOString(),
      temperatureCelsius: template.temperature + warmer,
      apparentTemperatureCelsius: template.apparent + warmer,
      condition: offset > 3 && template.condition === 'rain' ? 'cloudy' : template.condition,
      precipitationProbability: Math.max(0.05, template.precipitation - offset * 0.04),
      windSpeedMetersPerSecond: Math.max(0, template.wind - offset * 0.15),
      humidity: Math.max(0.3, template.humidity - offset * 0.02),
      uvIndex: Math.max(0, template.uv - Math.abs(3 - offset)),
    });
  }

  return Object.freeze(entries);
}

export class DeterministicFakeWeatherProvider implements WeatherProvider {
  private readonly attempts = new Map<string, number>();
  private readonly dependencies: FakeDependencies;

  constructor(dependencies: FakeDependencies) {
    this.dependencies = dependencies;
  }

  async fetchSnapshot(location: ActiveLocation): Promise<ProvidedWeatherSnapshot> {
    const attempt = this.attempts.get(location.locationKey) ?? 0;
    this.attempts.set(location.locationKey, attempt + 1);
    const plan = this.dependencies.scenarios?.[location.locationKey]
      ?? defaultScenarios[location.locationKey]
      ?? ['success'];
    const scenario = plan[Math.min(attempt, plan.length - 1)] ?? 'success';

    if (scenario === 'delayed-success') {
      await (this.dependencies.delay?.(450) ?? new Promise((resolve) => setTimeout(resolve, 450)));
    }
    if (scenario === 'failure') {
      throw new Error('Sample weather is unavailable.');
    }

    const currentTime = this.dependencies.now();
    const fetchedAt = scenario === 'delayed-success'
      ? new Date(Date.parse(currentTime) - 31 * 60 * 1000).toISOString()
      : currentTime;
    const template = templates[location.locationKey] ?? {
      temperature: 15,
      apparent: 14,
      minimum: 10,
      maximum: 18,
      condition: 'mostly_clear' as const,
      precipitation: 0.1,
      wind: 3.5,
      humidity: 0.55,
      uv: 4,
    };

    return {
      locationKey: location.locationKey,
      timeZone: location.timeZone,
      fetchedAt,
      origin: { kind: 'sample', sourceId: 'kuyara-development-weather-v1' },
      current: {
        observedAt: fetchedAt,
        temperatureCelsius: template.temperature,
        apparentTemperatureCelsius: template.apparent,
        condition: template.condition,
        precipitationProbability: template.precipitation,
        windSpeedMetersPerSecond: template.wind,
        humidity: template.humidity,
        uvIndex: template.uv,
      },
      minimumTemperatureCelsius: template.minimum,
      maximumTemperatureCelsius: template.maximum,
      hourly: createHourly(fetchedAt, location.timeZone, template),
    };
  }
}
