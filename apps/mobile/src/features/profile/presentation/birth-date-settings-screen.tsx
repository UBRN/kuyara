import { useMemo, useState } from 'react';

import { NativeDatePicker, NativeList, NativeListRow, NativeListSection } from '@/components/ui';
import { useMessages } from '@/localization/use-messages';

export type BirthDateSettingsScreenProps = Readonly<{
  birthDate: string | null;
  isSaving: boolean;
  onChange: (birthDate: string | null) => Promise<void>;
}>;

export function BirthDateSettingsScreen({
  birthDate,
  isSaving,
  onChange,
}: BirthDateSettingsScreenProps) {
  const messages = useMessages();
  const [hasSaveError, setHasSaveError] = useState(false);
  const maximumBirthDate = useMemo(() => new Date(), []);
  // The system picker always displays a date, so the null state is said in words (ADR 0030 §6).
  const footer = hasSaveError
    ? messages.settings.saveError
    : isSaving
      ? messages.settings.saving
      : birthDate === null
        ? messages.onboarding.birthDateNotSet
        : undefined;

  const save = async (value: string | null) => {
    if (isSaving) return;
    setHasSaveError(false);
    try {
      await onChange(value);
    } catch {
      setHasSaveError(true);
    }
  };

  return (
    <NativeList testID="settings-birth-date">
      <NativeListSection footer={footer} testID="settings-birth-date-group">
        <NativeDatePicker
          accessibilityLabel={messages.preferences.birthDateTitle}
          maximumDate={maximumBirthDate}
          onChange={(value) => void save(value)}
          testID="settings-birth-date-picker"
          value={birthDate}
        />
        {birthDate !== null ? (
          <NativeListRow
            label={messages.onboarding.birthDateClearAction}
            onPress={() => void save(null)}
            testID="settings-birth-date-clear"
            tinted
          />
        ) : null}
      </NativeListSection>
    </NativeList>
  );
}
