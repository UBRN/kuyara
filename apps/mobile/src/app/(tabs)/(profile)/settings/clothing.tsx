import { router } from 'expo-router';

import { useProfileApplication } from '@/features/profile/application/profile-context';
import { PreferencePickerScreen } from '@/features/profile/presentation/preference-picker-screen';
import { useMessages } from '@/localization/use-messages';

// ADR 0030's About you group opens the existing preference picker for the one row the
// code can back today, the clothing preference (see the "About you is provisional"
// decision). This mirrors appearance.tsx and language.tsx exactly; the picker itself is
// out of ADR 0030's scope ("nothing about them is kuyara's").
export default function ClothingSettingsRoute() {
  const messages = useMessages();
  const { state, updateClothingPreference } = useProfileApplication();

  if (state.status !== 'ready' || !state.profile.clothingPreference) {
    return null;
  }

  const copy = messages.preferences;

  return (
    <PreferencePickerScreen
      isSaving={state.isSaving}
      onBack={() => router.back()}
      onSelect={updateClothingPreference}
      options={[
        { label: copy.womensClothing, testID: 'settings-clothing-womens', value: 'womens' },
        { label: copy.mensClothing, testID: 'settings-clothing-mens', value: 'mens' },
      ]}
      selectedValue={state.profile.clothingPreference}
      testID="settings-clothing-picker"
      title={copy.clothingTitle}
    />
  );
}
