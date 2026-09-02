import { router } from 'expo-router';

import { useProfileApplication } from '@/features/profile/application/profile-context';
import { PreferencePickerScreen } from '@/features/profile/presentation/preference-picker-screen';
import { useMessages } from '@/localization/use-messages';

export default function AppearanceSettingsRoute() {
  const messages = useMessages();
  const { state, updateThemePreference } = useProfileApplication();

  if (state.status !== 'ready') {
    return null;
  }

  const copy = messages.preferences;

  return (
    <PreferencePickerScreen
      isSaving={state.isSaving}
      onBack={() => router.back()}
      onSelect={updateThemePreference}
      options={[
        { label: copy.themeSystem, testID: 'settings-theme-system', value: 'system' },
        { label: copy.themeLight, testID: 'settings-theme-light', value: 'light' },
        { label: copy.themeDark, testID: 'settings-theme-dark', value: 'dark' },
      ]}
      selectedValue={state.profile.themePreference}
      testID="settings-appearance-picker"
      title={copy.themeTitle}
    />
  );
}
