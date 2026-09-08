import { Stack } from 'expo-router';

import { useProfileApplication } from '@/features/profile/application/profile-context';
import { BirthDateSettingsScreen } from '@/features/profile/presentation/birth-date-settings-screen';
import { useMessages } from '@/localization/use-messages';

export default function BirthDateSettingsRoute() {
  const messages = useMessages();
  const { state, updateBirthDate } = useProfileApplication();

  if (state.status !== 'ready') return null;

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: messages.preferences.birthDateTitle,
        }}
      />
      <BirthDateSettingsScreen
        birthDate={state.profile.birthDate}
        isSaving={state.isSaving}
        onChange={updateBirthDate}
      />
    </>
  );
}
