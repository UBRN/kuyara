export type LocalProfileRecord = Readonly<{
  id: string;
  clothingPreference: string | null;
  languagePreference: string;
  themePreference: string;
  onboardingCompleted: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}>;
