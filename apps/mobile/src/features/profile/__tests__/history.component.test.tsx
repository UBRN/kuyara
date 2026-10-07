import { act, fireEvent, render, waitFor, within } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { processColor, StyleSheet } from 'react-native';
import * as Reanimated from 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { measureGarmentBoardHeight } from '@/garment-art';
import { garmentRolesBySlot } from '@/garment-art/garment-palette';
import {
  RecommendationApplicationContext,
  type RecommendationApplicationValue,
} from '@/features/recommendation/application/recommendation-application-context';
import type { OutfitHistoryRecord } from '@/features/recommendation/domain/outfit-history';
import { LocalizationContext } from '@/localization/localization-context';
import { messages, type SupportedLanguage } from '@/localization/messages';
import { lightTheme } from '@/theme/theme';
import { EasierToSeeContext } from '@/theme/easier-to-see';
import { KuyaraThemeContext } from '@/theme/theme-context';

const mockHistoryFocus = { refocus: undefined as (() => void) | undefined };
const mockNavigate = jest.fn();
jest.mock('expo-router', () => {
  const actualReact = jest.requireActual('react') as typeof import('react');
  return {
    Stack: { Screen: () => null },
    useNavigation: () => ({ addListener: () => () => undefined, getState: () => ({ index: 0 }) }),
    useRouter: () => ({ navigate: mockNavigate }),
    useFocusEffect: (callback: () => void | (() => void)) =>
      actualReact.useEffect(() => {
        let cleanup = callback();
        mockHistoryFocus.refocus = () => {
          cleanup?.();
          cleanup = callback();
        };
        return () => {
          cleanup?.();
          mockHistoryFocus.refocus = undefined;
        };
      }, [callback]),
  };
});

// eslint-disable-next-line import/first
import HistoryRoute from '@/app/(tabs)/(profile)/history';
// eslint-disable-next-line import/first
import { HistoryScreen, historyBoard } from '@/features/profile/presentation/history-screen';

function record(dayKey: string, archetypeId: OutfitHistoryRecord['outfit']['archetypeId'],
  formality: OutfitHistoryRecord['outfit']['formality']): OutfitHistoryRecord {
  return {
    id: `id-${dayKey}`, localProfileId: 'profile-one', dayKey, photoPath: null, pieceColors: null,
    outfit: { garments: { primary_top: 't_shirt', bottom: 'jeans', footwear: 'sneakers' },
      archetypeId, formality, source: 'recommended' },
    wornAt: `${dayKey}T08:00:00.000Z`, createdAt: `${dayKey}T08:00:00.000Z`,
    updatedAt: `${dayKey}T08:00:00.000Z`, deletedAt: null,
  };
}

function Providers({ children, dressingDayKey, language, list, log }: PropsWithChildren<{
  dressingDayKey?: string;
  language: SupportedLanguage;
  list: () => Promise<readonly OutfitHistoryRecord[]>;
  log?: (dayKey: string, outfit: OutfitHistoryRecord['outfit']) => Promise<OutfitHistoryRecord>;
}>) {
  const value = {
    dressingDayKey,
    outfitHistory: { list, day: jest.fn(), log: log ?? jest.fn() },
    reevaluateLocalDay: jest.fn(),
  } as unknown as RecommendationApplicationValue;
  return (
    <LocalizationContext value={{ language, messages: messages[language], hour12: false }}>
      <KuyaraThemeContext value={lightTheme}>
        <RecommendationApplicationContext value={value}>
          <SafeAreaProvider initialMetrics={{
            frame: { x: 0, y: 0, width: 390, height: 844 },
            insets: { top: 47, right: 0, bottom: 34, left: 0 },
          }}>
            {children}
          </SafeAreaProvider>
        </RecommendationApplicationContext>
      </KuyaraThemeContext>
    </LocalizationContext>
  );
}

