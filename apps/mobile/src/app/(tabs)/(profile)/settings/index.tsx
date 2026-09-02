import { router } from 'expo-router';
import { use } from 'react';

import { useNotificationApplication } from '@/features/notifications/application/notification-context';
import { useProfileApplication } from '@/features/profile/application/profile-context';
import { SettingsScreen } from '@/features/profile/presentation/settings-screen';
import { RecommendationApplicationContext } from '@/features/recommendation/application/recommendation-application-context';
import { useAiProbe } from '@/features/recommendation/application/use-ai-probe';
import type { RecommendationGenerationMode } from '@/features/recommendation/domain/generation-mode';
import { useMessages } from '@/localization/use-messages';

export default function SettingsRoute() {
  const messages = useMessages();
  const recommendation = use(RecommendationApplicationContext);
  const { check, isSupported, state: aiStatus } = useAiProbe();
  const {
    state: notificationState,
    setOptIn,
    sendTestNotification,
    openApplicationSettings,
  } = useNotificationApplication();
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
      isNotificationBusy={notificationState.isBusy}
      notificationPermission={notificationState.permission}
      onBack={() => router.back()}
      onCheckAiStatus={check}
      onOpenNotificationSettings={() => void openApplicationSettings()}
      onSendTestNotification={() => sendTestNotification({
        title: messages.notifications.testNotificationTitle,
        body: messages.notifications.testNotificationBody,
      })}
      onToggleNotifications={async (optIn) => {
        await setOptIn(optIn);
      }}
      profile={state.profile}
      updateClothingPreference={updateClothingPreference}
      updateLanguagePreference={updateLanguagePreference}
      updateThemePreference={updateThemePreference}
    />
  );
}
