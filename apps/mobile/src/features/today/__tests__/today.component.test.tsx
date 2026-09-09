import { fireEvent, isHiddenFromAccessibility, render, within } from '@testing-library/react-native';
import { Dimensions, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import {
  aiAssistedTodayScreenState,
  todayScreenState,
  todayWardrobeItems,
} from '@/features/today/__tests__/fixtures';
import { OutfitDetailScreen } from '@/features/today/presentation/outfit-detail-screen';
import { createTodayPresentation } from '@/features/today/presentation/today-presentation';
import { TodayScreen } from '@/features/today/presentation/today-screen';
import {
  WeatherApplicationContext,
  type WeatherApplicationValue,
} from '@/features/weather/application/weather-application-context';
import type { ActiveLocation } from '@/features/weather/domain/weather';
import { WardrobeApplicationContext } from '@/features/wardrobe/application/wardrobe-application-context';
import { resolveGarmentOwnership } from '@/features/wardrobe/domain/garment-type-ownership';
import { LocalizationContext } from '@/localization/localization-context';
import { messages, type SupportedLanguage } from '@/localization/messages';
import { darkTheme, lightTheme, spacing, typography, type KuyaraTheme } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';
import { measureGarmentBoardHeight } from '@/components/ui';
import { haptics } from '@/components/ui/haptics';

jest.mock('expo-symbols', () => ({
  SymbolView: () => null,
}));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

const originalDimensions = Dimensions.get('window');
beforeEach(() => Dimensions.set({ window: { ...originalDimensions, width: 390, fontScale: 1 } }));
afterEach(() => Dimensions.set({ window: originalDimensions }));

const initialMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 59, right: 0, bottom: 34, left: 0 },
};

