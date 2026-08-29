import { use } from 'react';

import { useProfileApplication } from '@/features/profile/application/profile-context';
import { SettingsScreen } from '@/features/profile/presentation/settings-screen';
import { RecommendationApplicationContext } from '@/features/recommendation/application/recommendation-application-context';
import { useAiProbe } from '@/features/recommendation/application/use-ai-probe';
import type { RecommendationGenerationMode } from '@/features/recommendation/domain/generation-mode';

export default function SettingsRoute() {
  const recommendation = use(RecommendationApplicationContext);
  const { check, isSupported, state: aiStatus } = useAiProbe();
  const {
    state,
    updateClothingPreference,
    updateLanguagePreference,
    updateThemePreference,
  } = useProfileApplication();

  if (state.status !== 'ready') {
    return null;
  }

  const lastGenerationMode: RecommendationGenerationMode | null =
    recommendation?.state.status === 'ready'
      ? recommendation.state.snapshot?.recommendation.generationMode ?? null
      : null;

  return (
    <SettingsScreen
      aiStatus={aiStatus}
      isProbeSupported={isSupported}
      isSaving={state.isSaving}
      lastGenerationMode={lastGenerationMode}
      onCheckAiStatus={check}
      profile={state.profile}
      updateClothingPreference={updateClothingPreference}
      updateLanguagePreference={updateLanguagePreference}
      updateThemePreference={updateThemePreference}
    />
  );
}
