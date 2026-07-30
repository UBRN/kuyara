import type {
  ClothingPreference,
  LanguagePreference,
  ThemePreference,
} from '@/domain/preferences';
import type { OnboardingPreferences } from '@/features/profile/domain/profile';

export type OnboardingStep = 0 | 1 | 2;

export type OnboardingDraft = Readonly<{
  step: OnboardingStep;
  clothingPreference: ClothingPreference | null;
  languagePreference: LanguagePreference;
  themePreference: ThemePreference;
  hasValidationError: boolean;
}>;

export type OnboardingAction =
  | Readonly<{ type: 'continue' }>
  | Readonly<{ type: 'back' }>
  | Readonly<{ type: 'select-clothing'; value: ClothingPreference }>
  | Readonly<{ type: 'select-language'; value: LanguagePreference }>
  | Readonly<{ type: 'select-theme'; value: ThemePreference }>;

export function createOnboardingDraft(values: {
  clothingPreference: ClothingPreference | null;
  languagePreference: LanguagePreference;
  themePreference: ThemePreference;
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
      if (state.step === 1 && !state.clothingPreference) {
        return { ...state, hasValidationError: true };
      }
      return {
        ...state,
        step: Math.min(state.step + 1, 2) as OnboardingStep,
        hasValidationError: false,
      };
    case 'back':
      return {
        ...state,
        step: Math.max(state.step - 1, 0) as OnboardingStep,
        hasValidationError: false,
      };
    case 'select-clothing':
      return {
        ...state,
        clothingPreference: action.value,
        hasValidationError: false,
      };
    case 'select-language':
      return { ...state, languagePreference: action.value };
    case 'select-theme':
      return { ...state, themePreference: action.value };
  }
}

export function onboardingPreferencesFromDraft(
  state: OnboardingDraft,
): OnboardingPreferences | null {
  if (!state.clothingPreference) {
    return null;
  }

  return {
    clothingPreference: state.clothingPreference,
    languagePreference: state.languagePreference,
    themePreference: state.themePreference,
  };
}
