import { useMemo, useState } from 'react';

import { NativeDatePicker, NativeList, NativeListRow, NativeListSection } from '@/components/ui';
import { birthDatePickerStart, minimumBirthDate } from '@/features/profile/domain/profile';
import { useForegroundClock } from '@/hooks/use-foreground-clock';
import { useLocalization } from '@/localization/use-messages';

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
  const { language, messages } = useLocalization();
  const [hasSaveError, setHasSaveError] = useState(false);
  // A picker always draws a date, so an unset birth date shows only Add (ADR 0030 §6); the
  // wheel it opens stores nothing until it is turned.
  const [adding, setAdding] = useState(false);
  const now = useForegroundClock();
  const maximumBirthDate = useMemo(() => new Date(now), [now]);
  const footer = hasSaveError
    ? messages.settings.saveError
    : isSaving
      ? messages.settings.saving
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
        {birthDate !== null || adding ? (
          <NativeDatePicker
            accessibilityLabel={messages.preferences.birthDateTitle}
            initialSelection={birthDatePickerStart(maximumBirthDate)}
            language={language}
            maximumDate={maximumBirthDate}
            minimumDate={minimumBirthDate}
            onChange={(value) => void save(value)}
            testID="settings-birth-date-picker"
            value={birthDate}
            wheel
          />
        ) : (
          <NativeListRow
            label={messages.onboarding.birthDateAddLabel}
            onPress={() => setAdding(true)}
            testID="settings-birth-date-add"
            tinted
          />
        )}
        {birthDate !== null ? (
          <NativeListRow
            label={messages.onboarding.birthDateClearAction}
            onPress={() => {
              setAdding(false);
              void save(null);
            }}
            testID="settings-birth-date-clear"
            tinted
          />
        ) : null}
      </NativeListSection>
    </NativeList>
  );
}
