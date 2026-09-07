export type LocalProfileRecord = Readonly<{
  id: string;
  gender: string | null;
  birthDate: string | null;
  languagePreference: string;
  themePreference: string;
  onboardingCompleted: number;
  notificationsOptIn: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}>;