// ADR 0038 and O6: newest first, the latest day large under its full date with the look's
// name and day type, earlier days as small boards under their month, each spoken in full.
test.each([
  ['en', 'Wednesday 23 September', 'Monday 21 September', 'September 2026'],
  ['tr', '23 Eylül Çarşamba', '21 Eylül Pazartesi', 'Eylül 2026'],
] as const)('%s History shows worn looks as a diary of boards', async (language, first, second, month) => {
  const result = await render(
    <Providers language={language} list={async () => [
      record('2026-09-23', 'layered_warmth', 'casual'),
      record('2026-09-21', 'rain_ready', 'smart'),
    ]}>
      <HistoryRoute />
    </Providers>,
  );

  const copy = messages[language];
  await waitFor(() => expect(result.getByTestId('history-entry-2026-09-23')).toBeOnTheScreen());
  expect(result.getByText(copy.profile.historyIntro)).toBeOnTheScreen();
  expect(result.getByRole('header', { name: month })).toBeOnTheScreen();
  const newest = within(result.getByTestId('history-entry-2026-09-23'));
  expect(newest.getByText(first)).toBeOnTheScreen();
  expect(newest.getByText(copy.recommendation.archetypes.layered_warmth)).toBeOnTheScreen();
  expect(newest.getByText(copy.today.dailyStyle.casual)).toBeOnTheScreen();
  expect(newest.getByTestId('history-entry-board-2026-09-23')).toBeOnTheScreen();
  const earlier = result.getByTestId('history-entry-2026-09-21');
  expect(earlier.props.accessibilityLabel).toBe(
    `${second}. ${copy.recommendation.archetypes.rain_ready}. ${copy.today.dailyStyle.smart}`);
  expect(within(earlier).getByTestId('history-entry-board-2026-09-21')).toBeOnTheScreen();
});

// A day can hold several looks. Its date shows once, the looks
// under it morning first, each spoken with the full date, its name and day type.
test.each([
  ['en', 'Wednesday 23 September', 'Mon 21'],
  ['tr', '23 Eylül Çarşamba', '21 Pzt'],
] as const)('%s History lists the looks of one date under it, morning first', async (language, latest, earlier) => {
  const look = (dayKey: string, hour: string, archetypeId: OutfitHistoryRecord['outfit']['archetypeId'],
    formality: OutfitHistoryRecord['outfit']['formality'], top = 't_shirt' as const) => {
    const base = record(dayKey, archetypeId, formality);
    return { ...base, id: `id-${dayKey}-${hour}`, wornAt: `${dayKey}T${hour}:00:00.000Z`,
      outfit: { ...base.outfit, garments: { ...base.outfit.garments, primary_top: top } } };
  };
  const copy = messages[language];
  const result = await render(
    <Providers language={language} list={async () => [
      // Stored order is not trusted: the screen orders a date's looks by when they were worn.
      look('2026-09-23', '17', 'rain_ready', 'smart'),
      look('2026-09-23', '06', 'layered_warmth', 'casual'),
      look('2026-09-22', '08', 'layered_warmth', 'casual'),
      look('2026-09-21', '18', 'rain_ready', 'formal'),
      look('2026-09-21', '07', 'layered_warmth', 'casual'),
    ]}>
      <HistoryRoute />
    </Providers>,
  );
  await waitFor(() => expect(result.getByTestId('history-entry-2026-09-23')).toBeOnTheScreen());
  expect(result.getByRole('header', { name: latest })).toBeOnTheScreen();
  const ids = result.queryAllByTestId(/^history-entry-\d{4}-\d{2}-\d{2}(-\d)?$/).map((node) => node.props.testID);
  expect(ids).toEqual(['history-entry-2026-09-23', 'history-entry-2026-09-23-2', 'history-entry-2026-09-22',
    'history-entry-2026-09-21', 'history-entry-2026-09-21-2']);
  const morning = within(result.getByTestId('history-entry-2026-09-23'));
  expect(morning.getByText(copy.recommendation.archetypes.layered_warmth)).toBeOnTheScreen();
  expect(morning.queryByText(latest)).toBeNull();
  expect(result.getByTestId('history-entry-2026-09-23-2').props.accessibilityLabel).toBe(
    `${latest}. ${copy.recommendation.archetypes.rain_ready}. ${copy.today.dailyStyle.smart}`);
  // An earlier day worn twice names its date once, as a heading above its looks.
  expect(result.getByRole('header', { name: earlier })).toBeOnTheScreen();
  expect(result.getAllByText(earlier)).toHaveLength(1);
  expect(within(result.getByTestId('history-entry-2026-09-21')).queryByText(earlier)).toBeNull();
  expect(within(result.getByTestId('history-entry-2026-09-22')).getByText(/22/)).toBeOnTheScreen();
  expect(result.getByTestId('history-entry-board-2026-09-21-2')).toBeOnTheScreen();
});

test('one worn day stands alone as the large latest day', async () => {
  const result = await render(
    <Providers language="en" list={async () => [record('2026-09-23', 'layered_warmth', 'casual')]}>
      <HistoryRoute />
    </Providers>,
  );
  const entry = await result.findByTestId('history-entry-2026-09-23');
  expect(within(entry).getByText('Wednesday 23 September')).toBeOnTheScreen();
  expect(result.queryAllByTestId(/^history-entry-\d/)).toHaveLength(1);
});

