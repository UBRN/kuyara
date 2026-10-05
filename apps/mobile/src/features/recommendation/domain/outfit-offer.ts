import { aiV1OptionLimit } from '@kuyara/contracts';

import {
  optionalLayerCount,
  type JudgedDraft,
} from '@/features/recommendation/domain/outfit-evaluation';
import type { WornOutfit } from '@/features/recommendation/domain/outfit-history';
import {
  formalityOrder,
  garmentIdSet,
  garmentIdSetOf,
  type OutfitCandidate,
  type OutfitPin,
} from '@/features/recommendation/domain/outfit-model';
import { bodyOutfitSlots } from '@/features/recommendation/domain/outfit-slots';

// What is offered from the sorted valid drafts: the order that spreads formalities, body
// cores and layers, the diversity rule, the pins and the recent-wear exclusion.

/** How many outfits Today offers: as many as one AI request carries. */
export const offeredOutfitLimit = aiV1OptionLimit;

/** How many outfits compose around chosen pieces offers: at most three, one or two when that is all there are. */
export const composedOutfitLimit = 3;

function wearsCandidate(draft: JudgedDraft, key: string): boolean {
  return draft.side.candidateKeys.has(key) || draft.footwear.candidateKey === key;
}

function hasTwoCandidateKeysAbsentFrom(
  left: JudgedDraft,
  right: JudgedDraft,
): boolean {
  let absent = 0;
  for (const key of [...left.side.candidateKeys, left.footwear.candidateKey]) {
    if (!wearsCandidate(right, key) && (absent += 1) >= 2) {
      return true;
    }
  }
  return false;
}

function meaningfullyDifferent(
  left: JudgedDraft,
  right: JudgedDraft,
): boolean {
  return left.side.bodyCoreKey !== right.side.bodyCoreKey ||
    hasTwoCandidateKeysAbsentFrom(left, right) ||
    hasTwoCandidateKeysAbsentFrom(right, left);
}

function rotated<Value>(
  values: readonly Value[],
  startOffset: number,
): readonly Value[] {
  if (values.length === 0) {
    return values;
  }

  const offset = ((startOffset % values.length) + values.length) % values.length;
  return offset === 0
    ? values
    : [...values.slice(offset), ...values.slice(0, offset)];
}

/** One entry from each group in turn, groups keeping their own order. */
function interleaved<Value>(
  groups: readonly (readonly Value[])[],
): readonly Value[] {
  const merged: Value[] = [];
  const longest = groups.reduce((length, group) => Math.max(length, group.length), 0);
  for (let index = 0; index < longest; index += 1) {
    for (const group of groups) {
      const entry = group[index];
      if (entry !== undefined) {
        merged.push(entry);
      }
    }
  }

  return merged;
}

function groupedInOrder<Value>(
  values: readonly Value[],
  keyOf: (value: Value) => string,
): readonly (readonly Value[])[] {
  const groups = new Map<string, Value[]>();
  for (const value of values) {
    const key = keyOf(value);
    const group = groups.get(key);
    if (group) {
      group.push(value);
    } else {
      groups.set(key, [value]);
    }
  }

  return [...groups.values()];
}

/**
 * Every second body core leads with its best layered arrangement. A group that composed none
 * is left alone, and the rest of a group keeps its order.
 *
 * Which of the best-scoring layered arrangements leads is a tie-break. The rule used to take
 * the first one in score order, so body core after body core led with the same jacket and the
 * 2026-09-17 grid showed three identical outer layers in 380 of its 396 layered trios. An
 * arrangement wearing a layer no earlier group led with is taken instead, but only from among
 * those that share the group's best layered score: promoting a lower-scoring one pulled a
 * water-resistant coat onto dry days and cost more in wrong archetype labels than it bought
 * in variety, so the day's own judgement of the layer still decides what is offered.
 */
function layeredHeadOnAlternateGroups(
  groups: readonly (readonly JudgedDraft[])[],
): readonly (readonly JudgedDraft[])[] {
  const led = new Set<string>();
  return groups.map((group, index) => {
    const best = group.findIndex((outfit) => optionalLayerCount(outfit) > 0);
    if (best < 0) return group;
    if (index % 2 === 0) {
      if (best === 0) led.add(group[0]!.side.layerKey);
      return group;
    }

    const unseen = group.findIndex((outfit) =>
      optionalLayerCount(outfit) > 0 &&
      outfit.score.score === group[best]!.score.score &&
      !led.has(outfit.side.layerKey));
    const head = unseen >= 0 ? unseen : best;
    led.add(group[head]!.side.layerKey);
    return head === 0
      ? group
      : [group[head]!, ...group.slice(0, head), ...group.slice(head + 1)];
  });
}

