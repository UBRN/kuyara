import type { OnboardingStepName } from '@/features/analytics/domain/analytics-events';
import type {
  DressStyle,
  Gender,
  StyleAesthetic,
  OnboardingPreferences,
} from '@/features/profile/domain/profile';

export type OnboardingStep = 0 | 1 | 2 | 3 | 4 | 5 | 6;

// The existing analytics taxonomy has five steps. The optional name step has no event
// until that taxonomy is deliberately revised, and its value is never an event property.
export const onboardingStepNames: readonly (OnboardingStepName | null)[] = [
  'welcome',
  null,
  'gender',
  'dress_style',
  null,
  'birth_date',
  'location',
];

export type OnboardingDraft = Readonly<{
  step: OnboardingStep;
  displayName: string | null;
  gender: Gender | null;
  dressStyle: DressStyle | null;
  styleAesthetics: readonly StyleAesthetic[];
  birthDate: string | null;
  hasValidationError: boolean;
}>;

export type OnboardingAction =
  | Readonly<{ type: 'continue' }>
  | Readonly<{ type: 'back' }>
  | Readonly<{ type: 'select-gender'; value: Gender }>
  | Readonly<{ type: 'select-dress-style'; value: DressStyle }>
  | Readonly<{ type: 'select-style-aesthetics'; value: readonly StyleAesthetic[] }>
  | Readonly<{ type: 'select-birth-date'; value: string | null }>
  | Readonly<{ type: 'set-display-name'; value: string | null }>;

export function createOnboardingDraft(values: {
  displayName?: string | null;
  gender: Gender | null;
  dressStyle: DressStyle | null;
  styleAesthetics?: readonly StyleAesthetic[];
  birthDate: string | null;
}): OnboardingDraft {
  return {
    step: 0,
    hasValidationError: false,
    displayName: null,
    styleAesthetics: [],
    ...values,
  };
}

export function reduceOnboardingDraft(
  state: OnboardingDraft,
  action: OnboardingAction,
): OnboardingDraft {
  switch (action.type) {
    case 'continue':
      if (state.step === 2 && !state.gender) {
        return { ...state, hasValidationError: true };
      }
      if (state.step === 3 && !state.dressStyle) {
        return { ...state, hasValidationError: true };
      }
      return {
        ...state,
        step: Math.min(state.step + 1, 6) as OnboardingStep,
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
    case 'select-style-aesthetics':
      return { ...state, styleAesthetics: action.value };
    case 'select-birth-date':
      return { ...state, birthDate: action.value };
    case 'set-display-name':
      return { ...state, displayName: action.value };
  }
}

export function onboardingPreferencesFromDraft(
  state: OnboardingDraft,
): OnboardingPreferences | null {
  if (!state.gender || !state.dressStyle) {
    return null;
  }

  return {
    displayName: state.displayName,
    gender: state.gender,
    dressStyle: state.dressStyle,
    styleAesthetics: state.styleAesthetics,
    birthDate: state.birthDate,
  };
}
