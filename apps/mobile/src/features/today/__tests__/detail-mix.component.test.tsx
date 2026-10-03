import { act, renderHook } from '@testing-library/react-native';

import type { RecommendedOutfit } from '@/features/recommendation/application/recommend-outfits';
import { outfitGarments, type SwappableSlot } from '@/features/recommendation/domain/manual-mix';
import type { ClothingRequirements } from '@/features/recommendation/domain/weather-to-clothing-requirements';
import { todayScreenState } from '@/features/today/__tests__/fixtures';
import { composePiecesOf, useDetailMix } from '@/features/today/application/composed-detail';

// Detail shows kuyara's pick or a result composed around chosen pieces, and the reader can
// edit either. A composed option built from the pick's own pieces carries the pick's id, so
// the edits are kept per showing, never per id.
if (todayScreenState.kind !== 'loaded' || todayScreenState.snapshot.recommendation.status !== 'recommended') {
  throw new Error('Expected a recommended fixture.');
}
const { outfits, requirements } = todayScreenState.snapshot.recommendation;
const pick = outfits[0];
const snapshot = { clothingPreference: 'womens', dressStyle: 'smart', dayVariant: 0 } as const;
const now = Date.parse('2026-08-13T09:00:00.000Z');
// The pick's own pieces, so one composed option is the pick itself, with its id.
const pins = composePiecesOf(pick).slice(0, 3);

type Props = Readonly<{ day: ClothingRequirements }>;
async function renderMix() {
  return renderHook(({ day }: Props) => useDetailMix(pick, day, 'womens', snapshot, null, now),
    { initialProps: { day: requirements } });
}
type Hook = Awaited<ReturnType<typeof renderMix>>;
const mix = (hook: Hook) => hook.result.current.manualMix!;

/** Changes the first slot that has another piece to wear. */
async function editOnce(hook: Hook) {
  const { candidates, outfit } = mix(hook);
  const garments = outfitGarments(outfit);
  const [slot, other] = (Object.keys(candidates) as SwappableSlot[]).flatMap((one) => (candidates[one] ?? [])
    .filter(({ garmentTypeId }) => garments[one] !== undefined && garmentTypeId !== garments[one])
    .map(({ garmentTypeId }) => [one, garmentTypeId] as const))[0];
  await act(async () => mix(hook).choose(slot, other));
  expect(mix(hook).edited).toBe(true);
}

/** Composes around the pick's pieces and steps to the option that is the pick again. */
async function composeThePick(hook: Hook) {
  await act(async () => hook.result.current.composed.compose(pins));
  const { options } = hook.result.current.composed;
  const at = options.findIndex(({ outfit }) => outfit.optionId === pick.optionId);
  expect(at).toBeGreaterThanOrEqual(0);
  for (let step = 0; step < at; step += 1) await act(async () => hook.result.current.composed.showAnother());
  expect(hook.result.current.composed.current?.outfit.optionId).toBe(pick.optionId);
}

test('an edit to kuyara\'s pick does not reach a composed option, even one with the pick\'s id', async () => {
  const hook = await renderMix();
  await editOnce(hook);
  await composeThePick(hook);
  expect(mix(hook).edited).toBe(false);
  expect(outfitGarments(mix(hook).outfit)).toEqual(outfitGarments(hook.result.current.composed.current!.outfit));
});

test('an edit to a composed option does not reach kuyara\'s pick once the result is gone', async () => {
  const hook = await renderMix();
  await composeThePick(hook);
  await editOnce(hook);
  await act(async () => hook.result.current.composed.clear());
  expect(hook.result.current.composed.current).toBeNull();
  expect(mix(hook).edited).toBe(false);
  expect(outfitGarments(mix(hook).outfit)).toEqual(outfitGarments(pick as RecommendedOutfit));
});

test('a new compose and a step each start from the composed option as built', async () => {
  const hook = await renderMix();
  await composeThePick(hook);
  await editOnce(hook);
  await composeThePick(hook);
  expect(mix(hook).edited).toBe(false);
  await editOnce(hook);
  const { options } = hook.result.current.composed;
  for (let step = 0; step < options.length; step += 1) {
    await act(async () => hook.result.current.composed.showAnother());
    expect(mix(hook).edited).toBe(false);
  }
});

test('the result stays while the day is the same in value, and goes when the day changes', async () => {
  const hook = await renderMix();
  await act(async () => hook.result.current.composed.compose(pins));
  const shown = hook.result.current.composed.current;
  expect(shown).not.toBeNull();
  await hook.rerender({ day: structuredClone(requirements) });
  expect(hook.result.current.composed.current).toBe(shown);
  await hook.rerender({ day: { ...requirements, reasonCodes: [] } });
  expect(hook.result.current.composed.current).toBeNull();
});
