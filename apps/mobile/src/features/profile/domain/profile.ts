import type { AgeBand } from '@kuyara/contracts';
import { z } from 'zod';

import type {
  ClothingPreference,
  LanguagePreference,
  ThemePreference,
} from '@/domain/preferences';

export type Profile = Readonly<{
  id: string;
  gender: Gender | null;
  birthDate: string | null;
  languagePreference: LanguagePreference;
  themePreference: ThemePreference;
  onboardingCompleted: boolean;
  notificationsOptIn: boolean;
  createdAt: string;
  updatedAt: string;
}>;

// Compatibility projection for existing screens, derived by the application controller.
export type LocalProfile = Profile & Readonly<{
  clothingPreference: ClothingPreference | null;
}>;

export type OnboardingPreferences = Readonly<{
  clothingPreference: ClothingPreference;
  languagePreference: LanguagePreference;
  themePreference: ThemePreference;
}>;

export const genderSchema = z.enum(['woman', 'man']);
export type Gender = z.infer<typeof genderSchema>;

export type ProfileOnboardingPreferences = Readonly<{
  gender: Gender;
  languagePreference: LanguagePreference;
  themePreference: ThemePreference;
}>;

const birthDateSchema = z.string().date().refine((value) => {
  const year = Number(value.slice(0, 4));
  return year >= 1900 && year <= 2100;
}).nullable();

// The static shape and year bounds, the same rule the SQLite CHECK enforces. Used on the read
// path: a stored date must never be rejected against the device clock, which can be wrong.
export function isStoredBirthDate(value: unknown): value is string | null {
  return birthDateSchema.safeParse(value).success;
}

// The moving bound, applied before a write only (ADR 0015 section 8).
export function isValidBirthDate(value: unknown, today: Date = new Date()): value is string | null {
  const parsed = birthDateSchema.safeParse(value);
  if (!parsed.success) return false;
  if (parsed.data === null) return true;
  const localToday = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  return parsed.data <= localToday;
}

export function deriveAgeBand(birthDate: string | null, today: Date = new Date()): AgeBand {
  if (!isValidBirthDate(birthDate, today)) throw new Error('The birth date is invalid.');
  if (birthDate === null) return 'adult';
  const age = today.getFullYear() - Number(birthDate.slice(0, 4));
  return age < 30 ? 'young' : age < 60 ? 'adult' : 'older';
}
