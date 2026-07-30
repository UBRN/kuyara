import { Redirect } from 'expo-router';

import { useProfileApplication } from '@/features/profile/application/profile-context';
import { canOpenSettings } from '@/features/profile/application/profile-route-gate';
import { SettingsScreen } from '@/features/profile/presentation/settings-screen';

export default function SettingsRoute() {
  const {
    state,
    updateClothingPreference,
    updateLanguagePreference,
    updateThemePreference,
  } = useProfileApplication();

  if (state.status !== 'ready') {
    return null;
  }

  if (!canOpenSettings(state.profile)) {
    return <Redirect href="/onboarding" />;
  }

  return (
    <SettingsScreen
      isSaving={state.isSaving}
      profile={state.profile}
      updateClothingPreference={updateClothingPreference}
      updateLanguagePreference={updateLanguagePreference}
      updateThemePreference={updateThemePreference}
    />
  );
}
