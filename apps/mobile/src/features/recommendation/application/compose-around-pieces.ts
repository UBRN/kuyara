import type { DayKind, DressStyle, StyleAesthetic } from '@kuyara/contracts';

import type { ClothingPreference } from '@/domain/preferences';
import type { GarmentSwatchId } from '@/features/catalog/domain/garment-swatch';
import { pinPieces } from '@/features/recommendation/domain/manual-mix';
import { composeOutfitsAroundPins, type OutfitPin } from '@/features/recommendation/domain/outfit-composition';
import type { ClothingRequirements } from '@/features/recommendation/domain/weather-to-clothing-requirements';
import {
  assignComposedArchetypes,
  eligibilityCandidates,
  orderByDressStyle,
  type RecommendedOutfit,
} from '@/features/recommendation/application/recommend-outfits';

/** How many pieces the reader can choose to compose around. */
export const composePieceLimit = 3;

/** One piece the reader chose, and the colour it paints in on the board (a board swatch id; never read by selection). */
export type ComposePin = OutfitPin & Readonly<{ swatchId?: GarmentSwatchId }>;

/** What compose around chosen pieces reads from the day Today was built for. No AI, no Worker, no allowance. */
export type ComposeAroundInput = Readonly<{
  requirements: ClothingRequirements;
  clothingPreference: ClothingPreference;
  /** Seeds the choice the way Today's does, so a day composes the same way each time. */
  dayVariant: number;
  dressStyle?: DressStyle;
  styleAesthetics?: readonly StyleAesthetic[];
  dayKind?: DayKind;
}>;

export type ComposedOption = Readonly<{
  /** Carries its own option id and archetype; transient, never Today's snapshot. */
  outfit: RecommendedOutfit;
  /** Only when the reader's pieces fit no valid outfit and were swapped into the best pick. */
  unusual: boolean;
  /** The slots that wear the reader's pieces: their rows read "your choice". */
  pinnedSlots: readonly OutfitPin['slot'][];
  /** The colours the reader chose, by slot: each is the piece's recorded swatch on the board, and nothing else. */
  pieceColors: Readonly<Partial<Record<OutfitPin['slot'], GarmentSwatchId>>>;
}>;

export type ComposeAroundResult =
  | Readonly<{ status: 'composed'; options: readonly ComposedOption[] }>
  | Readonly<{ status: 'unavailable' }>;

function colorsOf(pins: readonly ComposePin[]): ComposedOption['pieceColors'] {
  return Object.freeze(Object.fromEntries(
    pins.flatMap(({ slot, swatchId }) => (swatchId === undefined ? [] : [[slot, swatchId]])),
  ));
}

/**
 * Up to three outfits built around the pieces the reader chose. The pieces are a predicate on
 * every valid outfit of the day, so each pick wears all of them; the rest is the day's own
 * answer, accessories included. One or two come back when that is all there is. Pieces no
 * valid outfit wears together are kept as far as any outfit allows and the rest is swapped
 * into the best pick, which the weather then calls unusual. Nothing is stored or recorded.
 */
export function composeAroundPieces(
  input: ComposeAroundInput,
  pins: readonly ComposePin[],
): ComposeAroundResult {
  if (pins.length > composePieceLimit) throw new Error(`At most ${composePieceLimit} pieces can be chosen.`);
  if (new Set(pins.map(({ slot }) => slot)).size !== pins.length) throw new Error('One piece to a slot.');
  const { requirements, clothingPreference } = input;
  const around = composeOutfitsAroundPins(
    requirements,
    eligibilityCandidates(requirements, clothingPreference),
    input.dayVariant,
    pins,
  );
  if (around.status === 'failure') return Object.freeze({ status: 'unavailable' });

  // The dress style orders the picks, the swapped-in best one included, as it orders Today's.
  const ordered = orderByDressStyle(around.outfits, input, requirements);
  if (around.unsatisfiedPins.length > 0) {
    const [best] = assignComposedArchetypes(ordered.slice(0, 1), requirements, input.dayKind);
    const { outfit, unusual, appliedPins } = pinPieces(best, pins, requirements, clothingPreference);
    return Object.freeze({
      status: 'composed',
      options: Object.freeze([Object.freeze({
        outfit,
        unusual,
        pinnedSlots: Object.freeze(appliedPins.map(({ slot }) => slot)),
        pieceColors: colorsOf(pins.filter(({ slot }) => appliedPins.some((applied) => applied.slot === slot))),
      })]),
    });
  }

  const outfits = assignComposedArchetypes(ordered, requirements, input.dayKind);
  return Object.freeze({
    status: 'composed',
    options: Object.freeze(outfits.map((outfit) => Object.freeze({
      outfit,
      unusual: false,
      pinnedSlots: Object.freeze(pins.map(({ slot }) => slot)),
      pieceColors: colorsOf(pins),
    }))),
  });
}
