import { dressStyleSchema, type DressStyle } from '@kuyara/contracts';
import { z } from 'zod';

import type {
  ClothingPreference,
  LanguagePreference,
  ThemePreference,
} from '@/domain/preferences';

export type Profile = Readonly<{
  id: string;
  gender: Gender | null;
  dressStyle: DressStyle | null;
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
  gender: Gender;
  dressStyle: DressStyle;
  birthDate: string | null;
}>;

export const genderSchema = z.enum(['woman', 'man']);
export type Gender = z.infer<typeof genderSchema>;

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

export { dressStyleSchema };
export type { DressStyle };
