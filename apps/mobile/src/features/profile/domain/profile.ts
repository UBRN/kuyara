import { dressStyleSchema, styleAestheticSchema, type DressStyle } from '@kuyara/contracts';
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
  styleAesthetics?: readonly StyleAesthetic[];
  morningSheetEnabled?: boolean;
  birthDate: string | null;
  displayName: string | null;
  namePromptVersion: number;
  languagePreference: LanguagePreference;
  themePreference: ThemePreference;
  onboardingCompleted: boolean;
  notificationsOptIn: boolean;
  /** ADR 0004: the contextual alert offer on Today was made, and is never made again. */
  weatherAlertOfferShown: boolean;
  /** ADR 0004: the morning briefing, the second notification kind, has its own opt-in. */
  morningBriefingOptIn: boolean;
  analyticsConsent: AnalyticsConsent;
  createdAt: string;
  updatedAt: string;
}>;

// Compatibility projection for existing screens, derived by the application controller.
export type LocalProfile = Profile & Readonly<{
  clothingPreference: ClothingPreference | null;
}>;

export type OnboardingPreferences = Readonly<{
  displayName?: string | null;
  gender: Gender;
  dressStyle: DressStyle;
  styleAesthetics?: readonly StyleAesthetic[];
  birthDate: string | null;
}>;

export const genderSchema = z.enum(['woman', 'man']);
export type Gender = z.infer<typeof genderSchema>;
export type StyleAesthetic = z.infer<typeof styleAestheticSchema>;
export const styleAestheticsSchema = z.array(styleAestheticSchema).max(3).refine(
  (values) => new Set(values).size === values.length,
);

export function sortedStyleAesthetics(value: unknown): readonly StyleAesthetic[] {
  const parsed = styleAestheticsSchema.safeParse(value);
  return parsed.success ? [...parsed.data].sort() : [];
}

export function normalizeDisplayName(value: string | null): string | null {
  const name = value?.trim() ?? '';
  if (name === '') return null;
  if (displayNameIssue(name)) {
    throw new Error('The display name must have 2 to 30 characters.');
  }
  return name;
}

export function displayNameIssue(value: string): 'short' | 'long' | null {
  const length = Array.from(value.trim()).length;
  if (length === 0) return null;
  if (length < 2) return 'short';
  if (length > 30) return 'long';
  return null;
}

export const namePromptVersion = 1;

// ADR 0033 section 3: consent precedes collection, so the stored default is the unanswered
// state rather than a boolean. `withdrawn` covers both declining the first-launch sheet and
// withdrawing in Settings, so the sheet must not ask again after either answer.
export const analyticsConsentValues = ['undecided', 'granted', 'withdrawn'] as const;
export const analyticsConsentSchema = z.enum(analyticsConsentValues);
export type AnalyticsConsent = z.infer<typeof analyticsConsentSchema>;

const birthDateSchema = z.iso.date().refine((value) => {
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
