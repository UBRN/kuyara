import { fireEvent, render, within } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import {
  assignComposedArchetypes,
  composeOutfitPool,
  outfitOptionId,
} from '@/features/recommendation/application/recommend-outfits';
import { aiAssistedTodayScreenState, todayScreenState } from '@/features/today/__tests__/fixtures';
import type { TodayScreenState } from '@/features/today/model';
import { createTodayPresentation } from '@/features/today/presentation/today-presentation';
import { TodayScreen } from '@/features/today/presentation/today-screen';
import {
  WeatherApplicationContext,
  type WeatherApplicationValue,
} from '@/features/weather/application/weather-application-context';
import { LocalizationContext } from '@/localization/localization-context';
import { messages, type SupportedLanguage } from '@/localization/messages';
import { layout, lightTheme, typography } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

jest.mock('@expo/ui/swift-ui', () => jest.requireActual('@/components/ui/__tests__/expo-ui-test-mock'));
jest.mock('@expo/ui/swift-ui/modifiers', () =>
  jest.requireActual('@/components/ui/__tests__/expo-ui-test-mock'));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-router', () => ({
  useFocusEffect: () => undefined,
  useRouter: () => ({ push: jest.fn() }),
}));

const recommendation = todayScreenState.snapshot.recommendation;
if (recommendation.status !== 'recommended') throw new Error('Expected a recommendation fixture.');
const pool = composeOutfitPool(recommendation.requirements, 'womens', 0);
if (pool.status !== 'composed') throw new Error('Expected a composed pool.');
const shown = new Set(recommendation.outfits.map(({ optionId }) => optionId));
const ideas = assignComposedArchetypes(
  pool.outfits.filter((outfit) => !shown.has(outfitOptionId(outfit))), recommendation.requirements);

// The stylist's count line belongs to an AI day; the deterministic one is checked below.
function withIdeas(count: number): TodayScreenState {
  return {
    ...aiAssistedTodayScreenState,
    snapshot: { ...aiAssistedTodayScreenState.snapshot,
      ...(count > 0 ? { moreIdeas: ideas.slice(0, count) } : {}) },
  };
}

function screen(language: SupportedLanguage, state: TodayScreenState, open: (id: string) => void = jest.fn()) {
  const weather = {
    state: {
      status: 'ready',
      activeLocation: todayScreenState.snapshot.activeLocation,
      snapshot: todayScreenState.snapshot.weather,
      freshness: 'fresh',
      permission: { kind: 'undetermined' },
      locationFlow: 'idle',
      isSelectingLocation: false,
      isRefreshing: false,
      refreshFailure: null,
    },
    retry: jest.fn(async () => undefined),
    dismissLocationFlow: jest.fn(),
    beginDeviceLocationSelection: jest.fn(async () => undefined),
    confirmDeviceLocationRequest: jest.fn(async () => undefined),
    openApplicationSettings: jest.fn(async () => undefined),
    selectManualLocation: jest.fn(async () => undefined),
    refresh: jest.fn(async () => undefined),
    revalidateFreshness: jest.fn(async () => undefined),
  } satisfies WeatherApplicationValue;
  return (
    <LocalizationContext value={{ language, messages: messages[language], hour12: false, temperatureUnit: 'celsius' }}>
      <KuyaraThemeContext.Provider value={lightTheme}>
        <SafeAreaProvider initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 59, right: 0, bottom: 34, left: 0 },
        }}>
          <WeatherApplicationContext value={weather}>
            <TodayScreen language={language} onAskAgain={jest.fn()} onOpenOutfitDetail={open}
              onRefresh={jest.fn()} state={state} />
          </WeatherApplicationContext>
        </SafeAreaProvider>
      </KuyaraThemeContext.Provider>
    </LocalizationContext>
  );
}

const hidden = { includeHiddenElements: true };

