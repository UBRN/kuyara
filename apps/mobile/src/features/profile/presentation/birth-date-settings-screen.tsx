import { useMemo, useRef, useState } from 'react';

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

  // One save at a time; a turn made while one runs is kept, and the latest is saved after it,
  // so the wheel never snaps back to a date the person already turned away from.
  const saving = useRef(false);
  const queued = useRef<string | null | undefined>(undefined);
  const save = async (value: string | null): Promise<void> => {
    if (saving.current) {
      queued.current = value;
      return;
    }
    saving.current = true;
    setHasSaveError(false);
    try {
      await onChange(value);
    } catch {
      setHasSaveError(true);
    }
    saving.current = false;
    const next = queued.current;
    queued.current = undefined;
    if (next !== undefined && next !== value) await save(next);
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
