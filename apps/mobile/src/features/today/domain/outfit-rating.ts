/** Whether the reader likes one of the day's three recommended outfits. */
export type OutfitVerdict = 'like' | 'dislike';

/** What did not work about a disliked outfit, in the order outfit detail offers them. */
export const outfitRatingReasons = ['too-warm', 'too-light', 'not-my-style', 'not-for-today'] as const;
export type OutfitRatingReason = (typeof outfitRatingReasons)[number];

/** A reason exists only beside a dislike. */
export type OutfitRating =
  | Readonly<{ verdict: 'like' }>
  | Readonly<{ verdict: 'dislike'; reason: OutfitRatingReason | null }>;

export type OutfitRatingTap =
  | Readonly<{ kind: 'verdict'; verdict: OutfitVerdict }>
  | Readonly<{ kind: 'reason'; reason: OutfitRatingReason }>;

/**
 * One tap on the rating row: the choice it leaves, and what was newly set, which is what gets
 * reported. Tapping the chosen verdict or reason again clears it and reports nothing; tapping
 * the other switches. A reason tap without a dislike changes nothing.
 */
export function rateOutfit(current: OutfitRating | null, tap: OutfitRatingTap): Readonly<{
  rating: OutfitRating | null;
  set: OutfitRatingTap | null;
}> {
  if (tap.kind === 'verdict') {
    if (current?.verdict === tap.verdict) return { rating: null, set: null };
    return { rating: tap.verdict === 'like' ? { verdict: 'like' } : { verdict: 'dislike', reason: null }, set: tap };
  }
  if (current?.verdict !== 'dislike') return { rating: current, set: null };
  if (current.reason === tap.reason) return { rating: { verdict: 'dislike', reason: null }, set: null };
  return { rating: { verdict: 'dislike', reason: tap.reason }, set: tap };
}
