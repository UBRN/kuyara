import type { DressStyle, StyleAesthetic } from '@kuyara/contracts';

import type { OutfitCoverage } from '@/features/recommendation/domain/outfit-coverage';

// Today's two sheets as state machines: the day question (M16, N20) with its styles step
// (M18), and "Ask the stylist again" (O2, O3). Each reducer only says what an event does to
// what is on screen; the hooks that drive them do the writes and read the clock.

/** The morning question or the 18:00 evening question: one sheet, two openers. */
export type DayQuestion = 'morning' | 'evening';

/**
 * Step 2, opened by "Pick styles for today": the day type and the styles on screen. Nothing is
 * written until Done, so both answers land in one write and one generation.
 */
export type StylesStep = Readonly<{
  initial: readonly StyleAesthetic[];
  draft: readonly StyleAesthetic[];
  dayType: DressStyle;
}>;

export type DayQuestionSheetState = Readonly<{
  /** The question the sheet is open on, or null while it is closed. */
  open: DayQuestion | null;
  stylesStep: StylesStep | null;
  /** The last save of this opening failed. */
  error: boolean;
  /**
   * What the sheet draws. The native sheet animates out after it closes, so it keeps drawing
   * the question and the step it was showing until the next one opens.
   */
  drawn: Readonly<{ question: DayQuestion | null; stylesStep: StylesStep | null }>;
}>;

export type DayQuestionSheetEvent =
  | Readonly<{ type: 'asked'; question: DayQuestion }>
  | Readonly<{ type: 'stylesPicked'; styles: readonly StyleAesthetic[]; dayType: DressStyle }>
  | Readonly<{ type: 'stylesDrafted'; draft: readonly StyleAesthetic[] }>
  | Readonly<{ type: 'stylesDayTypeChosen'; dayType: DressStyle }>
  | Readonly<{ type: 'answerSaving' }>
  | Readonly<{ type: 'answerSaved' }>
  | Readonly<{ type: 'answerFailed' }>
  | Readonly<{ type: 'dismissSaving' }>
  | Readonly<{ type: 'dismissSaved' }>
  | Readonly<{ type: 'dismissFailed'; question: DayQuestion }>;

export const closedDayQuestionSheet: DayQuestionSheetState = {
  open: null,
  stylesStep: null,
  error: false,
  drawn: { question: null, stylesStep: null },
};

export function dayQuestionSheetReducer(
  state: DayQuestionSheetState,
  event: DayQuestionSheetEvent,
): DayQuestionSheetState {
  return withDrawn(state, dayQuestionTransition(state, event));
}

function dayQuestionTransition(
  state: DayQuestionSheetState,
  event: DayQuestionSheetEvent,
): DayQuestionSheetState {
  switch (event.type) {
    case 'asked':
      return { ...state, open: event.question };
    case 'stylesPicked':
      return { ...state, stylesStep: { initial: event.styles, draft: event.styles, dayType: event.dayType } };
    // The styles drawn are the ones being edited, including while the sheet animates out.
    case 'stylesDrafted':
      return state.drawn.stylesStep
        ? { ...state, stylesStep: { ...state.drawn.stylesStep, draft: event.draft } }
        : state;
    case 'stylesDayTypeChosen':
      return state.stylesStep ? { ...state, stylesStep: { ...state.stylesStep, dayType: event.dayType } } : state;
    case 'answerSaving':
      return { ...state, error: false };
    case 'answerSaved':
      return { ...state, open: null, stylesStep: null };
    case 'answerFailed':
      return { ...state, error: true };
    // A dismissal closes at once. An error from an earlier confirm in this opening must not
    // follow a successful close into the next opening.
    case 'dismissSaving':
      return { ...state, open: null, error: false };
    case 'dismissSaved':
      return { ...state, stylesStep: null };
    // A dismissal that could not be saved reopens the question on the save error.
    case 'dismissFailed':
      return { ...state, open: event.question, error: true };
  }
}

function withDrawn(previous: DayQuestionSheetState, next: DayQuestionSheetState): DayQuestionSheetState {
  if (next === previous || next.open === null) return next;
  if (next.drawn.question === next.open && next.drawn.stylesStep === next.stylesStep) return next;
  return { ...next, drawn: { question: next.open, stylesStep: next.stylesStep } };
}

export type AskAgainSheetState = Readonly<{
  /** The clock the sheet was opened at, which its departure window is read against; null while closed. */
  openedAt: number | null;
  busy: boolean;
  error: boolean;
  /** The window a confirmed re-ask is choosing for, until its regeneration settles. */
  choosingWindow: OutfitCoverage | null;
}>;

export type AskAgainSheetEvent =
  | Readonly<{ type: 'opened'; at: number }>
  | Readonly<{ type: 'dismissed' }>
  | Readonly<{ type: 'confirmSaving' }>
  | Readonly<{ type: 'confirmSaved'; choosingWindow: OutfitCoverage | null }>
  | Readonly<{ type: 'confirmFailed'; at: number }>
  | Readonly<{ type: 'choosingSettled' }>;

export const closedAskAgainSheet: AskAgainSheetState = {
  openedAt: null,
  busy: false,
  error: false,
  choosingWindow: null,
};

export function askAgainSheetReducer(state: AskAgainSheetState, event: AskAgainSheetEvent): AskAgainSheetState {
  switch (event.type) {
    case 'opened':
      return { ...state, openedAt: event.at, error: false };
    case 'dismissed':
      return { ...state, openedAt: null };
    case 'confirmSaving':
      return { ...state, busy: true, error: false };
    case 'confirmSaved':
      return { ...state, busy: false, openedAt: null, choosingWindow: event.choosingWindow };
    // A failure after the person closed the sheet reopens it on the error line, as a failed
    // day answer does, so a closed sheet never swallows it.
    case 'confirmFailed':
      return { ...state, busy: false, error: true, openedAt: state.openedAt ?? event.at };
    case 'choosingSettled':
      return { ...state, choosingWindow: null };
  }
}