function providers(
  children: React.ReactNode,
  theme: KuyaraTheme = lightTheme,
  language: SupportedLanguage = 'en',
  activeLocation: ActiveLocation | null = todayScreenState.snapshot.activeLocation,
) {
  const weather = {
    state: {
      status: 'ready',
      activeLocation,
      snapshot: activeLocation ? todayScreenState.snapshot.weather : null,
      freshness: activeLocation ? 'fresh' : null,
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
  } satisfies WeatherApplicationValue;
  return (
    <LocalizationContext value={{ language, messages: messages[language] }}>
      <KuyaraThemeContext.Provider value={theme}>
        <SafeAreaProvider initialMetrics={initialMetrics}>
          <WeatherApplicationContext value={weather}>{children}</WeatherApplicationContext>
        </SafeAreaProvider>
      </KuyaraThemeContext.Provider>
    </LocalizationContext>
  );
}

function loadedPresentation(language: 'en' | 'tr' = 'en') {
  const presentation = createTodayPresentation(todayScreenState, language);
  if (presentation.kind !== 'loaded') throw new Error('Expected loaded Today presentation.');
  return presentation;
}

describe.each(['en', 'tr'] as const)('%s loaded Today', (language) => {
  test.each([lightTheme, darkTheme])('renders the stage, one rationale, quiet provenance and two equal alternates', async (theme) => {
    const presentation = loadedPresentation(language);
    const primary = presentation.suggestions[0];
    const onOpenOutfitDetail = jest.fn();
    const result = await render(providers(
      <TodayScreen language={language} onOpenOutfitDetail={onOpenOutfitDetail}
        onRefresh={jest.fn()} state={todayScreenState} />,
      theme, language,
    ));
    await fireEvent(result.getByTestId('today-content'), 'layout', {
      nativeEvent: { layout: { width: 358, height: 1000, x: 0, y: 0 } },
    });
    const hidden = { includeHiddenElements: true };
    expect(StyleSheet.flatten(result.getByTestId('today-stage', hidden).props.style))
      .toMatchObject({ backgroundColor: theme.colors.stage, borderRadius: 26, width: 358 });
    expect(result.getByTestId('today-primary-board', hidden)).toBeOnTheScreen();
    expect(result.getByTestId('today-archetype', hidden)).toHaveTextContent(primary.title);
    expect(StyleSheet.flatten(result.getByTestId('today-archetype', hidden).props.style))
      .toMatchObject(typography.title);
    expect(result.getByTestId('today-rationale')).toHaveTextContent(primary.reasons[0]);
    for (const reason of primary.reasons.slice(1)) {
      expect(result.queryByText(reason)).not.toBeOnTheScreen();
    }
    expect(result.getByTestId('today-provenance')).toHaveTextContent(presentation.header.freshness);
    expect(result.queryByTestId('today-generation-mode')).not.toBeOnTheScreen();
    expect(result.queryByText(messages[language].today.generationModeStandard)).not.toBeOnTheScreen();
    expect(result.queryByText(messages[language].today.emphasis.recommended)).not.toBeOnTheScreen();
    const place = result.getByText('Istanbul');
    expect(place.props.numberOfLines).toBe(1);
    expect(StyleSheet.flatten(place.props.style)).toMatchObject({
      ...typography.caption, color: theme.colors.textSecondary,
    });
    const temperature = result.getByTestId('today-header-temperature', hidden);
    expect(StyleSheet.flatten(temperature.props.style)).toMatchObject({
      ...typography.title, fontVariant: ['tabular-nums'], color: theme.colors.textPrimary,
    });
    expect(StyleSheet.flatten(result.getByTestId('today-condition', hidden).props.style))
      .toMatchObject({ ...typography.caption, color: theme.colors.textPrimary, opacity: 0.76 });
    expect(isHiddenFromAccessibility(result.getByTestId('today-sky', hidden))).toBe(true);
    expect(StyleSheet.flatten(result.getByTestId('today-outfit-list').props.style))
      .toMatchObject({ flexDirection: 'row', gap: spacing.lg });
    expect(result.getByTestId('today-outfit-list').children).toHaveLength(2);
    expect(result.getByRole('header', { name: messages[language].today.otherOptionsHeading }))
      .toHaveStyle({ ...typography.bodyStrong });
    expect(result.getByTestId('today-alternates-heading')).toHaveStyle({ borderBottomColor: theme.colors.borderSubtle });
    expect(result.getAllByRole('button')).toHaveLength(3);
    const button = result.getByRole('button', { name: presentation.stageAccessibilityLabel });
    expect(button).toBeOnTheScreen();
    await fireEvent.press(result.getByTestId('today-stage', hidden));
    await fireEvent.press(result.getByTestId('today-archetype', hidden));
    expect(onOpenOutfitDetail.mock.calls).toEqual([['outfit-1'], ['outfit-1']]);
    // Both alternates share the taller of their two derived stage heights, so their
    // captions sit on one baseline; the shorter board is centred in its stage.
    const alternateWidth = (358 - spacing.lg) / 2;
    const tallestStage = Math.max(
      ...presentation.suggestions
        .slice(1)
        .map((suggestion) => measureGarmentBoardHeight(suggestion.boardPieces, alternateWidth, 'today')),
    );
    expect(tallestStage).toBeGreaterThan(0);
    for (const suggestion of presentation.suggestions.slice(1)) {
      expect(
        StyleSheet.flatten(result.getByTestId(`today-alternate-stage-${suggestion.id}`, hidden).props.style),
      ).toMatchObject({ height: tallestStage, justifyContent: 'center' });
    }
    for (const suggestion of presentation.suggestions.slice(1)) {
      const alternate = result.getByTestId(`today-alternate-${suggestion.id}`);
      expect(alternate.props.accessibilityLabel).toBe(suggestion.boardAccessibilityLabel);
      expect(within(alternate).getByText(suggestion.title)).toHaveProp('numberOfLines', 1);
      expect(result.getByTestId(`today-alternate-board-${suggestion.id}`, hidden)).toBeOnTheScreen();
      await fireEvent.press(alternate);
      expect(onOpenOutfitDetail).toHaveBeenLastCalledWith(suggestion.id);
    }
    for (const { item, slot } of primary.pieces) {
      expect(result.queryByText(item)).not.toBeOnTheScreen();
      expect(result.queryByText(slot)).not.toBeOnTheScreen();
    }
    expect(result.queryByText(todayWardrobeItems[0].name!)).not.toBeOnTheScreen();
    expect(result.queryByTestId('today-stretchy-header')).not.toBeOnTheScreen();
    expect(result.queryByTestId('today-settings-button')).not.toBeOnTheScreen();
    expect(result.queryByTestId('today-refresh-button')).not.toBeOnTheScreen();
    expect(result.getByTestId('today-screen').props.contentInsetAdjustmentBehavior).toBe('automatic');
    const screenStyle = StyleSheet.flatten(result.getByTestId('today-screen').props.contentContainerStyle);
    expect(screenStyle.paddingTop).toBe(0);
    // iOS leaves the bottom safe area and the tab bar to the automatic content inset.
    expect(screenStyle.paddingBottom).toBe(spacing.md);
  });

  test('shows AI provenance beside freshness only when AI contributed', async () => {
    const result = await render(providers(
      <TodayScreen language={language} onOpenOutfitDetail={jest.fn()}
        onRefresh={jest.fn()} state={aiAssistedTodayScreenState} />,
      lightTheme, language,
    ));
    const provenance = within(result.getByTestId('today-provenance'));
    expect(provenance.getByTestId('today-generation-mode')).toHaveTextContent(messages[language].today.generationModeAiAssisted);
    expect(provenance.getByTestId('today-freshness')).toHaveTextContent(loadedPresentation(language).header.freshness);
    expect(result.getByTestId('today-provenance-sparkle', { includeHiddenElements: true })).toBeOnTheScreen();
  });
});

test.each([1.5, 1.6, 3])('font scale %s keeps weather clear of garments and stacks alternates above 1.5', async (fontScale) => {
  Dimensions.set({ window: { ...originalDimensions, width: 390, fontScale } });
  const result = await render(providers(
    <TodayScreen language="en" onOpenOutfitDetail={jest.fn()} onRefresh={jest.fn()} state={todayScreenState} />,
  ));
  const hidden = { includeHiddenElements: true };
  const stage = result.getByTestId('today-stage', hidden);
  const stacked = fontScale > 1.5;
  expect(within(stage).queryByTestId('today-sky', hidden) !== null).toBe(!stacked);
  expect(result.getByTestId('today-sky', hidden)).toBeOnTheScreen();
  expect(StyleSheet.flatten(result.getByTestId('today-outfit-list').props.style).flexDirection)
    .toBe(stacked ? 'column' : 'row');
  if (stacked) {
    expect(StyleSheet.flatten(result.getByTestId('today-outfit-list').props.style).gap).toBe(spacing.md);
  }
});

test('outfit detail renders the detail board, in-place captions, requirement rows, ownership states, and weather recap', async () => {
  const presentation = loadedPresentation();
  const ownershipByGarmentType: Record<string, 'owned' | 'wanted'> = {
    jumpsuit: 'owned' as const,
    rain_jacket: 'wanted' as const,
    weather_boots: 'owned' as const,
  };
  const result = await render(providers(
    <OutfitDetailScreen
      backLabel={messages.en.common.back}
      language="en"
      onBack={() => undefined}
      onSetOwnership={() => undefined}
      ownershipByGarmentType={ownershipByGarmentType}
      state={todayScreenState}
      suggestionId="outfit-1"
    />,
  ));
  await fireEvent(result.getByTestId('outfit-detail-content'), 'layout', {
    nativeEvent: { layout: { width: 358, height: 1000, x: 0, y: 0 } },
  });

  const reasonsHeading = result.getByRole('header', { name: messages.en.today.reasonsHeading });
  expect(StyleSheet.flatten(reasonsHeading.props.style)).toMatchObject({
    color: lightTheme.colors.textPrimary,
    fontSize: typography.bodyStrong.fontSize,
    fontWeight: typography.bodyStrong.fontWeight,
  });
  expect(result.getByRole('header', { name: presentation.suggestions[0].title }))
    .toBeOnTheScreen();
  const hidden = { includeHiddenElements: true };
  expect(isHiddenFromAccessibility(result.getByTestId('outfit-detail-board', hidden))).toBe(true);
  expect(result.getByTestId('outfit-detail-board', hidden)).toHaveProp('width', 358);
  const plate = result.getByTestId('outfit-detail-board-plate');
  const plateHeightBeforeCaptionMeasure = StyleSheet.flatten(plate.props.style).height;
  const firstCaption = result.getByTestId('outfit-detail-caption-jumpsuit');
  const firstCaptionTop = StyleSheet.flatten(firstCaption.props.style).top;
  await fireEvent(firstCaption, 'layout', {
    nativeEvent: { layout: { width: 120, height: 200, x: 0, y: 0 } },
  });
  expect(StyleSheet.flatten(result.getByTestId('outfit-detail-board-plate').props.style).height)
    .toBeGreaterThanOrEqual(firstCaptionTop + 200);
  expect(plateHeightBeforeCaptionMeasure).toBeGreaterThan(
    result.getByTestId('outfit-detail-board', hidden).props.height,
  );
  for (const row of presentation.suggestions[0].requirementRows) {
    expect(result.getByText(row.text)).toBeOnTheScreen();
  }
  for (const { garmentTypeId, item, slot } of presentation.suggestions[0].pieces) {
    const caption = result.getByTestId(`outfit-detail-caption-${garmentTypeId}`);
    expect(within(caption).getByText(slot)).toBeOnTheScreen();
    expect(within(caption).getByText(item)).toBeOnTheScreen();
    const state = ownershipByGarmentType[garmentTypeId];
    const stateLabel = state === 'owned'
      ? messages.en.today.ownershipOwnedLabel
      : messages.en.today.ownershipWantedLabel;
    expect(caption).toHaveProp(
      'accessibilityLabel',
      `${item}, ${slot}, ${stateLabel}`,
    );
    expect(result.getByTestId(
      `outfit-detail-ownership-marker-${garmentTypeId}`,
      hidden,
    )).toBeOnTheScreen();
    expect(within(caption).getByText(stateLabel)).toBeOnTheScreen();
  }
  expect(result.getByTestId('outfit-detail-ownership-summary')).toHaveTextContent(
    messages.en.today.ownershipSummary({ owned: 2, total: presentation.suggestions[0].pieces.length }),
  );
  const weatherRecap = within(result.getByTestId('outfit-detail-weather-recap'));
  expect(weatherRecap.getByText('20°')).toBeOnTheScreen();
  expect(weatherRecap.getByText('Rain')).toBeOnTheScreen();
  expect(weatherRecap.getByText('65% chance of rain')).toBeOnTheScreen();
  expect(StyleSheet.flatten(result.getByTestId('outfit-detail-weather-recap').props.style))
    .toMatchObject({ backgroundColor: lightTheme.colors.stage });
});

describe.each(['en', 'tr'] as const)('%s outfit detail untracked garments', (language) => {
  test('speaks the untracked state but draws no marker or word', async () => {
    const presentation = loadedPresentation(language);
    const result = await render(providers(
      <OutfitDetailScreen
        backLabel={messages[language].common.back}
        language={language}
        onBack={() => undefined}
        onSetOwnership={() => undefined}
        ownershipByGarmentType={{}}
        state={todayScreenState}
        suggestionId="outfit-1"
      />,
      lightTheme,
      language,
    ));

    const copy = messages[language].today;
    for (const { garmentTypeId, item, slot } of presentation.suggestions[0].pieces) {
      const caption = result.getByTestId(`outfit-detail-caption-${garmentTypeId}`);
      expect(caption).toHaveProp('accessibilityLabel', `${item}, ${slot}, ${copy.ownershipUntrackedLabel}`);
      expect(within(caption).queryByText(copy.ownershipUntrackedLabel)).toBeNull();
      expect(within(caption).queryByText(copy.ownershipOwnedLabel)).toBeNull();
      expect(within(caption).queryByText(copy.ownershipWantedLabel)).toBeNull();
      expect(result.queryByTestId(
        `outfit-detail-ownership-marker-${garmentTypeId}`,
        { includeHiddenElements: true },
      )).toBeNull();
    }
    expect(result.getByTestId('outfit-detail-ownership-summary')).toHaveTextContent(
      copy.ownershipSummary({ owned: 0, total: presentation.suggestions[0].pieces.length }),
    );
  });
});

describe.each(['en', 'tr'] as const)('%s outfit detail ownership', (language) => {
  test('shows matched states, actions, selection semantics, and the owned count', async () => {
    const onSetOwnership = jest.fn();
    const presentation = loadedPresentation(language);
    const ownershipByGarmentType = Object.fromEntries(
      presentation.suggestions[0].pieces.map(({ garmentTypeId }) => [
        garmentTypeId,
        resolveGarmentOwnership(garmentTypeId, todayWardrobeItems).state,
      ]),
    );
    const result = await render(providers(
      <OutfitDetailScreen
        backLabel={messages[language].common.back}
        language={language}
        onBack={() => undefined}
        onSetOwnership={onSetOwnership}
        ownershipByGarmentType={ownershipByGarmentType}
        state={todayScreenState}
        suggestionId="outfit-1"
      />,
      lightTheme,
      language,
    ));

    const ownedLabel = messages[language].today.ownershipOwnedLabel;
    const wantedLabel = messages[language].today.ownershipWantedLabel;
    expect(result.getByTestId('outfit-detail-caption-jumpsuit')).toHaveProp(
      'accessibilityLabel',
      `${presentation.suggestions[0].pieces[0].item}, ${presentation.suggestions[0].pieces[0].slot}, ${ownedLabel}`,
    );
    expect(result.getByTestId('outfit-detail-caption-rain_jacket')).toHaveProp(
      'accessibilityLabel',
      `${presentation.suggestions[0].pieces[1].item}, ${presentation.suggestions[0].pieces[1].slot}, ${wantedLabel}`,
    );

    expect(
      result.getByTestId('outfit-detail-ownership-weather_boots-owned').props.accessibilityState,
    ).toMatchObject({ selected: false });
    expect(
      result.getByTestId('outfit-detail-ownership-weather_boots-wanted').props.accessibilityState,
    ).toMatchObject({ selected: false });
    expect(result.getByTestId('outfit-detail-ownership-summary')).toHaveTextContent(
      messages[language].today.ownershipSummary({
        owned: 1,
        total: presentation.suggestions[0].pieces.length,
      }),
    );

    const ownedSelected = result.getByTestId('outfit-detail-ownership-jumpsuit-owned');
    const wantedUnselected = result.getByTestId('outfit-detail-ownership-jumpsuit-wanted');
    expect(ownedSelected.props.accessibilityState.selected).toBe(true);
    expect(wantedUnselected.props.accessibilityState.selected).toBe(false);
    await fireEvent.press(ownedSelected);
    expect(onSetOwnership).not.toHaveBeenCalled();
    await fireEvent.press(wantedUnselected);
    expect(onSetOwnership).toHaveBeenCalledWith('jumpsuit', 'wanted');

    onSetOwnership.mockClear();
    const ownedUnselected = result.getByTestId('outfit-detail-ownership-rain_jacket-owned');
    const wantedSelected = result.getByTestId('outfit-detail-ownership-rain_jacket-wanted');
    expect(ownedUnselected.props.accessibilityState.selected).toBe(false);
    expect(wantedSelected.props.accessibilityState.selected).toBe(true);
    await fireEvent.press(wantedSelected);
    expect(onSetOwnership).not.toHaveBeenCalled();
    await fireEvent.press(ownedUnselected);
    expect(onSetOwnership).toHaveBeenCalledWith('rain_jacket', 'owned');
  });
});

test('Today keeps outfit ownership state and actions hidden', async () => {
  const result = await render(providers(
    <WardrobeApplicationContext value={{
      state: {
        status: 'ready',
        items: todayWardrobeItems,
        isRefreshing: false,
        isMutating: false,
        hasRefreshError: false,
      },
      refresh: async () => undefined,
      getItem: async () => null,
      preparePhoto: async () => null,
      discardStagedPhoto: async () => undefined,
      resolvePhotoUri: () => null,
      createItem: jest.fn(),
      updateItem: jest.fn(),
      softDeleteItem: jest.fn(),
    }}>
      <TodayScreen
        language="en"
        onOpenOutfitDetail={() => undefined}

        onRefresh={() => undefined}
        state={todayScreenState}
      />
    </WardrobeApplicationContext>,
  ));

  expect(result.queryByRole('button', {
    name: messages.en.today.ownershipOwnedAction,
  })).not.toBeOnTheScreen();
  expect(result.queryByRole('button', {
    name: messages.en.today.ownershipWantedAction,
  })).not.toBeOnTheScreen();
  expect(result.queryAllByTestId(/^outfit-detail-ownership-/)).toHaveLength(0);
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

      onRefresh={() => undefined}
      state={state}
    />,
  ));

  expect(result.getByText('Istanbul')).toBeOnTheScreen();
  expect(result.getByTestId('today-header-temperature', { includeHiddenElements: true })).toBeOnTheScreen();
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

      onRefresh={() => undefined}
      state={{ kind: 'loading' }}
    />,
  ));

  expect(result.getByTestId('today-loading-screen')).toBeOnTheScreen();
  expect(result.queryByTestId('today-stretchy-header')).not.toBeOnTheScreen();
});

