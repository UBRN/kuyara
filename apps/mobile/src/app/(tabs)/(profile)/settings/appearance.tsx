import { router } from 'expo-router';

import { useProductAnalytics } from '@/features/analytics/application/use-product-analytics';
import { useScreenViewed } from '@/features/analytics/application/use-screen-viewed';
import { ANALYTICS_SCHEMA_VERSION } from '@/features/analytics/domain/analytics-events';
import { useProfileApplication } from '@/features/profile/application/profile-context';
import { PreferencePickerScreen } from '@/features/profile/presentation/preference-picker-screen';
import { useMessages } from '@/localization/use-messages';

export default function AppearanceSettingsRoute() {
  const messages = useMessages();
  const { state, updateThemePreference } = useProfileApplication();
  const { analytics, firstUses } = useProductAnalytics();
  useScreenViewed('settings_appearance');

  if (state.status !== 'ready') {
    return null;
  }

  const copy = messages.preferences;

  return (
    <PreferencePickerScreen
      isSaving={state.isSaving}
      onBack={() => router.back()}
      onSelect={async (value) => {
        await updateThemePreference(value);
        analytics.capture('setting_changed', {
          schema_version: ANALYTICS_SCHEMA_VERSION,
          setting_name: 'appearance_theme',
          new_value: value,
        });
        if (await firstUses.markFirstUse('appearance_override')) {
          analytics.capture('feature_used_first_time', {
            schema_version: ANALYTICS_SCHEMA_VERSION,
            feature_name: 'appearance_override',
          });
        }
      }}
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
