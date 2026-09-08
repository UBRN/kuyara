import { router } from 'expo-router';

import { useProfileApplication } from '@/features/profile/application/profile-context';
import { PreferencePickerScreen } from '@/features/profile/presentation/preference-picker-screen';
import { useMessages } from '@/localization/use-messages';

export default function DressStyleSettingsRoute() {
  const messages = useMessages();
  const { state, updateDressStyle } = useProfileApplication();

  if (state.status !== 'ready' || !state.profile.dressStyle) {
    return null;
  }

  const copy = messages.preferences;

  return (
    <PreferencePickerScreen
      isSaving={state.isSaving}
      onBack={() => router.back()}
      onSelect={updateDressStyle}
      options={[
        { label: copy.dressStyleCasual, testID: 'settings-dress-style-casual', value: 'casual' },
        { label: copy.dressStyleSmart, testID: 'settings-dress-style-smart', value: 'smart' },
        { label: copy.dressStyleFormal, testID: 'settings-dress-style-formal', value: 'formal' },
      ]}
      selectedValue={state.profile.dressStyle}
      testID="settings-dress-style-picker"
      title={copy.dressStyleTitle}
    />
  );
}