// O13: the stage is measured the way the board draws, so the enlarged board is not clipped.
test.each([false, true])('the History stage measures its height with Easier to see %s', async (easierToSee) => {
  const entry = record('2026-09-23', 'layered_warmth', 'casual');
  const result = await render(
    <Providers language="en" list={async () => [entry]}>
      <EasierToSeeContext value={easierToSee}>
        <HistoryRoute />
      </EasierToSeeContext>
    </Providers>,
  );
  await waitFor(() => expect(result.getByTestId('history-entry-board-2026-09-23')).toBeOnTheScreen());
  const { height, width } = StyleSheet.flatten(result.getByTestId('history-entry-board-2026-09-23').props.style);
  const { pieces } = historyBoard({ dayKey: entry.dayKey, outfit: entry.outfit, pieceColors: null });
  expect(height).toBe(measureGarmentBoardHeight(pieces, width, 'today', 'womens', false, easierToSee));
});

test('a year of History renders only what is near the screen', async () => {
  const start = Date.UTC(2026, 8, 30);
  const year = Array.from({ length: 365 }, (_, day) => record(
    new Date(start - day * 86_400_000).toISOString().slice(0, 10), 'layered_warmth', 'casual'));
  const result = await render(
    <Providers language="en" list={async () => year}>
      <HistoryRoute />
    </Providers>,
  );
  expect(await result.findByTestId('history-entry-2026-09-30')).toBeOnTheScreen();
  expect(result.queryAllByTestId(/^history-entry-\d/).length).toBeLessThan(60);
  expect(result.queryByTestId('history-entry-2025-10-01')).toBeNull();
});

test('an empty History shows a faded look, one sentence and a way to Today', async () => {
  const result = await render(
    <Providers language="en" list={async () => []}>
      <HistoryRoute />
    </Providers>,
  );

  const empty = await result.findByTestId('history-empty');
  expect(within(empty).getByTestId('history-empty-art', { includeHiddenElements: true })).toBeTruthy();
  expect(within(empty).getByText(messages.en.profile.historyEmptyBody)).toBeOnTheScreen();
  // The empty History's button is the calm tonal one, as the Closet's.
  expect(within(empty).getByTestId('history-empty-today-button'))
    .toHaveStyle({ backgroundColor: lightTheme.colors.surfaceInteractive });
  await fireEvent.press(within(empty).getByTestId('history-empty-today-button'));
  expect(mockNavigate).toHaveBeenCalledWith('/');
});

test('a failed History read says so instead of showing an empty list', async () => {
  const result = await render(
    <Providers language="en" list={async () => { throw new Error('read failed'); }}>
      <HistoryRoute />
    </Providers>,
  );

  expect(await result.findByTestId('history-error')).toHaveTextContent(messages.en.profile.historyLoadError);
  expect(result.queryByTestId('history-empty')).toBeNull();
});

test('a failed History read offers Try again, which reads History again', async () => {
  const list = jest.fn<Promise<readonly OutfitHistoryRecord[]>, []>()
    .mockRejectedValueOnce(new Error('database busy'))
    .mockResolvedValueOnce([record('2026-09-23', 'layered_warmth', 'casual')]);
  const result = await render(
    <Providers language="en" list={list}>
      <HistoryRoute />
    </Providers>,
  );
  await result.findByTestId('history-error');

  await fireEvent.press(result.getByRole('button', { name: messages.en.profile.historyRetryAction }));

  expect(await result.findByTestId('history-entry-2026-09-23')).toBeOnTheScreen();
  expect(result.queryByTestId('history-error')).toBeNull();
  expect(list).toHaveBeenCalledTimes(2);
});

test('History reloads when it regains focus while still mounted', async () => {
  let records = [record('2026-09-23', 'layered_warmth', 'casual')];
  const list = jest.fn(async () => records);
  const log = jest.fn(async (dayKey: string, outfit: OutfitHistoryRecord['outfit']) => {
    const written = { ...record(dayKey, outfit.archetypeId, outfit.formality), outfit };
    records = [written];
    return written;
  });
  const result = await render(
    <Providers language="en" list={list} log={log}>
      <HistoryRoute />
    </Providers>,
  );

  expect(await result.findByTestId('history-entry-2026-09-23')).toBeOnTheScreen();
  expect(list).toHaveBeenCalledTimes(1);

  await act(async () => {
    await log('2026-09-24', record('2026-09-24', 'rain_ready', 'smart').outfit);
    mockHistoryFocus.refocus?.();
  });

  expect(await result.findByTestId('history-entry-2026-09-24')).toBeOnTheScreen();
  expect(result.queryByTestId('history-entry-2026-09-23')).toBeNull();
  expect(list).toHaveBeenCalledTimes(2);
});

