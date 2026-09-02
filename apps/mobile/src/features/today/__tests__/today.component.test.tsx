import { fireEvent, isHiddenFromAccessibility, render, within } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import {
  aiAssistedTodayScreenState,
  todayScreenState,
  todayWardrobeItems,
} from '@/features/today/__tests__/fixtures';
import { OutfitDetailScreen } from '@/features/today/presentation/outfit-detail-screen';
import { createTodayPresentation } from '@/features/today/presentation/today-presentation';
import { TodayScreen } from '@/features/today/presentation/today-screen';
import { LocalizationContext } from '@/localization/localization-context';
import { messages, type SupportedLanguage } from '@/localization/messages';
import { lightTheme, spacing, typography, type KuyaraTheme } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

jest.mock('expo-symbols', () => ({
  SymbolView: () => null,
}));

const initialMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 59, right: 0, bottom: 34, left: 0 },
};

function providers(
  children: React.ReactNode,
  theme: KuyaraTheme = lightTheme,
  language: SupportedLanguage = 'en',
) {
  return (
    <LocalizationContext value={{ language, messages: messages[language] }}>
      <KuyaraThemeContext.Provider value={theme}>
        <SafeAreaProvider initialMetrics={initialMetrics}>{children}</SafeAreaProvider>
      </KuyaraThemeContext.Provider>
    </LocalizationContext>
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
      onRefresh={() => undefined}
      state={todayScreenState}
    />,
  ));

  await fireEvent(result.getByTestId('today-stretchy-header'), 'layout', {
    nativeEvent: { layout: { height: 179, width: 390, x: 0, y: 0 } },
  });

  const screenStyle = StyleSheet.flatten(
    result.getByTestId('today-screen').props.contentContainerStyle,
  );
  // iOS resolves the top safe area itself, so Screen reserves only the remainder
  // of the overlay header above the content.
  expect(screenStyle.paddingTop).toBe(179 + spacing['2xl'] - initialMetrics.insets.top);
  expect(result.getByTestId('today-outfit-list').children).toHaveLength(
    presentation.suggestions.length - 1,
  );
  expect(StyleSheet.flatten(
    result.getByTestId('outfit-card-outfit-1-surface').props.style,
  )).toMatchObject(lightTheme.elevation.raised);
  expect(StyleSheet.flatten(result.getByTestId('today-header-temperature').props.style).fontSize)
    .toBe(typography.display.fontSize);
  expect(StyleSheet.flatten(result.getByText('Sample İstanbul').props.style).fontSize)
    .toBe(typography.title.fontSize);
  expect(result.getByText('Sample İstanbul').props.numberOfLines).toBe(1);
  expect(result.getByRole('header', { name: 'Today. Sample İstanbul' })).toBeOnTheScreen();

  expect(result.getAllByTestId('outfit-card-outfit-1-piece')).toHaveLength(
    presentation.suggestions[0].pieces.length,
  );
  expect(result.getAllByTestId('outfit-card-outfit-1-divider', {
    includeHiddenElements: true,
  })).toHaveLength(presentation.suggestions[0].pieces.length - 1);
  expect(result.getByTestId('outfit-card-outfit-1-reason')).toHaveTextContent(
    presentation.suggestions[0].reasons.join(' '),
  );
  expect(isHiddenFromAccessibility(
    result.getByTestId('today-header-weather-glyph', { includeHiddenElements: true }),
  )).toBe(true);

  const optionListStyle = StyleSheet.flatten(result.getByTestId('today-outfit-list').props.style);
  expect(optionListStyle.flexDirection).toBe('column');
  expect(StyleSheet.flatten(
    result.getByTestId('outfit-card-outfit-2-surface').props.style,
  )).toMatchObject({
    ...lightTheme.elevation.raised,
    backgroundColor: lightTheme.colors.surface,
    borderColor: lightTheme.colors.borderSubtle,
  });

  await fireEvent.press(result.getByTestId(`outfit-card-${presentation.suggestions[0].id}`));
  expect(onOpenOutfitDetail).toHaveBeenCalledWith('outfit-1');

  const settingsButton = result.getByTestId('today-settings-button');
  expect(settingsButton.props.hitSlop).toBe(7);
  expect(30 + settingsButton.props.hitSlop * 2).toBeGreaterThanOrEqual(44);
  await fireEvent.press(settingsButton);
  expect(onOpenSettings).toHaveBeenCalledTimes(1);

  expect(result.queryByTestId('today-weather-card')).not.toBeOnTheScreen();
  expect(result.queryByText(messages.en.weather.attributionOpenMeteo)).not.toBeOnTheScreen();
  expect(result.queryByText(/Sunrise|Sunset/)).not.toBeOnTheScreen();
});

