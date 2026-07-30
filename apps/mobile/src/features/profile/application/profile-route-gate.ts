import type { LocalProfile } from '@/features/profile/domain/profile';

export type ProfileHomeRoute = 'onboarding' | 'today';

export function resolveProfileHomeRoute(profile: LocalProfile): ProfileHomeRoute {
  return profile.onboardingCompleted ? 'today' : 'onboarding';
}

export function canOpenSettings(profile: LocalProfile): boolean {
  return resolveProfileHomeRoute(profile) === 'today';
}