test('Today explains a missing active location and opens the existing location picker', async () => {
  mockPush.mockClear();
  const result = await render(providers(
    <TodayScreen
      language="en"
      onOpenOutfitDetail={() => undefined}

      onRefresh={() => undefined}
      state={{ kind: 'unavailable' }}
    />,
    lightTheme,
    'en',
    null,
  ));

  expect(result.getByTestId('today-no-location')).toBeOnTheScreen();
  expect(result.getByText(messages.en.today.noLocationTitle)).toBeOnTheScreen();
  expect(result.getByText(messages.en.today.noLocationBody)).toBeOnTheScreen();
  await fireEvent.press(result.getByRole('button', {
    name: messages.en.today.chooseLocationAction,
  }));
  expect(mockPush).toHaveBeenCalledWith('/weather/location');
});

test('Today keeps the generic unavailable copy for failures with an active location', async () => {
  const result = await render(providers(
    <TodayScreen
      language="en"
      onOpenOutfitDetail={() => undefined}

      onRefresh={() => undefined}
      state={{ kind: 'unavailable' }}
    />,
  ));

  expect(result.getByTestId('today-unavailable-screen')).toBeOnTheScreen();
  expect(result.getByText(messages.en.today.unavailableTitle)).toBeOnTheScreen();
  expect(result.getByText(messages.en.today.unavailableBody)).toBeOnTheScreen();
  expect(result.queryByTestId('today-no-location')).not.toBeOnTheScreen();
});

