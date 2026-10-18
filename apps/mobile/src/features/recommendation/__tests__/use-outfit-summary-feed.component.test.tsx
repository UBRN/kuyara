import { renderHook } from '@testing-library/react-native';

import { useOutfitSummaryFeed } from '@/features/recommendation/application/use-outfit-summary-feed';

// ADR 0042 section 3: the summary for the Siri card follows the saved snapshot Today shows.
const snapshot = {
  id: 'snapshot-one',
  localDayKey: '2026-10-11',
  recommendation: { status: 'unavailable' },
  updatedAt: '2026-10-11T06:06:00.000Z',
} as never;
const ready = (value: unknown) => ({ status: 'ready', snapshot: value }) as never;

type Props = Readonly<{ state: never; language: 'en' | 'tr'; temperatureUnit: 'celsius' | 'fahrenheit' }>;

async function setup(initial: Props) {
  const write = jest.fn();
  const hook = await renderHook(
    (props: Props) => useOutfitSummaryFeed({ ...props, timeZone: 'Europe/Istanbul', write }),
    { initialProps: initial },
  );
  return { hook, write };
}

test('a ready snapshot is written once and again on a language or unit change', async () => {
  const { hook, write } = await setup({ state: ready(snapshot), language: 'en', temperatureUnit: 'celsius' });
  expect(write).toHaveBeenCalledTimes(1);
  expect(write.mock.calls[0][0]).toMatchObject({ version: 1, language: 'en', validUntil: '2026-10-11T15:00:00.000Z' });
  await hook.rerender({ state: ready(snapshot), language: 'en', temperatureUnit: 'celsius' });
  expect(write).toHaveBeenCalledTimes(1);
  await hook.rerender({ state: ready(snapshot), language: 'tr', temperatureUnit: 'celsius' });
  await hook.rerender({ state: ready(snapshot), language: 'tr', temperatureUnit: 'fahrenheit' });
  expect(write.mock.calls.map(([summary]) => summary.language)).toEqual(['en', 'tr', 'tr']);
});

test('nothing is written without a ready snapshot, so a day turn leaves the file to its own bounds', async () => {
  const { hook, write } = await setup({ state: { status: 'loading' } as never, language: 'en', temperatureUnit: 'celsius' });
  await hook.rerender({ state: ready(null), language: 'en', temperatureUnit: 'celsius' });
  await hook.rerender({ state: ready({ ...(snapshot as object), localDayKey: null }), language: 'en', temperatureUnit: 'celsius' });
  expect(write).not.toHaveBeenCalled();
});
