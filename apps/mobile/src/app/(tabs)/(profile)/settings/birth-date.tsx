import { Stack } from 'expo-router';

import { useProductAnalytics } from '@/features/analytics/application/use-product-analytics';
import { useScreenViewed } from '@/features/analytics/application/use-screen-viewed';
import { ANALYTICS_SCHEMA_VERSION } from '@/features/analytics/domain/analytics-events';
import { useProfileApplication } from '@/features/profile/application/profile-context';
import { BirthDateSettingsScreen } from '@/features/profile/presentation/birth-date-settings-screen';
import { useMessages } from '@/localization/use-messages';

export default function BirthDateSettingsRoute() {
  const messages = useMessages();
  const { state, updateBirthDate } = useProfileApplication();
  const { analytics } = useProductAnalytics();
  useScreenViewed('settings_birth_date');

  if (state.status !== 'ready') return null;

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: true,
          headerTitle: messages.preferences.birthDateTitle,
        }}
      />
      <BirthDateSettingsScreen
        birthDate={state.profile.birthDate}
        isSaving={state.isSaving}
        onChange={async (value) => {
          await updateBirthDate(value);
          // Taxonomy 5.9: the birth date itself is never an allowed property value.
          analytics.capture('setting_changed', {
            schema_version: ANALYTICS_SCHEMA_VERSION,
            setting_name: 'birth_date',
          });
        }}
      />
    </>
  );
}
