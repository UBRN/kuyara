import { Stack } from 'expo-router';
import { use } from 'react';

import { useProductAnalytics } from '@/features/analytics/application/use-product-analytics';
import { useScreenViewed } from '@/features/analytics/application/use-screen-viewed';
import { ANALYTICS_SCHEMA_VERSION } from '@/features/analytics/domain/analytics-events';
import { aiProbeResultProperty } from '@/features/analytics/domain/analytics-mappers';
import { ServiceProvidersScreen } from '@/features/profile/presentation/service-providers-screen';
import { RecommendationApplicationContext } from '@/features/recommendation/application/recommendation-application-context';
import { useAiProbe } from '@/features/recommendation/application/use-ai-probe';
import type { RecommendationGenerationMode } from '@/features/recommendation/domain/generation-mode';
import { WeatherApplicationContext } from '@/features/weather/application/weather-application-context';
import { WeatherAttribution } from '@/features/weather/presentation/weather-attribution';
import { useMessages } from '@/localization/use-messages';

export default function ServiceProvidersRoute() {
  const messages = useMessages();
  const recommendation = use(RecommendationApplicationContext);
  const weather = use(WeatherApplicationContext);
  const { check, isSupported, state: aiStatus } = useAiProbe();
  const { analytics, firstUses } = useProductAnalytics();
  useScreenViewed('settings_ai_status');

  const lastGenerationMode: RecommendationGenerationMode | null =
    recommendation?.state.status === 'ready'
      ? recommendation.state.snapshot?.recommendation.generationMode ?? null
      : null;
  // ADR 0034 section 5: the availability the composition boundary already read once. No
  // call is made from this screen.
  const onDeviceAvailability = recommendation?.onDeviceAvailability ?? null;
  const sourceId = weather?.state.status === 'ready'
    ? weather.state.snapshot?.origin.sourceId
    : null;
  const weatherAttribution = sourceId === 'weatherkit' || sourceId === 'open-meteo' || sourceId === 'openweather'
    ? <WeatherAttribution sourceId={sourceId} />
    : null;

  const checkAiStatus = async () => {
    const result = await check();
    if (!result || result.kind === 'idle' || result.kind === 'checking') return;
    analytics.capture('ai_probe_triggered', {
      schema_version: ANALYTICS_SCHEMA_VERSION,
      result: aiProbeResultProperty(result.kind),
    });
    if (await firstUses.markFirstUse('ai_status_probe')) {
      analytics.capture('feature_used_first_time', {
        schema_version: ANALYTICS_SCHEMA_VERSION,
        feature_name: 'ai_status_probe',
      });
    }
  };

  return (
    <>
      {/* ADR 0030 section 5: a native inline title and a back button that reads
          "Settings", the previous screen's own title, by the platform's default. */}
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: messages.settings.serviceProvidersHeading,
        }}
      />
      <ServiceProvidersScreen
        aiStatus={aiStatus}
        isProbeSupported={isSupported}
        lastGenerationMode={lastGenerationMode}
        onDeviceAvailability={onDeviceAvailability}
        onCheckAiStatus={() => void checkAiStatus()}
        weatherAttribution={weatherAttribution}
      />
    </>
  );
}