test('rendered outfit copy comes from localization and never from the wardrobe free-form name', async () => {
  const english = loadedPresentation('en');
  const turkish = loadedPresentation('tr');
  const englishResult = await render(providers(
    <TodayScreen
      language="en"
      onOpenOutfitDetail={() => undefined}
      onOpenSettings={() => undefined}
      onRefresh={() => undefined}
      state={todayScreenState}
    />,
  ));

  for (const suggestion of english.suggestions) {
    expect(englishResult.getByText(suggestion.title)).toBeOnTheScreen();
  }
  const englishPrimary = within(englishResult.getByTestId('outfit-card-outfit-1'));
  for (const { item, slot } of english.suggestions[0].pieces) {
    expect(englishPrimary.getByText(item)).toBeOnTheScreen();
    expect(englishPrimary.getByText(slot)).toBeOnTheScreen();
  }
  for (const suggestion of english.suggestions.slice(1)) {
    const card = englishResult.getByTestId(`outfit-card-${suggestion.id}`);
    expect(within(card).getByText(
      messages.en.today.otherOptionPieceCount({ count: suggestion.pieces.length }),
    )).toBeOnTheScreen();
    expect(card.props.accessibilityLabel).toBe(suggestion.accessibilityLabel);
  }
  expect(englishResult.getByTestId('outfit-card-outfit-1').props.accessibilityLabel)
    .toContain('Rain Ready');
  expect(englishResult.getByText(messages.en.today.emphasis.recommended)).toBeOnTheScreen();
  expect(englishResult.queryByText(todayWardrobeItems[0].name!)).not.toBeOnTheScreen();

  const turkishResult = await render(providers(
    <TodayScreen
      language="tr"
      onOpenOutfitDetail={() => undefined}
      onOpenSettings={() => undefined}
      onRefresh={() => undefined}
      state={todayScreenState}
    />,
  ));
  for (const suggestion of turkish.suggestions) {
    expect(turkishResult.getByText(suggestion.title)).toBeOnTheScreen();
  }
  const turkishPrimary = within(turkishResult.getByTestId('outfit-card-outfit-1'));
  for (const { item, slot } of turkish.suggestions[0].pieces) {
    expect(turkishPrimary.getByText(item)).toBeOnTheScreen();
    expect(turkishPrimary.getByText(slot)).toBeOnTheScreen();
  }
  for (const suggestion of turkish.suggestions.slice(1)) {
    expect(within(turkishResult.getByTestId(`outfit-card-${suggestion.id}`)).getByText(
      messages.tr.today.otherOptionPieceCount({ count: suggestion.pieces.length }),
    )).toBeOnTheScreen();
  }
  expect(turkishResult.getByTestId('outfit-card-outfit-1').props.accessibilityLabel)
    .toContain('Yağmura Hazır');
  expect(turkishResult.getByRole('header', {
    name: 'Bugün. Konum: Örnek İstanbul.',
  })).toBeOnTheScreen();
});

