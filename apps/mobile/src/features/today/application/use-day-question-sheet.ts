import type { DressStyle, StyleAesthetic } from '@kuyara/contracts';
import { useEffect, useReducer, useRef } from 'react';

import { useRecommendationApplication } from '@/features/recommendation/application/recommendation-application-context';
import {
  mayOpenDayQuestion,
  pendingDayQuestion,
  styleAestheticsChanged,
} from '@/features/today/application/today-surface';
import {
  closedDayQuestionSheet,
  dayQuestionSheetReducer,
  type DayQuestion,
} from '@/features/today/application/today-sheets';
import type { TodayScreenState } from '@/features/today/model';
import { useWalkthrough } from '@/features/walkthrough/application/walkthrough-context';
import { useWeatherApplication } from '@/features/weather/application/weather-application-context';

/**
 * Today's day question: it opens once per dressing day when nothing else claims the screen,
 * and every way out of it (an answer, the styles step's Done, or closing it) is one write.
 */
export function useDayQuestionSheet(state: TodayScreenState, input: Readonly<{
  focused: boolean;
  launchDone: boolean;
  namePromptShown: boolean;
}>) {
  const {
    dressingDayKey,
    morningChoicePending,
    eveningChoicePending,
    profileDressStyle,
    resolvedStyleAesthetics,
    chooseFormality,
  } = useRecommendationApplication();
  const { state: weather } = useWeatherApplication();
  const walkthrough = useWalkthrough();
  const currentDressingDayKey = dressingDayKey ?? null;
  const [sheet, dispatch] = useReducer(dayQuestionSheetReducer, closedDayQuestionSheet);
  // The sheet reports a programmatic close as a dismissal too, through the handler of the
  // render it was open in. The open question and the write in flight are read live, so the
  // close that follows an answer is never taken for a dismissal that would overwrite it.
  const openQuestion = useRef<DayQuestion | null>(null);
  const saving = useRef(false);
  const offeredDayKey = useRef<string | null>(null);

  // The day question starts empty; the Phase 8 tour holds it back until it ends.
  const pending = pendingDayQuestion(morningChoicePending, eveningChoicePending);
  const { focused, launchDone, namePromptShown } = input;
  const tourActive = walkthrough?.active === true;
  useEffect(() => {
    if (!pending || !currentDressingDayKey || !mayOpenDayQuestion({
      focused,
      launchDone,
      pending,
      namePromptShown,
      tourActive,
      dressingDayKey: currentDressingDayKey,
      offeredDayKey: offeredDayKey.current,
      weather,
      state,
    })) return;
    offeredDayKey.current = currentDressingDayKey;
    openQuestion.current = pending;
    dispatch({ type: 'asked', question: pending });
  }, [currentDressingDayKey, focused, launchDone, namePromptShown, pending, state, tourActive, weather]);

  // The one write that answers the sheet. `styles` is left out unless step 2 changed them,
  // so an untouched step keeps the Settings defaults following Settings (N4).
  const answer = async (style: DressStyle, styles?: readonly StyleAesthetic[]) => {
    if (!sheet.open || saving.current || !currentDressingDayKey) return;
    saving.current = true;
    dispatch({ type: 'answerSaving' });
    // Promise chains, not try/finally: React Compiler does not compile a function holding a
    // `finally` clause.
    await (async () => chooseFormality?.(currentDressingDayKey, style, 'morning', styles))()
      .then(() => {
        openQuestion.current = null;
        dispatch({ type: 'answerSaved' });
      })
      .catch(() => dispatch({ type: 'answerFailed' }))
      .finally(() => { saving.current = false; });
  };

  // P6: closing the question answers it with the profile's own dress style, through the same
  // write an answer makes, so it starts no generation the answer would not. Closed on step 2,
  // it answers with the same usual day type and leaves the styles as they were.
  const dismiss = () => {
    const question = openQuestion.current;
    if (saving.current || !question || !currentDressingDayKey) return;
    saving.current = true;
    openQuestion.current = null;
    dispatch({ type: 'dismissSaving' });
    void (chooseFormality?.(currentDressingDayKey, profileDressStyle, 'morning') ?? Promise.resolve())
      .then(() => dispatch({ type: 'dismissSaved' }))
      .catch(() => {
        openQuestion.current = question;
        dispatch({ type: 'dismissFailed', question });
      })
      .finally(() => { saving.current = false; });
  };

  const { stylesStep } = sheet;
  return {
    visible: sheet.open !== null,
    /** The question drawn, which stays while the sheet animates out. */
    period: sheet.drawn.question === 'evening' ? 'evening' as const : 'morning' as const,
    /** The styles step drawn, which stays while the sheet animates out. */
    stylesStep: sheet.drawn.stylesStep,
    error: sheet.error,
    usual: profileDressStyle,
    /** One tap answers: the usual day type or another one, with the styles left as they are. */
    choose: (style: DressStyle) => { void answer(style); },
    pickStyles: () => {
      if (!sheet.open || saving.current) return;
      dispatch({ type: 'stylesPicked', styles: resolvedStyleAesthetics ?? [], dayType: profileDressStyle });
    },
    draftStyles: (draft: readonly StyleAesthetic[]) => dispatch({ type: 'stylesDrafted', draft }),
    chooseStylesDayType: (dayType: DressStyle) => dispatch({ type: 'stylesDayTypeChosen', dayType }),
    confirmStyles: () => {
      if (!stylesStep) return;
      const changed = styleAestheticsChanged(stylesStep.initial, stylesStep.draft);
      void answer(stylesStep.dayType, changed ? stylesStep.draft : undefined);
    },
    dismiss,
  };
}
