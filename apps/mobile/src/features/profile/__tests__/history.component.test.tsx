import { act, render, waitFor, within } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { processColor } from 'react-native';
import * as Reanimated from 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { garmentRolesBySlot } from '@/components/ui/garment-board/garment-palette';
import {
  RecommendationApplicationContext,
  type RecommendationApplicationValue,
} from '@/features/recommendation/application/recommendation-application-context';
import type { OutfitHistoryRecord } from '@/features/recommendation/domain/outfit-history';
import { LocalizationContext } from '@/localization/localization-context';
import { messages, type SupportedLanguage } from '@/localization/messages';
import { lightTheme } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
const mockHistoryFocus = { refocus: undefined as (() => void) | undefined };
jest.mock('expo-router', () => {
  const actualReact = jest.requireActual('react') as typeof import('react');
  return {
    Stack: { Screen: () => null },
    useNavigation: () => ({ addListener: () => () => undefined, getState: () => ({ index: 0 }) }),
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

function Providers({ children, language, list, log }: PropsWithChildren<{
  language: SupportedLanguage;
  list: () => Promise<readonly OutfitHistoryRecord[]>;
  log?: (dayKey: string, outfit: OutfitHistoryRecord['outfit']) => Promise<OutfitHistoryRecord>;
}>) {
  const value = {
    outfitHistory: { list, get: jest.fn(), log: log ?? jest.fn() },
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

test('History says so when nothing has been worn yet', async () => {
  const result = await render(
    <Providers language="en" list={async () => []}>
      <HistoryRoute />
    </Providers>,
  );

  const empty = await result.findByTestId('history-empty');
  expect(within(empty).getByRole('header', { name: messages.en.profile.historyEmptyTitle })).toBeOnTheScreen();
  expect(within(empty).getByText(messages.en.profile.historyEmptyBody)).toBeOnTheScreen();
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
test('History arrives in reading order and a new day arrives alone', async () => {
  const withDelay = jest.spyOn(Reanimated, 'withDelay');
  const entry = (dayKey: string) => ({ dayKey, outfit: record(dayKey, 'layered_warmth', 'casual').outfit, pieceColors: null });
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
  withDelay.mockRestore();
});

// Migration 24 and decision D (option 1): a day recorded with its colours is drawn in the
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
        <HistoryScreen entries={[{ dayKey: '2026-09-23', outfit, pieceColors: colors }]} loadFailed={false} />
      </Providers>,
    );
    const drawn = new Set(result.getByTestId('history-entry-board-2026-09-23', { includeHiddenElements: true })
      .queryAll((node) => typeof node.props.d === 'string' && node.props.fill != null && node.props.fill !== 'none'
        && !insideClip(node))
      .map((node) => JSON.stringify(node.props.fill)));
    result.unmount();
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