// The end-to-end flows assert that onboarding lands on Today, so the container id
// has to survive every branch. It previously existed only on the populated path,
// and a fresh install with no location selected renders the unavailable one.
test('every Today state carries the stable today-screen container id', async () => {
  for (const state of [
    { kind: 'loading' },
    { kind: 'unavailable' },
  ] as const) {
    const result = await render(providers(
      <TodayScreen
        language="en"
        onOpenOutfitDetail={() => undefined}

        onRefresh={() => undefined}
        state={state}
      />,
    ));

    expect(result.getByTestId('today-screen')).toBeOnTheScreen();
    expect(result.getByTestId(`today-${state.kind}-screen`)).toBeOnTheScreen();
  }
});

describe.each(['en', 'tr'] as const)('%s Today section headings', (language: SupportedLanguage) => {
  test('uses localized sentence-case bodyStrong headers', async () => {
    const result = await render(providers(
      <TodayScreen
        language={language}
        onOpenOutfitDetail={() => undefined}

        onRefresh={() => undefined}
        state={todayScreenState}
      />,
      lightTheme,
      language,
    ));

    // The mockup's Today has one section heading, over the alternates; the primary
    // outfit is introduced by the stage itself, not by a "Recommended today" header.
    for (const heading of [messages[language].today.otherOptionsHeading]) {
      const element = result.getByRole('header', { name: heading });
      expect(StyleSheet.flatten(element.props.style)).toMatchObject({
        color: lightTheme.colors.textSecondary,
        fontSize: typography.bodyStrong.fontSize,
        fontWeight: typography.bodyStrong.fontWeight,
      });
    }
  });
});

