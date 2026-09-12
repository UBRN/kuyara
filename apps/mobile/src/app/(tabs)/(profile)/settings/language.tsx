import { router } from 'expo-router';

import { useProductAnalytics } from '@/features/analytics/application/use-product-analytics';
import { useScreenViewed } from '@/features/analytics/application/use-screen-viewed';
import { ANALYTICS_SCHEMA_VERSION } from '@/features/analytics/domain/analytics-events';
import { useProfileApplication } from '@/features/profile/application/profile-context';
import { PreferencePickerScreen } from '@/features/profile/presentation/preference-picker-screen';
import { useMessages } from '@/localization/use-messages';

export default function LanguageSettingsRoute() {
  const messages = useMessages();
  const { state, updateLanguagePreference } = useProfileApplication();
  const { analytics, firstUses } = useProductAnalytics();
  useScreenViewed('settings_language');

  if (state.status !== 'ready') {
    return null;
  }

  const copy = messages.preferences;

  return (
    <PreferencePickerScreen
      isSaving={state.isSaving}
      onBack={() => router.back()}
      onSelect={async (value) => {
        await updateLanguagePreference(value);
        analytics.capture('setting_changed', {
          schema_version: ANALYTICS_SCHEMA_VERSION,
          setting_name: 'language',
          new_value: value,
        });
        // A failed marker write is analytics bookkeeping, not a failed preference save.
        void firstUses.markFirstUse('language_override').then((firstUse) => {
          if (!firstUse) return;
          analytics.capture('feature_used_first_time', {
            schema_version: ANALYTICS_SCHEMA_VERSION,
            feature_name: 'language_override',
          });
        });
      }}
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