test.each([
  ['en', 'More ideas', `${ideas.length} more outfits the stylist looked at. All suit today’s weather.`],
  ['tr', 'Daha fazla fikir', `Stilistin baktığı ${ideas.length} kombin daha. Hepsi bugünkü havaya uygun.`],
] as const)('%s: "More ideas" stands under the alternatives, one tile per idea that opens its detail', async (
  language, heading, caption,
) => {
  expect(ideas.length).toBeGreaterThan(1);
  const open = jest.fn();
  const state = withIdeas(ideas.length);
  const result = await render(screen(language, state, open));
  expect(result.getByRole('header', { name: heading })).toHaveStyle({
    fontSize: typography.bodyStrong.fontSize, fontWeight: typography.bodyStrong.fontWeight,
  });
  expect(result.getByText(caption)).toBeOnTheScreen();
  // Under the alternatives and above "Ask the stylist again", as the mockup draws it.
  expect(result.getAllByTestId(/^today-(outfit-list|more-ideas-heading|more-ideas-list|ask-again)$/)
    .map(({ props }) => props.testID))
    .toEqual(['today-outfit-list', 'today-more-ideas-heading', 'today-more-ideas-list', 'today-ask-again']);

  const presentation = createTodayPresentation(state, language, false, 'celsius', Date.now());
  if (presentation.kind !== 'loaded') throw new Error('Expected a loaded presentation.');
  expect(presentation.moreIdeas.map(({ id }) => id)).toEqual(ideas.map(({ optionId }) => optionId));
  for (const idea of presentation.moreIdeas.slice(0, 3)) {
    const tile = result.getByTestId(`today-more-idea-${idea.id}`);
    expect(tile).toHaveProp('role', 'button');
    expect(tile.props.accessibilityLabel).toBe(idea.boardAccessibilityLabel);
    expect(within(tile).getByText(idea.title)).toHaveProp('numberOfLines', 2);
    // A tile is the mockup's 132 points wide, well over the 44-point target.
    expect(StyleSheet.flatten(tile.props.style).width).toBe(132);
    expect(132).toBeGreaterThanOrEqual(layout.minimumTouchTarget);
    expect(result.getByTestId(`today-more-idea-board-${idea.id}`, hidden)).toBeTruthy();
    await fireEvent.press(tile);
    expect(open).toHaveBeenLastCalledWith(idea.id);
  }
});

test.each([
  ['en', '1 more outfit the stylist looked at. It suits today’s weather.'],
  ['tr', 'Stilistin baktığı 1 kombin daha. Bugünkü havaya uygun.'],
] as const)('%s: one idea is named in the singular', async (language, caption) => {
  const result = await render(screen(language, withIdeas(1)));
  expect(result.getByText(caption)).toBeOnTheScreen();
});

test('no ideas leave the section out, with nothing in its place', async () => {
  const result = await render(screen('en', withIdeas(0)));
  expect(result.queryByTestId('today-more-ideas-heading')).toBeNull();
  expect(result.queryByText(messages.en.today.moreIdeas.heading)).toBeNull();
});

function withMode(count: number, generationMode: 'on-device-ai' | 'ai-assisted' | 'deterministic-fallback') {
  const { snapshot } = aiAssistedTodayScreenState;
  return {
    ...aiAssistedTodayScreenState,
    snapshot: { ...snapshot, moreIdeas: ideas.slice(0, count),
      recommendation: { ...snapshot.recommendation, generationMode } },
  } satisfies TodayScreenState;
}

// A day without AI has no stylist who looked: its count line names the weather alone.
test.each([
  ['on-device-ai', 'en', 1, '1 more outfit the stylist looked at. It suits today’s weather.'],
  ['ai-assisted', 'en', 4, '4 more outfits the stylist looked at. All suit today’s weather.'],
  ['deterministic-fallback', 'en', 1, '1 more outfit that suits today’s weather.'],
  ['deterministic-fallback', 'en', 4, '4 more outfits that suit today’s weather.'],
  ['on-device-ai', 'tr', 4, 'Stilistin baktığı 4 kombin daha. Hepsi bugünkü havaya uygun.'],
  ['ai-assisted', 'tr', 1, 'Stilistin baktığı 1 kombin daha. Bugünkü havaya uygun.'],
  ['deterministic-fallback', 'tr', 1, 'Bugünkü havaya uygun 1 kombin daha.'],
  ['deterministic-fallback', 'tr', 4, 'Bugünkü havaya uygun 4 kombin daha.'],
] as const)('the %s count line in %s for %i ideas', (mode, language, count, caption) => {
  const presentation = createTodayPresentation(withMode(count, mode), language, false, 'celsius', Date.now());
  if (presentation.kind !== 'loaded') throw new Error('Expected a loaded presentation.');
  expect(presentation.moreIdeasCaption).toBe(caption);
});
