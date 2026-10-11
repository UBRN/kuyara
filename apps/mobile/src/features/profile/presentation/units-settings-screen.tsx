import { useState } from 'react';

import { NativeList, NativeListSection, NativePickerRow } from '@/components/ui';
import { useErrorAnnouncement } from '@/components/ui/use-error-announcement';
import type { TemperatureUnitPreference, WindSpeedUnitPreference } from '@/domain/preferences';
import { useMessages } from '@/localization/use-messages';

export type UnitsSettingsScreenProps = Readonly<{
  temperatureUnit: TemperatureUnitPreference;
  windSpeedUnit: WindSpeedUnitPreference;
  isSaving: boolean;
  onTemperatureUnitChange: (value: TemperatureUnitPreference) => Promise<void>;
  onWindSpeedUnitChange: (value: WindSpeedUnitPreference) => Promise<void>;
}>;

export function UnitsSettingsScreen({
  isSaving,
  onTemperatureUnitChange,
  onWindSpeedUnitChange,
  temperatureUnit,
  windSpeedUnit,
}: UnitsSettingsScreenProps) {
  const messages = useMessages();
  const units = messages.settings.units;
  const [hasSaveError, setHasSaveError] = useState(false);
  // VoiceOver reads no footer change, so a failed save is spoken as well as shown.
  useErrorAnnouncement(hasSaveError ? messages.settings.saveError : null);

  const save = async (change: () => Promise<void>) => {
    setHasSaveError(false);
    try {
      await change();
    } catch {
      setHasSaveError(true);
    }
  };

  return (
    <NativeList testID="settings-units">
      <NativeListSection
        footer={hasSaveError ? messages.settings.saveError : units.footer}
        testID="settings-units-group">
        <NativePickerRow
          disabled={isSaving}
          label={units.temperatureRow}
          onSelectionChange={(value) => save(() => onTemperatureUnitChange(value))}
          options={[
            { label: units.system, value: 'system' },
            { label: units.celsius, value: 'celsius' },
            { label: units.fahrenheit, value: 'fahrenheit' },
          ]}
          selection={temperatureUnit}
          icon="thermometerSwing"
          testID="settings-temperature-unit-row"
        />
        <NativePickerRow
          disabled={isSaving}
          label={units.windSpeedRow}
          onSelectionChange={(value) => save(() => onWindSpeedUnitChange(value))}
          options={[
            { label: units.system, value: 'system' },
            { label: units.kmh, value: 'kmh' },
            { label: units.mph, value: 'mph' },
          ]}
          selection={windSpeedUnit}
          icon="wind"
          testID="settings-wind-speed-unit-row"
        />
      </NativeListSection>
    </NativeList>
  );
}