test('a transient read failure on refocus keeps the list already loaded', async () => {
  const list = jest.fn<Promise<readonly OutfitHistoryRecord[]>, []>()
    .mockResolvedValueOnce([record('2026-09-23', 'layered_warmth', 'casual')])
    .mockRejectedValueOnce(new Error('database busy'));
  const result = await render(
    <Providers language="en" list={list}>
      <HistoryRoute />
    </Providers>,
  );
  expect(await result.findByTestId('history-entry-2026-09-23')).toBeOnTheScreen();

  await act(async () => { mockHistoryFocus.refocus?.(); });

  await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
  expect(result.getByTestId('history-entry-2026-09-23')).toBeOnTheScreen();
  expect(result.queryByTestId('history-error')).toBeNull();
});

// Law 7: the intro and the entries arrive in reading order, one stagger step apart; a
// refocus that finds a new day brings in that entry alone.
test('History arrives in reading order and a new day or look arrives alone', async () => {
  const withDelay = jest.spyOn(Reanimated, 'withDelay');
  const entry = (dayKey: string) => ({ ...record(dayKey, 'layered_warmth', 'casual'), pieceColors: null });
  const screen = (entries: ReturnType<typeof entry>[]) => (
    <Providers language="en" list={async () => []}>
      <HistoryScreen entries={entries} loadFailed={false} />
    </Providers>
  );
  const { stagger } = lightTheme.motion;
  const result = await render(screen([entry('2026-09-23'), entry('2026-09-21')]));
  const delays = () => withDelay.mock.calls.map(([delay]) => delay);
  // Two calls per arrival (the fade and the travel): intro, month, then each day.
  expect(delays()).toEqual([0, 0, stagger, stagger, 2 * stagger, 2 * stagger, 3 * stagger, 3 * stagger]);

  withDelay.mockClear();
  await result.rerender(screen([entry('2026-09-24'), entry('2026-09-23'), entry('2026-09-21')]));
  expect(delays()).toEqual([0, 0]);

  // A second look for a day already shown arrives alone too.
  withDelay.mockClear();
  const evening = { ...entry('2026-09-24'), id: 'id-2026-09-24-evening', wornAt: '2026-09-24T18:00:00.000Z' };
  await result.rerender(screen([entry('2026-09-24'), evening, entry('2026-09-23'), entry('2026-09-21')]));
  expect(delays()).toEqual([0, 0]);
  expect(result.getByTestId('history-entry-2026-09-24-2')).toBeOnTheScreen();
  withDelay.mockRestore();
});

// Migration 24: a day recorded with its colours is drawn in the
// swatches it was seen in; a day recorded before has none and keeps the fixed scheme.
test('a day recorded with its colours is drawn in them, an older day in the fixed scheme', async () => {
  const insideClip = (node: { parent: unknown }): boolean => {
    for (let at = node.parent as { type: unknown; parent: unknown } | null; at; at = at.parent as typeof at) {
      if (String(at.type).includes('ClipPath')) return true;
    }
    return false;
  };
  const outfit = record('2026-09-23', 'layered_warmth', 'casual').outfit;
  const pieceColors = { primary_top: 'burgundy', bottom: 'blackdenim', footwear: 'black' } as const;
  const fills = async (colors: typeof pieceColors | null) => {
    const result = await render(
      <Providers language="en" list={async () => []}>
        <HistoryScreen entries={[{ ...record('2026-09-23', 'layered_warmth', 'casual'), pieceColors: colors }]}
          loadFailed={false} />
      </Providers>,
    );
    const drawn = new Set(result.getByTestId('history-entry-board-2026-09-23', { includeHiddenElements: true })
      .queryAll((node) => typeof node.props.d === 'string' && node.props.fill != null && node.props.fill !== 'none'
        && !insideClip(node))
      .map((node) => JSON.stringify(node.props.fill)));
    await result.unmount();
    return drawn;
  };
  const roles = garmentRolesBySlot({
    optionId: 'history-2026-09-23', temperatureC: 18, condition: 'cloudy', isNight: false, formality: 'casual',
    pieces: (['primary_top', 'bottom', 'footwear'] as const).map((slot) => ({
      slot, garmentTypeId: outfit.garments[slot]!, recordedSwatchId: pieceColors[slot] })),
    appearance: 'light', stageColor: lightTheme.colors.surfaceMuted,
    accessoryStageColor: lightTheme.colors.background, inkColor: lightTheme.colors.textPrimary,
  });
  const paint = (hex: string) => JSON.stringify({ type: 0, payload: processColor(hex) });

  const coloured = await fills(pieceColors);
  for (const slot of ['primary_top', 'bottom', 'footwear'] as const) {
    expect(coloured.has(paint(roles.get(slot)!.main))).toBe(true);
  }
  const fixed = await fills(null);
  expect([...fixed].sort()).not.toEqual([...coloured].sort());
  expect(fixed.has(paint(roles.get('primary_top')!.main))).toBe(false);
});

