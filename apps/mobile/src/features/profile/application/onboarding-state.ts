import type {
  DressStyle,
  Gender,
  StyleAesthetic,
  OnboardingPreferences,
} from '@/features/profile/domain/profile';

/**
 * The steps in the order they are shown. The location comes right after the welcome, so the
 * steps after it can draw the place's real weather; the optional name and birth date share
 * one step.
 */
export const onboardingSteps = ['welcome', 'location', 'about', 'gender', 'dress_style', 'styles'] as const;
export type OnboardingStep = 0 | 1 | 2 | 3 | 4 | 5;
const lastStep = (onboardingSteps.length - 1) as OnboardingStep;

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
      if (onboardingSteps[state.step] === 'gender' && !state.gender) {
        return { ...state, hasValidationError: true };
      }
      if (onboardingSteps[state.step] === 'dress_style' && !state.dressStyle) {
        return { ...state, hasValidationError: true };
      }
      return {
        ...state,
        step: Math.min(state.step + 1, lastStep) as OnboardingStep,
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
