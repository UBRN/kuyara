import { dressStyleSchema, styleAestheticSchema, type DressStyle } from '@kuyara/contracts';
import { z } from 'zod';

import { formatCalendarDate } from '@/domain/calendar-date';
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
  /** O13: the "Easier to see" display mode, device-local, off by default. */
  easierToSee?: boolean;
  birthDate: string | null;
  displayName: string | null;
  namePromptVersion: number;
  /** Phase 8, ADR 0036: the coach-mark tour's stored gate; below `walkthroughVersion` it is due. */
  walkthroughVersion?: number;
  /** The outfit detail's swipe hint has played; it plays once, on the first enlargement. */
  swapHintShown?: boolean;
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
/** The one place a gender becomes the catalog it draws from. */
export const catalogPreferenceByGender = {
  woman: 'womens',
  man: 'mens',
} as const satisfies Readonly<Record<Gender, ClothingPreference>>;
export type StyleAesthetic = z.infer<typeof styleAestheticSchema>;
export const styleAestheticsSchema = z.array(styleAestheticSchema).max(3).refine(
  (values) => new Set(values).size === values.length,
);

/** The one stored and compared order of a style-aesthetics list: alphabetical, as a copy. */
export function orderStyleAesthetics<T extends string>(values: readonly T[]): T[] {
  return [...values].sort();
}

/** A list read from storage or a server in that order, or none when it is not a valid list. */
export function sortedStyleAesthetics(value: unknown): readonly StyleAesthetic[] {
  const parsed = styleAestheticsSchema.safeParse(value);
  return parsed.success ? orderStyleAesthetics(parsed.data) : [];
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

// Phase 8, ADR 0036: the coach-mark tour's code version. A stored value below it offers the
// tour once; Skip, Done or any other close of that tour stores it.
export const walkthroughVersion = 1;

// ADR 0033 section 3: consent precedes collection, so the stored default is the unanswered
// state rather than a boolean. `withdrawn` covers both declining the first-launch sheet and
// withdrawing in Settings, so the sheet must not ask again after either answer.
const analyticsConsentValues = ['undecided', 'granted', 'withdrawn'] as const;
export const analyticsConsentSchema = z.enum(analyticsConsentValues);
export type AnalyticsConsent = z.infer<typeof analyticsConsentSchema>;

const MINIMUM_BIRTH_YEAR = 1900;
const MAXIMUM_BIRTH_YEAR = 2100;

// The earliest date a birth date picker may offer, so the UI cannot select what the
// schema below refuses. Noon local time, as the picker's own dates are.
export const minimumBirthDate = new Date(MINIMUM_BIRTH_YEAR, 0, 1, 12);

const birthDateSchema = z.iso.date().refine((value) => {
  const year = Number(value.slice(0, 4));
  return year >= MINIMUM_BIRTH_YEAR && year <= MAXIMUM_BIRTH_YEAR;
}).nullable();

// The static shape and year bounds, the same rule the SQLite CHECK enforces. Used on the read
// path: a stored date must never be rejected against the device clock, which can be wrong.
export function isStoredBirthDate(value: unknown): value is string | null {
  return birthDateSchema.safeParse(value).success;
}

// The moving bound, applied before a write only (ADR 0015 section 8).
export function isValidBirthDate(value: unknown, today: Date): value is string | null {
  const parsed = birthDateSchema.safeParse(value);
  if (!parsed.success) return false;
  if (parsed.data === null) return true;
  return parsed.data <= formatCalendarDate(today);
}

export { dressStyleSchema };
export type { DressStyle };
