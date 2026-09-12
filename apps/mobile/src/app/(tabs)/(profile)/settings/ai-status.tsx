import { Stack } from 'expo-router';
import { use } from 'react';

import { useProductAnalytics } from '@/features/analytics/application/use-product-analytics';
import { useScreenViewed } from '@/features/analytics/application/use-screen-viewed';
import { ANALYTICS_SCHEMA_VERSION } from '@/features/analytics/domain/analytics-events';
import { aiProbeResultProperty } from '@/features/analytics/domain/analytics-mappers';
import { AiStatusSettingsScreen } from '@/features/profile/presentation/ai-status-settings-screen';
import { RecommendationApplicationContext } from '@/features/recommendation/application/recommendation-application-context';
import { useAiProbe } from '@/features/recommendation/application/use-ai-probe';
import type { RecommendationGenerationMode } from '@/features/recommendation/domain/generation-mode';
import { useMessages } from '@/localization/use-messages';

export default function AiStatusSettingsRoute() {
  const messages = useMessages();
  const recommendation = use(RecommendationApplicationContext);
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
          headerTitle: messages.settings.aiStatusHeading,
        }}
      />
      <AiStatusSettingsScreen
        aiStatus={aiStatus}
        isProbeSupported={isSupported}
        lastGenerationMode={lastGenerationMode}
        onDeviceAvailability={onDeviceAvailability}
        onCheckAiStatus={() => void checkAiStatus()}
      />
    </>
  );
}
