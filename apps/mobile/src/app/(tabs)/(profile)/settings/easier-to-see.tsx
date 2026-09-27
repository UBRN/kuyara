import { Stack } from 'expo-router';

import { useProfileApplication } from '@/features/profile/application/profile-context';
import { EasierToSeeScreen } from '@/features/profile/presentation/easier-to-see-screen';
import { useMessages } from '@/localization/use-messages';

// O13: no screen_viewed or setting_changed event, because neither name is in the reviewed
// taxonomy (ADR 0023).
export default function EasierToSeeSettingsRoute() {
  const messages = useMessages();
  const { state, updateEasierToSee } = useProfileApplication();

  if (state.status !== 'ready') return null;

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: messages.settings.easierToSee.title,
        }}
      />
      <EasierToSeeScreen
        enabled={state.profile.easierToSee === true}
        isSaving={state.isSaving}
        onChange={(enabled) => updateEasierToSee?.(enabled) ?? Promise.resolve()}
      />
    </>
  );
}
