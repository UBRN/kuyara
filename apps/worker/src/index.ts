import { createAiHandler } from './ai/ai-handler.ts';
import { DeterministicStubAiProvider } from './ai/stub-ai-provider.ts';
import { createRouter } from './router.ts';
import { createWeatherHandler } from './weather-handler.ts';
import { DeterministicMockWeatherProvider } from './weather/mock-weather-provider.ts';

const weatherProvider = new DeterministicMockWeatherProvider({
  now: () => new Date().toISOString(),
});
const weatherHandler = createWeatherHandler({ provider: weatherProvider });
const aiProviders = [new DeterministicStubAiProvider()];
const aiHandler = createAiHandler({ providers: aiProviders });
const handleRequest = createRouter({
  weatherHandler,
  aiHandler,
  aiReady: aiProviders.length > 0,
});

export default {
  fetch(request: Request): Promise<Response> {
    return handleRequest(request);
  },
};
