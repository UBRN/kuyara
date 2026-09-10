import type { OnboardingStepName } from '@/features/analytics/domain/analytics-events';
import type {
  DressStyle,
  Gender,
  OnboardingPreferences,
} from '@/features/profile/domain/profile';

export type OnboardingStep = 0 | 1 | 2 | 3 | 4;

// Taxonomy 5.2: the five-step order `onboarding_step_completed`'s `step_name` reports,
// indexed the same way `OnboardingStep` is.
export const onboardingStepNames: readonly OnboardingStepName[] = [
  'welcome',
  'gender',
  'dress_style',
  'birth_date',
  'location',
];

export type OnboardingDraft = Readonly<{
  step: OnboardingStep;
  gender: Gender | null;
  dressStyle: DressStyle | null;
  birthDate: string | null;
  hasValidationError: boolean;
}>;

export type OnboardingAction =
  | Readonly<{ type: 'continue' }>
  | Readonly<{ type: 'back' }>
  | Readonly<{ type: 'select-gender'; value: Gender }>
  | Readonly<{ type: 'select-dress-style'; value: DressStyle }>
  | Readonly<{ type: 'select-birth-date'; value: string | null }>;

export function createOnboardingDraft(values: {
  gender: Gender | null;
  dressStyle: DressStyle | null;
  birthDate: string | null;
}): OnboardingDraft {
  return {
    step: 0,
    hasValidationError: false,
    ...values,
  };
}

export function reduceOnboardingDraft(
  state: OnboardingDraft,
  action: OnboardingAction,
): OnboardingDraft {
  switch (action.type) {
    case 'continue':
      if (state.step === 1 && !state.gender) {
        return { ...state, hasValidationError: true };
      }
      if (state.step === 2 && !state.dressStyle) {
        return { ...state, hasValidationError: true };
      }
      return {
        ...state,
        step: Math.min(state.step + 1, 4) as OnboardingStep,
        hasValidationError: false,
      };
    case 'back':
      return {
        ...state,
        step: Math.max(state.step - 1, 0) as OnboardingStep,
        hasValidationError: false,
      };
    case 'select-gender':
      return {
        ...state,
        gender: action.value,
        hasValidationError: false,
      };
    case 'select-dress-style':
      return {
        ...state,
        dressStyle: action.value,
        hasValidationError: false,
      };
    case 'select-birth-date':
      return { ...state, birthDate: action.value };
  }
}

export function onboardingPreferencesFromDraft(
  state: OnboardingDraft,
): OnboardingPreferences | null {
  if (!state.gender || !state.dressStyle) {
    return null;
  }

  return {
    gender: state.gender,
    dressStyle: state.dressStyle,
    birthDate: state.birthDate,
  };
}
