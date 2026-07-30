import { useProfileApplication } from '@/features/profile/application/profile-context';
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
