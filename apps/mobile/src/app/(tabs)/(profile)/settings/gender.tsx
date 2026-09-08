import { router } from 'expo-router';

import { useProfileApplication } from '@/features/profile/application/profile-context';
import { PreferencePickerScreen } from '@/features/profile/presentation/preference-picker-screen';
import { useMessages } from '@/localization/use-messages';

export default function GenderSettingsRoute() {
  const messages = useMessages();
  const { state, updateGender } = useProfileApplication();

  if (state.status !== 'ready' || !state.profile.gender) {
    return null;
  }

  const copy = messages.preferences;

  return (
    <PreferencePickerScreen
      isSaving={state.isSaving}
      onBack={() => router.back()}
      onSelect={updateGender}
      options={[
        { label: copy.genderWoman, testID: 'settings-gender-woman', value: 'woman' },
        { label: copy.genderMan, testID: 'settings-gender-man', value: 'man' },
      ]}
      selectedValue={state.profile.gender}
      testID="settings-gender-picker"
      title={copy.genderTitle}
    />
  );
}
