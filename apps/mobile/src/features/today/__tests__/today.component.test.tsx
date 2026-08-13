import { fireEvent, isHiddenFromAccessibility, render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import {
  todayScreenState,
  todayWardrobeItems,
} from '@/features/today/__tests__/fixtures';
import { OutfitDetailScreen } from '@/features/today/presentation/outfit-detail-screen';
import { createTodayPresentation } from '@/features/today/presentation/today-presentation';
import { TodayScreen } from '@/features/today/presentation/today-screen';
import { messages } from '@/localization/messages';
import { lightTheme, spacing } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

jest.mock('expo-symbols', () => ({
  SymbolView: () => null,
}));

const initialMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 59, right: 0, bottom: 34, left: 0 },
};

function providers(children: React.ReactNode) {
  return (
    <KuyaraThemeContext.Provider value={lightTheme}>
      <SafeAreaProvider initialMetrics={initialMetrics}>{children}</SafeAreaProvider>
    </KuyaraThemeContext.Provider>
  );
}

function loadedPresentation(language: 'en' | 'tr' = 'en') {
  const presentation = createTodayPresentation(todayScreenState, language);
  if (presentation.kind !== 'loaded') throw new Error('Expected loaded Today presentation.');
  return presentation;
}

test('loaded Today reserves overlay clearance and preserves grouped accessibility and navigation intents', async () => {
  const onOpenSettings = jest.fn();
  const onOpenOutfitDetail = jest.fn();
  const presentation = loadedPresentation();
  const result = await render(providers(
    <TodayScreen
      language="en"
      onOpenOutfitDetail={onOpenOutfitDetail}
      onOpenSettings={onOpenSettings}
      state={todayScreenState}
    />,
  ));

  await fireEvent(result.getByTestId('today-stretchy-header'), 'layout', {
    nativeEvent: { layout: { height: 179, width: 390, x: 0, y: 0 } },
  });

  const screenStyle = StyleSheet.flatten(
    result.getByTestId('today-screen').props.contentContainerStyle,
  );
  expect(screenStyle.paddingTop).toBe(179 + spacing['2xl']);
  expect(result.getByTestId('today-outfit-list').children).toHaveLength(
    presentation.suggestions.length - 1,
  );

  await fireEvent.press(result.getByTestId(`outfit-card-${presentation.suggestions[0].id}`));
  expect(onOpenOutfitDetail).toHaveBeenCalledWith('outfit-1');

  const settingsButton = result.getByTestId('today-settings-button');
  expect(settingsButton.props.hitSlop).toBe(7);
  expect(30 + settingsButton.props.hitSlop * 2).toBeGreaterThanOrEqual(44);
  await fireEvent.press(settingsButton);
  expect(onOpenSettings).toHaveBeenCalledTimes(1);

  expect(result.getByLabelText(
    /Wind: 8 m\/s.*Humidity: 78%.*UV: 2/,
  )).toBeOnTheScreen();
  expect(result.getByLabelText(
    /Rain chance today.*09:00\. 65% chance of rain.*11:00\. 20% chance of rain/,
  )).toBeOnTheScreen();
  expect(result.queryByText(/Sunrise|Sunset/)).not.toBeOnTheScreen();
  expect(isHiddenFromAccessibility(
    result.getByTestId('weather-glyph', { includeHiddenElements: true }),
  )).toBe(true);
});

test('rendered outfit copy comes from localization and never from the wardrobe free-form name', async () => {
  const english = loadedPresentation('en');
  const turkish = loadedPresentation('tr');
  const englishResult = await render(providers(
    <TodayScreen
      language="en"
      onOpenOutfitDetail={() => undefined}
      onOpenSettings={() => undefined}
      state={todayScreenState}
    />,
  ));

  for (const suggestion of english.suggestions) {
    expect(englishResult.getByText(suggestion.title)).toBeOnTheScreen();
  }
  expect(englishResult.getByText(messages.en.today.emphasis.recommended)).toBeOnTheScreen();
  expect(englishResult.queryByText(todayWardrobeItems[0].name!)).not.toBeOnTheScreen();

  const turkishResult = await render(providers(
    <TodayScreen
      language="tr"
      onOpenOutfitDetail={() => undefined}
      onOpenSettings={() => undefined}
      state={todayScreenState}
    />,
  ));
  for (const suggestion of turkish.suggestions) {
    expect(turkishResult.getByText(suggestion.title)).toBeOnTheScreen();
  }
});

test('outfit detail lists localized weather reasons alongside localized pieces', async () => {
  const presentation = loadedPresentation();
  const result = await render(providers(
    <OutfitDetailScreen
      backLabel={messages.en.common.back}
      language="en"
      onBack={() => undefined}
      state={todayScreenState}
      suggestionId="outfit-1"
    />,
  ));

  expect(result.getByText(messages.en.today.reasonsHeading)).toBeOnTheScreen();
  for (const reason of presentation.suggestions[0].reasons) {
    expect(result.getByText(reason)).toBeOnTheScreen();
  }
  for (const { item, slot } of presentation.suggestions[0].pieces) {
    expect(result.getByText(slot)).toBeOnTheScreen();
    expect(result.getByText(item)).toBeOnTheScreen();
  }
});

test('an unavailable recommendation keeps header and weather while replacing suggestions with local copy', async () => {
  const recommendation = todayScreenState.snapshot.recommendation;
  if (recommendation.status !== 'recommended') throw new Error('Expected fixture recommendation.');
  const state = {
    kind: 'loaded' as const,
    snapshot: {
      ...todayScreenState.snapshot,
      recommendation: {
        status: 'unavailable' as const,
        requirements: recommendation.requirements,
        failure: {
          status: 'failure' as const,
          reasonCodes: ['no_valid_composition'] as const,
          missingSlots: [],
          unmetRequirements: [],
          bestObservedEvidence: [],
          consideredCandidateKeys: [],
        },
      },
    },
  };
  const result = await render(providers(
    <TodayScreen
      language="en"
      onOpenOutfitDetail={() => undefined}
      onOpenSettings={() => undefined}
      state={state}
    />,
  ));

  expect(result.getByTestId('today-stretchy-header')).toBeOnTheScreen();
  expect(result.getByTestId('today-weather-card')).toBeOnTheScreen();
  expect(result.getByRole('alert', {
    name: `${messages.en.today.noOutfitTitle}. ${messages.en.today.noOutfitBody}`,
  })).toBeOnTheScreen();
  expect(result.queryByTestId('today-outfit-list')).not.toBeOnTheScreen();
});

test('loading Today keeps its existing feedback layout without the loaded header', async () => {
  const result = await render(providers(
    <TodayScreen
      language="en"
      onOpenOutfitDetail={() => undefined}
      onOpenSettings={() => undefined}
      state={{ kind: 'loading' }}
    />,
  ));

  expect(result.getByTestId('today-loading-screen')).toBeOnTheScreen();
  expect(result.queryByTestId('today-stretchy-header')).not.toBeOnTheScreen();
});
