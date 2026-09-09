export type LocalProfileRecord = Readonly<{
  id: string;
  gender: string | null;
  dressStyle: string | null;
  birthDate: string | null;
  languagePreference: string;
  themePreference: string;
  onboardingCompleted: number;
  notificationsOptIn: number;
  analyticsConsent: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}>;
