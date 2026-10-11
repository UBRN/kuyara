import type {
  DressStyle,
  Gender,
  StyleAesthetic,
  OnboardingPreferences,
} from '@/features/profile/domain/profile';

/**
 * The steps in the order they are shown. The welcome asks where first, so every step after it
 * draws the place's real weather; gender and dress style share one step over one board; the
 * optional styles and the optional name and birth date follow. The last step is the analytics
 * consent question, whose answer finishes setup (ADR 0033 section 6).
 */
export const onboardingSteps = ['location', 'dress', 'styles', 'about', 'consent'] as const;
/** A position in `onboardingSteps`. */
export type OnboardingStep = number;
const lastStep = onboardingSteps.length - 1;

export type OnboardingDraft = Readonly<{
  step: OnboardingStep;
  displayName: string | null;
  gender: Gender | null;
  dressStyle: DressStyle | null;
  styleAesthetics: readonly StyleAesthetic[];
  birthDate: string | null;
  hasValidationError: boolean;
}>;

/**
 * `continue` and `back` carry the step they were pressed on: a second tap that lands after the
 * first has already moved on belongs to a step that is gone, and is ignored.
 */
export type OnboardingAction =
  | Readonly<{ type: 'continue'; from: OnboardingStep }>
  | Readonly<{ type: 'back'; from: OnboardingStep }>
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
  if ((action.type === 'continue' || action.type === 'back') && action.from !== state.step) {
    return state;
  }

  switch (action.type) {
    case 'continue':
      if (onboardingSteps[state.step] === 'dress' && (!state.gender || !state.dressStyle)) {
        return { ...state, hasValidationError: true };
      }
      return {
        ...state,
        step: Math.min(state.step + 1, lastStep),
        hasValidationError: false,
      };
    case 'back':
      return {
        ...state,
        step: Math.max(state.step - 1, 0),
        hasValidationError: false,
      };
    // An answer keeps the step's error: the screen shows it only beside a question still open.
    case 'select-gender':
      return { ...state, gender: action.value };
    case 'select-dress-style':
      return { ...state, dressStyle: action.value };
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
    // A name left empty, or as spaces only, is no name.
    displayName: state.displayName?.trim() || null,
    gender: state.gender,
    dressStyle: state.dressStyle,
    styleAesthetics: state.styleAesthetics,
    birthDate: state.birthDate,
  };
}
