import { useCallback, useMemo, useState } from 'react';

import {
  composeAroundPieces,
  type ComposeAroundInput,
  type ComposedOption,
  type ComposePin,
} from '@/features/recommendation/application/compose-around-pieces';
import type { ClothingRequirements } from '@/features/recommendation/domain/weather-to-clothing-requirements';

type Composed = Readonly<{
  /** The day the options were built for: a weather refresh that changes it drops them. */
  requirements: ClothingRequirements;
  result: 'composed' | 'unavailable';
  options: readonly ComposedOption[];
  index: number;
}>;

export type ComposeAroundPieces = Readonly<{
  /** `idle` until a compose; `unavailable` when the day composes nothing at all. */
  status: 'idle' | 'composed' | 'unavailable';
  /** At most three; one or two when that is all there is. */
  options: readonly ComposedOption[];
  /** Zero based; the screen reads "index + 1 / options.length". */
  index: number;
  /** The option on screen. Record it through the manual "Wore this today" path, as source `manual`. */
  current: ComposedOption | null;
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
 */
export function useComposeAroundPieces(context: ComposeAroundInput | null): ComposeAroundPieces {
  const [state, setState] = useState<Composed | null>(null);
  const requirements = context?.requirements ?? null;
  const clothingPreference = context?.clothingPreference;
  const dayVariant = context?.dayVariant;
  const dressStyle = context?.dressStyle;
  const styleAesthetics = context?.styleAesthetics;
  const dayKind = context?.dayKind;
  const current = state !== null && state.requirements === requirements ? state : null;

  const compose = useCallback((pins: readonly ComposePin[]) => {
    if (requirements === null || clothingPreference === undefined || dayVariant === undefined) return;
    const result = composeAroundPieces(
      { requirements, clothingPreference, dayVariant, dressStyle, styleAesthetics, dayKind }, pins);
    setState({
      requirements,
      result: result.status,
      options: result.status === 'composed' ? result.options : [],
      index: 0,
    });
  }, [clothingPreference, dayKind, dayVariant, dressStyle, requirements, styleAesthetics]);
  const showAnother = useCallback(() => setState((previous) => (previous === null || previous.options.length === 0
    ? previous
    : { ...previous, index: (previous.index + 1) % previous.options.length })), []);
  const clear = useCallback(() => setState(null), []);

  return useMemo(() => ({
    status: current === null ? 'idle' : current.result,
    options: current?.options ?? [],
    index: current?.index ?? 0,
    current: current?.options[current.index] ?? null,
    compose,
    showAnother,
    clear,
  }), [clear, compose, current, showAnother]);
}
