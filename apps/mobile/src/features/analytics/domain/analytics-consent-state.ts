// The one in-memory answer to "may anything be captured or sent right now". It is seeded
// when the app starts (the launch read in the root layout, then the loaded profile) and set
// by the profile repository the moment a consent write has committed, so every gate in the
// capture, before-send, transport, flush, identifier and Observe paths reads this value
// instead of opening SQLite per call. Until it is seeded the answer is `undecided`, which
// permits nothing. A write that fails never reaches `set`, so the previous value stays.
import type { AnalyticsConsent } from '@/features/profile/domain/profile';

let effective: AnalyticsConsent = 'undecided';

export const analyticsConsentState = {
  current: (): AnalyticsConsent => effective,
  set: (consent: AnalyticsConsent): void => {
    effective = consent;
  },
};
