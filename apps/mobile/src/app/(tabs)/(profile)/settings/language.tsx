import { router } from 'expo-router';

import { useProfileApplication } from '@/features/profile/application/profile-context';
import { PreferencePickerScreen } from '@/features/profile/presentation/preference-picker-screen';
import { useMessages } from '@/localization/use-messages';

export default function LanguageSettingsRoute() {
  const messages = useMessages();
  const { state, updateLanguagePreference } = useProfileApplication();

  if (state.status !== 'ready') {
    return null;
  }

  const copy = messages.preferences;

  return (
    <PreferencePickerScreen
      isSaving={state.isSaving}
      onBack={() => router.back()}
      onSelect={updateLanguagePreference}
      options={[
        { label: copy.languageSystem, testID: 'settings-language-system', value: 'system' },
        { label: copy.languageTurkish, testID: 'settings-language-tr', value: 'tr' },
        { label: copy.languageEnglish, testID: 'settings-language-en', value: 'en' },
      ]}
      selectedValue={state.profile.languagePreference}
      testID="settings-language-picker"
      title={copy.languageTitle}
    />
  );
}