test('a worn day with an accessory names each slot once in its palette', () => {
  const day = record('2026-09-24', 'rain_ready', 'smart');
  const outfit = { ...day.outfit, garments: { ...day.outfit.garments, head: 'beanie' } } as const;
  const { palette } = historyBoard({ dayKey: day.dayKey, outfit, pieceColors: null });
  const slots = palette.pieces.map(({ slot }) => slot);
  expect(slots).toEqual([...new Set(slots)]);
  expect(slots).toContain('head');
});

// ADR 0038: on Sunday evening History opens with a look back at the week above the days.
// 2026-10-04 is a Sunday; its week runs from Monday 28 September.
test.each([
  ['en', 'This week', 'You recorded 3 days', 'Dressed for rain on 1 day', 'Dressed light on 2 days',
    'Most worn: T-shirt, 3 days'],
  ['tr', 'Bu hafta', '3 gün kaydettin', '1 gün yağmura göre giyindin', '2 gün ince giyindin',
    'En çok giyilen: Tişört, 3 gün'],
] as const)('%s History opens with the week on Sunday evening', async (language, title, days, rain, light, piece) => {
  const rainy = record('2026-10-03', 'rain_ready', 'casual');
  const result = await render(
    <Providers dressingDayKey="2026-10-04:evening" language={language} list={async () => [
      { ...rainy, outfit: { ...rainy.outfit, garments: { ...rainy.outfit.garments, outer_layer: 'rain_jacket' } },
        pieceColors: { primary_top: 'white', bottom: 'indigo', outer_layer: 'rainyellow', footwear: 'white' } },
      record('2026-10-01', 'everyday_easy', 'casual'),
      record('2026-09-29', 'everyday_easy', 'casual'),
      record('2026-09-27', 'everyday_easy', 'casual'),
    ]}>
      <HistoryRoute />
    </Providers>,
  );

  const week = within(await result.findByTestId('history-week'));
  expect(week.getByRole('header', { name: title })).toBeOnTheScreen();
  expect(week.getByTestId('history-week-days')).toHaveTextContent(days);
  expect(week.getByTestId('history-week-rain').props.accessibilityLabel).toBe(rain);
  expect(week.getByTestId('history-week-light').props.accessibilityLabel).toBe(light);
  expect(week.queryByTestId('history-week-cold')).toBeNull();
  expect(week.getByTestId('history-week-most-worn').props.accessibilityLabel).toBe(piece);
  expect(week.getByTestId('history-week-most-worn-t_shirt', { includeHiddenElements: true })).toBeOnTheScreen();
  // The days still follow, the week's own and the one before it.
  expect(result.getByTestId('history-entry-2026-10-03')).toBeOnTheScreen();
  expect(result.getByTestId('history-entry-2026-09-27')).toBeOnTheScreen();
});

test('one recorded day is shown plainly, with no piece that came back', async () => {
  const result = await render(
    <Providers dressingDayKey="2026-10-04:evening" language="en"
      list={async () => [record('2026-10-02', 'everyday_easy', 'casual')]}>
      <HistoryRoute />
    </Providers>,
  );
  const week = within(await result.findByTestId('history-week'));
  expect(week.getByTestId('history-week-days')).toHaveTextContent('You recorded 1 day');
  expect(week.queryByTestId('history-week-most-worn')).toBeNull();
});

test.each([
  ['Sunday before 18:00', '2026-10-04', [record('2026-10-02', 'everyday_easy', 'casual')]],
  ['a weekday evening', '2026-10-01:evening', [record('2026-09-30', 'everyday_easy', 'casual')]],
  ['a Sunday evening with no day recorded that week', '2026-10-04:evening',
    [record('2026-09-27', 'everyday_easy', 'casual')]],
] as const)('History shows no week on %s', async (_case, dressingDayKey, records) => {
  const result = await render(
    <Providers dressingDayKey={dressingDayKey} language="en" list={async () => records}>
      <HistoryRoute />
    </Providers>,
  );
  expect(await result.findByTestId(`history-entry-${records[0].dayKey}`)).toBeOnTheScreen();
  expect(result.queryByTestId('history-week')).toBeNull();
});
