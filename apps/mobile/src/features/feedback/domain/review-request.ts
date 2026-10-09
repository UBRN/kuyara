import { reviewRequestVersion, type Profile } from '@/features/profile/domain/profile';

const dayMs = 24 * 60 * 60 * 1000;

/** The App Store rating is requested no sooner than this after the profile was created. */
export const reviewRequestMinimumDays = 3;

type ReviewRequestProfile = Pick<
  Profile,
  'onboardingCompleted' | 'analyticsConsent' | 'createdAt' | 'reviewRequestVersion'
>;

/**
 * Whether the system rating prompt may be requested now: onboarding is done, the analytics
 * consent sheet is answered, the profile is at least three days old, and this prompt version
 * was never requested on this install. The system still decides whether it shows anything.
 */
export function reviewRequestDue(profile: ReviewRequestProfile, nowMs: number): boolean {
  const createdMs = Date.parse(profile.createdAt);
  return profile.onboardingCompleted
    && profile.analyticsConsent !== 'undecided'
    && (profile.reviewRequestVersion ?? 0) < reviewRequestVersion
    && Number.isFinite(createdMs)
    && nowMs - createdMs >= reviewRequestMinimumDays * dayMs;
}
