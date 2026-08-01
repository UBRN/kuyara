import { createWeatherHandler } from './weather-handler.ts';
import { DeterministicMockWeatherProvider } from './weather/mock-weather-provider.ts';

const provider = new DeterministicMockWeatherProvider({
  now: () => new Date().toISOString(),
});
const handleRequest = createWeatherHandler({ provider });

export default {
  fetch(request: Request): Promise<Response> {
    return handleRequest(request);
  },
};
