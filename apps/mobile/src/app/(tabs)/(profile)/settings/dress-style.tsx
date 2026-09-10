import { router } from 'expo-router';

import { useProductAnalytics } from '@/features/analytics/application/use-product-analytics';
import { useScreenViewed } from '@/features/analytics/application/use-screen-viewed';
import { ANALYTICS_SCHEMA_VERSION } from '@/features/analytics/domain/analytics-events';
import { useProfileApplication } from '@/features/profile/application/profile-context';
import { PreferencePickerScreen } from '@/features/profile/presentation/preference-picker-screen';
import { useMessages } from '@/localization/use-messages';

export default function DressStyleSettingsRoute() {
  const messages = useMessages();
  const { state, updateDressStyle } = useProfileApplication();
  const { analytics } = useProductAnalytics();
  useScreenViewed('settings_dress_style');

  if (state.status !== 'ready' || !state.profile.dressStyle) {
    return null;
  }

  const copy = messages.preferences;

  return (
    <PreferencePickerScreen
      isSaving={state.isSaving}
      onBack={() => router.back()}
      onSelect={async (value) => {
        await updateDressStyle(value);
        // Taxonomy 3: the value being chosen here, not the segmentation property.
        analytics.capture('setting_changed', {
          schema_version: ANALYTICS_SCHEMA_VERSION,
          setting_name: 'dress_style',
          new_value: value,
        });
      }}
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