describe.each(['en', 'tr'] as const)('%s Today generation mode', (language) => {
  test.each([
    [aiAssistedTodayScreenState, 'generationModeAiAssisted'],
    [todayScreenState, 'generationModeStandard'],
  ] as const)('shows the recommendation source', async (state, messageKey) => {
    const result = await render(providers(
      <TodayScreen
        language={language}
        onOpenOutfitDetail={() => undefined}
        onOpenSettings={() => undefined}
        onRefresh={() => undefined}
        state={state}
      />,
    ));

    expect(result.getByTestId('today-generation-mode')).toHaveTextContent(
      messages[language].today[messageKey],
    );
  });
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

  const reasonsHeading = result.getByRole('header', { name: messages.en.today.reasonsHeading });
  expect(StyleSheet.flatten(reasonsHeading.props.style)).toMatchObject({
    color: lightTheme.colors.textPrimary,
    fontSize: typography.bodyStrong.fontSize,
    fontWeight: typography.bodyStrong.fontWeight,
  });
  expect(result.getByRole('header', { name: presentation.suggestions[0].title }))
    .toBeOnTheScreen();
  expect(result.getByTestId('outfit-detail-ownership-summary')).toHaveTextContent(
    messages.en.onboarding.wardrobePromise,
  );
  for (const reason of presentation.suggestions[0].reasons) {
    expect(result.getByText(reason)).toBeOnTheScreen();
  }
  for (const { item, slot } of presentation.suggestions[0].pieces) {
    expect(result.getByText(slot)).toBeOnTheScreen();
    expect(result.getByText(item)).toBeOnTheScreen();
  }
  expect(result.getAllByTestId('outfit-detail-piece-card')).toHaveLength(
    presentation.suggestions[0].pieces.length,
  );
  expect(result.getAllByTestId('outfit-piece-divider', { includeHiddenElements: true })).toHaveLength(
    presentation.suggestions[0].pieces.length - 1,
  );
});

test('an unavailable recommendation keeps header and weather while replacing suggestions with local copy', async () => {
  const recommendation = todayScreenState.snapshot.recommendation;
  if (recommendation.status !== 'recommended') throw new Error('Expected fixture recommendation.');
  const state = {
    kind: 'loaded' as const,
    isRefreshing: false,
    refreshFailed: false,
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
      onRefresh={() => undefined}
      state={state}
    />,
  ));

  expect(result.getByTestId('today-stretchy-header')).toBeOnTheScreen();
  expect(result.queryByTestId('today-weather-card')).not.toBeOnTheScreen();
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
      onRefresh={() => undefined}
      state={{ kind: 'loading' }}
    />,
  ));

  expect(result.getByTestId('today-loading-screen')).toBeOnTheScreen();
  expect(result.queryByTestId('today-stretchy-header')).not.toBeOnTheScreen();
});

describe.each(['en', 'tr'] as const)('%s Today section headings', (language: SupportedLanguage) => {
  test('uses localized sentence-case bodyStrong headers', async () => {
    const result = await render(providers(
      <TodayScreen
        language={language}
        onOpenOutfitDetail={() => undefined}
        onOpenSettings={() => undefined}
        onRefresh={() => undefined}
        state={todayScreenState}
      />,
      lightTheme,
      language,
    ));

    for (const heading of [
      messages[language].today.recommendedTodayHeading,
      messages[language].today.otherOptionsHeading,
    ]) {
      const element = result.getByRole('header', { name: heading });
      expect(StyleSheet.flatten(element.props.style)).toMatchObject({
        color: lightTheme.colors.textPrimary,
        fontSize: typography.bodyStrong.fontSize,
        fontWeight: typography.bodyStrong.fontWeight,
      });
    }
  });
});

test('loaded Today offers both a pull-to-refresh gesture and a visible refresh control', async () => {
  const onRefresh = jest.fn();
  const result = await render(providers(
    <TodayScreen
      language="en"
      onOpenOutfitDetail={jest.fn()}
      onOpenSettings={jest.fn()}
      onRefresh={onRefresh}
      state={todayScreenState}
    />,
  ));

  const button = result.getByTestId('today-refresh-button');
  expect(button.props.accessibilityLabel).toBe('Refresh weather');
  fireEvent.press(button);
  expect(onRefresh).toHaveBeenCalledTimes(1);

  const refreshControl = result.getByTestId('today-screen').props.refreshControl;
  expect(refreshControl).toBeTruthy();
  expect(refreshControl.props.refreshing).toBe(false);
  expect(refreshControl.props.progressViewOffset).toBeGreaterThan(0);

  refreshControl.props.onRefresh();
  expect(onRefresh).toHaveBeenCalledTimes(2);
});

test('a Today refresh in flight announces itself and shows the spinner', async () => {
  const result = await render(providers(
    <TodayScreen
      language="en"
      onOpenOutfitDetail={jest.fn()}
      onOpenSettings={jest.fn()}
      onRefresh={jest.fn()}
      state={{ ...todayScreenState, isRefreshing: true }}
    />,
  ));

  const line = result.getByText('Refreshing weather…');
  expect(line.props.accessibilityLiveRegion).toBe('polite');
  expect(result.getByTestId('today-screen').props.refreshControl.props.refreshing).toBe(true);
});
