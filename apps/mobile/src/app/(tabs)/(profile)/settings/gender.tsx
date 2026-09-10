import { router } from 'expo-router';

import { useProductAnalytics } from '@/features/analytics/application/use-product-analytics';
import { useScreenViewed } from '@/features/analytics/application/use-screen-viewed';
import { ANALYTICS_SCHEMA_VERSION } from '@/features/analytics/domain/analytics-events';
import { useProfileApplication } from '@/features/profile/application/profile-context';
import { PreferencePickerScreen } from '@/features/profile/presentation/preference-picker-screen';
import { useMessages } from '@/localization/use-messages';

export default function GenderSettingsRoute() {
  const messages = useMessages();
  const { state, updateGender } = useProfileApplication();
  const { analytics } = useProductAnalytics();
  useScreenViewed('settings_gender');

  if (state.status !== 'ready' || !state.profile.gender) {
    return null;
  }

  const copy = messages.preferences;

  return (
    <PreferencePickerScreen
      isSaving={state.isSaving}
      onBack={() => router.back()}
      onSelect={async (value) => {
        await updateGender(value);
        // Taxonomy 5.9: `gender` is never an allowed property value, so no `new_value`.
        analytics.capture('setting_changed', {
          schema_version: ANALYTICS_SCHEMA_VERSION,
          setting_name: 'gender',
        });
      }}
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