test('pull-to-refresh invokes refresh with haptic feedback and preserves Screen inset ownership', async () => {
  const onRefresh = jest.fn();
  const impact = jest.spyOn(haptics, 'impactLight').mockImplementation(() => undefined);
  const result = await render(providers(
    <TodayScreen language="en" onOpenOutfitDetail={jest.fn()} onRefresh={onRefresh} state={todayScreenState} />,
  ));
  const refreshControl = result.getByTestId('today-screen').props.refreshControl;
  expect(refreshControl.props.refreshing).toBe(false);
  expect(refreshControl.props.progressViewOffset).toBeUndefined();
  refreshControl.props.onRefresh();
  expect(onRefresh).toHaveBeenCalledTimes(1);
  expect(impact).toHaveBeenCalledTimes(1);
  impact.mockRestore();
});

test('refreshing, failure and staleness announce freshness while retaining the last valid outfit', async () => {
  const onOpenOutfitDetail = jest.fn();
  const screen = (isRefreshing: boolean, refreshFailed: boolean, stale = false) => providers(
    <TodayScreen language="en" onOpenOutfitDetail={onOpenOutfitDetail} onRefresh={jest.fn()}
      state={{ ...todayScreenState, isRefreshing, refreshFailed,
        snapshot: { ...todayScreenState.snapshot, freshness: stale ? 'stale' : 'fresh' } }} />,
  );
  const result = await render(screen(true, false));
  expect(result.getByTestId('today-freshness')).toHaveTextContent('Refreshing weather…');
  expect(result.getByTestId('today-freshness')).toHaveProp('accessibilityLiveRegion', 'polite');
  expect(result.getByTestId('today-screen').props.refreshControl.props.refreshing).toBe(true);
  await result.rerender(screen(false, true));
  expect(result.getByTestId('today-freshness')).toHaveTextContent(/Couldn't refresh/);
  expect(result.getByTestId('today-freshness')).toHaveProp('accessibilityLiveRegion', 'polite');
  expect(result.getByTestId('today-archetype')).toHaveTextContent('Rain Ready');
  await fireEvent.press(result.getByTestId('today-archetype'));
  expect(onOpenOutfitDetail).toHaveBeenCalledWith('outfit-1');
  await result.rerender(screen(false, false, true));
  expect(result.getByTestId('today-freshness')).toHaveProp('accessibilityLiveRegion', 'polite');
  await result.rerender(screen(false, false));
  expect(result.getByTestId('today-freshness')).toHaveProp('accessibilityLiveRegion', 'none');
});
