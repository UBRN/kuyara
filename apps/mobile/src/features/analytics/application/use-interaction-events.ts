import { useEffect } from 'react';

import { useProductAnalytics } from '@/features/analytics/application/use-product-analytics';
import {
  ANALYTICS_SCHEMA_VERSION,
  type AnalyticsEventProperties,
} from '@/features/analytics/domain/analytics-events';
import {
  ageBucketProperty,
  locationChangedMethodProperty,
  onboardingLocationMethodProperty,
} from '@/features/analytics/domain/analytics-mappers';
import {
  onboardingSteps,
  type OnboardingDraft,
  type OnboardingStepId,
} from '@/features/profile/application/onboarding-state';
import type { OnboardingPreferences } from '@/features/profile/domain/profile';
import type { WeatherApplicationState } from '@/features/weather/application/weather-application-controller';
import type { ActiveLocation } from '@/features/weather/domain/weather';

export function useOnboardingEvents() {
  const { analytics } = useProductAnalytics();

  useEffect(() => {
    analytics.capture('onboarding_started', {
      schema_version: ANALYTICS_SCHEMA_VERSION,
    });
    // The welcome step's first mount is the event, independent of provider identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    stepAdvanced: (draft: OnboardingDraft, activeLocationSource: ActiveLocation['source'] | null) => {
      const step = onboardingSteps[draft.step];
      // Each taxonomy step keeps its own number whatever its place on screen; the name is
      // not a taxonomy step, so the shared name and birth date step reports the birth date.
      const reported = {
        welcome: { step_name: 'welcome', step_index: 1, skipped: false },
        gender: { step_name: 'gender', step_index: 2, skipped: false },
        dress_style: { step_name: 'dress_style', step_index: 3, skipped: false },
        about: { step_name: 'birth_date', step_index: 4, skipped: draft.birthDate === null },
        location: { step_name: 'location', step_index: 5, skipped: activeLocationSource === null },
        styles: null,
      } as const satisfies Record<OnboardingStepId, Omit<AnalyticsEventProperties<'onboarding_step_completed'>,
        'schema_version' | 'dress_style'> | null>;
      const stepProperties = reported[step];
      if (!stepProperties) return;
      const properties: AnalyticsEventProperties<'onboarding_step_completed'> = {
        schema_version: ANALYTICS_SCHEMA_VERSION,
        ...stepProperties,
      };
      analytics.capture('onboarding_step_completed',
        step === 'dress_style' && draft.dressStyle
          ? { ...properties, dress_style: draft.dressStyle }
          : properties);
    },
    completed: (preferences: OnboardingPreferences, activeLocationSource: ActiveLocation['source'] | null) => {
      analytics.capture('onboarding_completed', {
        schema_version: ANALYTICS_SCHEMA_VERSION,
        dress_style: preferences.dressStyle,
        age_bucket: ageBucketProperty(preferences.birthDate),
        location_method: onboardingLocationMethodProperty(activeLocationSource),
      });
    },
  };
}

export function useWeatherInteractionEvents() {
  const { analytics, firstUses, retries } = useProductAnalytics();

  return {
    refreshFinished: (
      wasFailing: boolean,
      outcome: AnalyticsEventProperties<'manual_refresh_triggered'>['result'],
    ) => {
      if (wasFailing) {
        analytics.capture('retry_after_failure_triggered', {
          schema_version: ANALYTICS_SCHEMA_VERSION,
          surface: 'weather',
          attempt_number: retries.nextAttempt('weather'),
          result: outcome === 'success' ? 'success' : 'failure',
        });
        if (outcome === 'success') retries.reset('weather');
        return;
      }
      analytics.capture('manual_refresh_triggered', {
        schema_version: ANALYTICS_SCHEMA_VERSION,
        surface: 'weather',
        result: outcome,
      });
      void firstUses.markFirstUse('manual_refresh').then((firstUse) => {
        if (!firstUse) return;
        analytics.capture('feature_used_first_time', {
          schema_version: ANALYTICS_SCHEMA_VERSION,
          feature_name: 'manual_refresh',
        });
      });
    },
    locationSelectionFinished: (
      before: WeatherApplicationState,
      after: WeatherApplicationState,
      changeContext: 'onboarding' | 'weather_tab',
    ) => {
      const beforeKey = before.status === 'ready' ? before.activeLocation?.locationKey : undefined;
      if (after.status !== 'ready' || !after.activeLocation) return;
      if (after.activeLocation.locationKey === beforeKey) return;
      analytics.capture('location_changed', {
        schema_version: ANALYTICS_SCHEMA_VERSION,
        method: locationChangedMethodProperty(after.activeLocation.source),
        change_context: changeContext,
      });
    },
    manualLocationSelected: () => {
      void firstUses.markFirstUse('location_override').then((firstUse) => {
        if (!firstUse) return;
        analytics.capture('feature_used_first_time', {
          schema_version: ANALYTICS_SCHEMA_VERSION,
          feature_name: 'location_override',
        });
      });
    },
  };
}
