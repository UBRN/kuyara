import { useCallback, useMemo, useState } from 'react';

import {
  composeAroundPieces,
  type ComposeAroundInput,
  type ComposedOption,
  type ComposePin,
} from '@/features/recommendation/application/compose-around-pieces';

type Composed = Readonly<{
  /** The day the options were built for, by value: a weather refresh that changes it drops them. */
  day: string;
  options: readonly ComposedOption[];
  index: number;
}>;

/** `showing` counts every compose and every step for as long as detail is open, so each showing is its own. */
type State = Readonly<{ composed: Composed | null; showing: number }>;
const NOTHING_COMPOSED: State = Object.freeze({ composed: null, showing: 0 });

export type ComposeAroundPieces = Readonly<{
  /** At most three; one or two when that is all there is. Empty until a compose that built something. */
  options: readonly ComposedOption[];
  /** Zero based; the screen reads "index + 1 / options.length". */
  index: number;
  /** The option on screen. Record it through the manual "Wore this today" path, as source `manual`. */
  current: ComposedOption | null;
  /**
   * Names this showing of `current`: a new compose or a step gives a new one. Edits made to
   * one showing are kept under it, so they never reach another option or kuyara's pick. It
   * never equals an option id.
   */
  key: string | null;
  /** Builds around the pieces, replacing any earlier result. Synchronous, and never stored. */
  compose: (pins: readonly ComposePin[]) => void;
  /** The next option, back to the first after the last. */
  showAnother: () => void;
  /** Forgets the result: Today's pick again. */
  clear: () => void;
}>;

/**
 * Compose around chosen pieces for one open detail. The result is transient screen state, as
 * the manual mix is: it never replaces Today's snapshot, is never saved, and leaving detail
 * forgets it. `context` is the day Today was built for; without it nothing can be composed.
 * A day that composes nothing leaves no result, so detail keeps kuyara's pick. `onSettled`
 * hears every attempt with the pieces chosen and the outfits built, none included.
 */
export function useComposeAroundPieces(
  context: ComposeAroundInput | null,
  onSettled?: (pieceCount: number, optionCount: number) => void,
): ComposeAroundPieces {
  const [state, setState] = useState<State>(NOTHING_COMPOSED);
  const requirements = context?.requirements ?? null;
  const clothingPreference = context?.clothingPreference;
  const dayVariant = context?.dayVariant;
  const dressStyle = context?.dressStyle;
  const styleAesthetics = context?.styleAesthetics;
  const dayKind = context?.dayKind;
  // A snapshot read again carries equal requirements in a new object: only a change in value
  // makes it another day.
  const day = useMemo(() => JSON.stringify(requirements), [requirements]);
  const current = state.composed !== null && state.composed.day === day ? state.composed : null;

  const compose = useCallback((pins: readonly ComposePin[]) => {
    if (requirements === null || clothingPreference === undefined || dayVariant === undefined) return;
    const result = composeAroundPieces(
      { requirements, clothingPreference, dayVariant, dressStyle, styleAesthetics, dayKind }, pins);
    const options = result.status === 'composed' ? result.options : [];
    setState(({ showing }) => ({
      composed: options.length > 0 ? { day, options, index: 0 } : null,
      showing: showing + 1,
    }));
    onSettled?.(pins.length, options.length);
  }, [clothingPreference, day, dayKind, dayVariant, dressStyle, onSettled, requirements, styleAesthetics]);
  const showAnother = useCallback(() => setState((previous) => (previous.composed === null ? previous : {
    composed: { ...previous.composed, index: (previous.composed.index + 1) % previous.composed.options.length },
    showing: previous.showing + 1,
  })), []);
  const clear = useCallback(() => setState(({ showing }) => ({ composed: null, showing })), []);

  return useMemo(() => ({
    options: current?.options ?? [],
    index: current?.index ?? 0,
    current: current?.options[current.index] ?? null,
    key: current === null ? null : `composed#${state.showing}`,
    compose,
    showAnother,
    clear,
  }), [clear, compose, current, showAnother, state.showing]);
}
