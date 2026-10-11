import { Stack } from 'expo-router';

import { useProductAnalytics } from '@/features/analytics/application/use-product-analytics';
import { ANALYTICS_SCHEMA_VERSION } from '@/features/analytics/domain/analytics-events';
import { useProfileApplication } from '@/features/profile/application/profile-context';
import { UnitsSettingsScreen } from '@/features/profile/presentation/units-settings-screen';
import { useMessages } from '@/localization/use-messages';

// No screen_viewed event: the screen's name is not in the reviewed taxonomy (ADR 0023).
export default function UnitsSettingsRoute() {
  const messages = useMessages();
  const { state, updateTemperatureUnitPreference, updateWindSpeedUnitPreference } = useProfileApplication();
  const { analytics } = useProductAnalytics();

  if (state.status !== 'ready') return null;

  return (
    <>
      <Stack.Screen
        options={{
          headerBackTitle: messages.settings.title,
          headerShown: true,
          headerTitle: messages.settings.unitsHeading,
        }}
      />
      <UnitsSettingsScreen
        isSaving={state.isSaving}
        onTemperatureUnitChange={async (value) => {
          await updateTemperatureUnitPreference?.(value);
          analytics.capture('setting_changed', {
            schema_version: ANALYTICS_SCHEMA_VERSION,
            setting_name: 'temperature_unit',
            new_value: value,
          });
        }}
        onWindSpeedUnitChange={async (value) => {
          await updateWindSpeedUnitPreference?.(value);
          analytics.capture('setting_changed', {
            schema_version: ANALYTICS_SCHEMA_VERSION,
            setting_name: 'wind_speed_unit',
            new_value: value,
          });
        }}
        temperatureUnit={state.profile.temperatureUnitPreference ?? 'system'}
        windSpeedUnit={state.profile.windSpeedUnitPreference ?? 'system'}
      />
    </>
  );
}
