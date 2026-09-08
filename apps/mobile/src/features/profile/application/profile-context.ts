import { createContext, use } from 'react';

import type { LanguagePreference, ThemePreference } from '@/domain/preferences';
import type { ProfileApplicationState } from '@/features/profile/application/profile-application-controller';
import type {
  DressStyle,
  Gender,
  OnboardingPreferences,
} from '@/features/profile/domain/profile';

export type ProfileApplicationValue = Readonly<{
  state: ProfileApplicationState;
  completeOnboarding: (preferences: OnboardingPreferences) => Promise<void>;
  updateGender: (gender: Gender) => Promise<void>;
  updateDressStyle: (dressStyle: DressStyle) => Promise<void>;
  updateBirthDate: (birthDate: string | null) => Promise<void>;
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
