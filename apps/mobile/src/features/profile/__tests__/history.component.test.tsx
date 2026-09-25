import { render, waitFor, within } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

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
jest.mock('expo-router', () => ({ Stack: { Screen: () => null } }));

// eslint-disable-next-line import/first
import HistoryRoute from '@/app/(tabs)/(profile)/history';

function record(dayKey: string, archetypeId: OutfitHistoryRecord['outfit']['archetypeId'],
  formality: OutfitHistoryRecord['outfit']['formality']): OutfitHistoryRecord {
  return {
    id: `id-${dayKey}`, localProfileId: 'profile-one', dayKey, photoPath: null,
    outfit: { garments: { primary_top: 't_shirt', bottom: 'jeans', footwear: 'sneakers' },
      archetypeId, formality, source: 'recommended' },
    wornAt: `${dayKey}T08:00:00.000Z`, createdAt: `${dayKey}T08:00:00.000Z`,
    updatedAt: `${dayKey}T08:00:00.000Z`, deletedAt: null,
  };
}

function Providers({ children, language, list }: PropsWithChildren<{
  language: SupportedLanguage;
  list: () => Promise<readonly OutfitHistoryRecord[]>;
}>) {
  const value = {
    outfitHistory: { list, get: jest.fn(), log: jest.fn() },
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

// ADR 0038 and O6: newest first, each entry titled by its locale-formatted date, with the
// look's name and day type under it.
test.each([
  ['en', 'Wednesday 23 September', 'Monday 21 September'],
  ['tr', '23 Eylül Çarşamba', '21 Eylül Pazartesi'],
] as const)('%s History lists worn looks under their dates', async (language, first, second) => {
  const result = await render(
    <Providers language={language} list={async () => [
      record('2026-09-23', 'layered_warmth', 'casual'),
      record('2026-09-21', 'rain_ready', 'smart'),
    ]}>
      <HistoryRoute />
    </Providers>,
  );

  const copy = messages[language];
  await waitFor(() => expect(result.getByTestId('history-list')).toBeOnTheScreen());
  expect(result.getByText(copy.profile.historyIntro)).toBeOnTheScreen();
  const newest = within(result.getByTestId('history-entry-2026-09-23'));
  expect(newest.getByText(first)).toBeOnTheScreen();
  expect(newest.getByText(copy.recommendation.archetypes.layered_warmth)).toBeOnTheScreen();
  expect(newest.getByText(copy.today.dailyStyle.casual)).toBeOnTheScreen();
  expect(within(result.getByTestId('history-entry-2026-09-21')).getByText(second)).toBeOnTheScreen();
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