/**
 * The order the 24 offered options are taken in. Score order alone lets one garment sweep
 * the pool: two shoes in the same thermal band both fit, the better-scoring one wins every
 * arrangement, and the formality levels and body cores behind it never reach the offer. So
 * the score-sorted list is read as two nested round-robins. The outer one takes one outfit
 * from each formality in turn, along the ladder, so every formality that composed anything
 * keeps a share of the 24 and a dress style that prefers one of them always has something
 * to prefer. The inner one takes one outfit per distinct body core in turn, so an outfit
 * that only swaps a shoe or a layer waits behind every different body. The ladder is fixed
 * rather than the request's own preference, because dress style reorders what is offered
 * and excludes nothing (ADR 0031): the offered set stays the same for all three styles, and
 * the preference is applied afterwards, when the three shown outfits are chosen.
 * `startOffset` still seeds the choice, rotating each formality's own list rather than the
 * flat one, so a day variant cannot spend a whole formality's share.
 *
 * Inside the inner round-robin every second body core is offered with its best layered
 * arrangement in front. A day that requires no layer scores every arrangement alike and the
 * comparator then reads layer count ascending, so each body core led with its bare variant
 * and the pool, being one outfit per core, carried no layer at all. Alternating keeps both
 * readings of the day: half the offer wears what the weather demands, half wears a layer it
 * merely allows, and the group's own score order decides which layer that is, so a light
 * cardigan comes forward where a parka does not.
 */
export function orderForOffer(
  outfits: readonly JudgedDraft[],
  startOffset: number,
): readonly JudgedDraft[] {
  return interleaved(
    formalityOrder.map((formality) =>
      interleaved(
        layeredHeadOnAlternateGroups(
          groupedInOrder(
            rotated(
              outfits.filter((outfit) => outfit.formality === formality),
              startOffset,
            ),
            ({ side }) => side.bodyCoreKey,
          ),
        ),
      ),
    ),
  );
}

/**
 * Takes outfits in order while each is meaningfully different from every one already taken,
 * the `reserved` ones counting as taken from the start. The result keeps the order given.
 */
export function selectDiverseOutfits(
  outfits: readonly JudgedDraft[],
  count: number,
  reserved: readonly JudgedDraft[] = [],
): readonly JudgedDraft[] {
  const selected = [...reserved];
  for (const outfit of outfits) {
    if (selected.length === count) {
      break;
    }
    if (!selected.includes(outfit) &&
      selected.every((candidate) => meaningfullyDifferent(outfit, candidate))) {
      selected.push(outfit);
    }
  }
  return Object.freeze(outfits.filter((outfit) => selected.includes(outfit)));
}

/**
 * The offered outfits, keeping the share every formality is promised. The diversity rule alone
 * can drop a formality: a day's only formal outfit, a suit, is not meaningfully different from
 * a smart look in the same shirt and trousers that the order offered first. A formality that
 * composed something but reached none of the offer has its first outfit reserved, and the
 * selection runs again around it, so the offer stays meaningfully different throughout. A day
 * that loses no formality is offered exactly what the diversity rule takes.
 */
export function selectOfferedOutfits(
  outfits: readonly JudgedDraft[],
  count: number,
): readonly JudgedDraft[] {
  const reserved: JudgedDraft[] = [];
  for (;;) {
    const selected = selectDiverseOutfits(outfits, count, reserved);
    const reserve = outfits.find((outfit) =>
      !selected.some(({ formality }) => formality === outfit.formality) &&
      reserved.every((candidate) => meaningfullyDifferent(outfit, candidate)));
    if (!reserve) return selected;
    reserved.push(reserve);
  }
}

export function pinSubsets(pins: readonly OutfitPin[]): readonly (readonly OutfitPin[])[] {
  const subsets: OutfitPin[][] = [[]];
  for (const pin of pins) subsets.push(...subsets.map((subset) => [...subset, pin]));
  return subsets.sort((left, right) => right.length - left.length);
}

/** The first history row is newest. Relax the oldest exclusion until three remain. */
export function excludeRecentlyWornOutfits(
  outfits: readonly OutfitCandidate[],
  recentWorn: readonly WornOutfit[],
): readonly OutfitCandidate[] {
  const keys = recentWorn.slice(0, 7).map((entry) => garmentIdSetOf(
    bodyOutfitSlots.map((slot) => entry.garments[slot]).filter((id) => id !== undefined)));
  for (let active = keys.length; active >= 0; active -= 1) {
    const excluded = new Set(keys.slice(0, active));
    const remaining = outfits.filter((outfit) => !excluded.has(garmentIdSet(outfit)));
    if (remaining.length >= 3 || active === 0) return Object.freeze(remaining);
  }
  return outfits;
}
