import { createContext, use } from 'react';

import type {
  ClothingPreference,
  LanguagePreference,
  ThemePreference,
} from '@/domain/preferences';
import type { ProfileApplicationState } from '@/features/profile/application/profile-application-controller';
import type { OnboardingPreferences } from '@/features/profile/domain/profile';

export type ProfileApplicationValue = Readonly<{
  state: ProfileApplicationState;
  completeOnboarding: (preferences: OnboardingPreferences) => Promise<void>;
  updateClothingPreference: (preference: ClothingPreference) => Promise<void>;
  updateLanguagePreference: (preference: LanguagePreference) => Promise<void>;
  updateThemePreference: (preference: ThemePreference) => Promise<void>;
  updateNotificationsOptIn: (optIn: boolean) => Promise<void>;
}>;

export const ProfileApplicationContext =
  createContext<ProfileApplicationValue | null>(null);

export function useProfileApplication(): ProfileApplicationValue {
  const application = use(ProfileApplicationContext);

  if (!application) {
    throw new Error(
      'useProfileApplication must be used within ProfileApplicationProvider',
    );
  }

  return application;
}
