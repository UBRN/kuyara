import { Stack } from 'expo-router';
import { use } from 'react';

import { AiStatusSettingsScreen } from '@/features/profile/presentation/ai-status-settings-screen';
import { RecommendationApplicationContext } from '@/features/recommendation/application/recommendation-application-context';
import { useAiProbe } from '@/features/recommendation/application/use-ai-probe';
import type { RecommendationGenerationMode } from '@/features/recommendation/domain/generation-mode';
import { useMessages } from '@/localization/use-messages';

export default function AiStatusSettingsRoute() {
  const messages = useMessages();
  const recommendation = use(RecommendationApplicationContext);
  const { check, isSupported, state: aiStatus } = useAiProbe();

  const lastGenerationMode: RecommendationGenerationMode | null =
    recommendation?.state.status === 'ready'
      ? recommendation.state.snapshot?.recommendation.generationMode ?? null
      : null;

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
        onCheckAiStatus={check}
      />
    </>
  );
}
