import { act, fireEvent, isHiddenFromAccessibility, render, within } from '@testing-library/react-native';
import { AppState, Dimensions, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { failureCategories } from '@/domain/failure-category';
import {
  aiAssistedTodayScreenState,
  todayOutfitId,
  todayScreenState,
  todayWardrobeItems,
} from '@/features/today/__tests__/fixtures';
import { unavailableTodayState } from '@/features/today/model';
import { OutfitDetailScreen } from '@/features/today/presentation/outfit-detail-screen';
import {
  createDetailCaptionLayout,
  createTodayPresentation,
} from '@/features/today/presentation/today-presentation';
import { PLACEHOLDER_REST } from '@/features/today/presentation/garment-board-skeleton';
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
import {
  createKuyaraTheme,
  darkTheme,
  lightTheme,
  spacing,
  typography,
  type KuyaraTheme,
} from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';
import { layoutGarmentBoard, measureGarmentBoardHeight } from '@/components/ui';
import { AMBIENT_PULSE_FLOOR } from '@/components/ui/use-ambient-pulse';
import { haptics } from '@/components/ui/haptics';

jest.mock('expo-symbols', () => ({
  SymbolView: () => null,
}));
jest.mock('@/components/ui/native-menu', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const {
    Pressable,
    Text,
    View,
  } = jest.requireActual('react-native') as typeof import('react-native');

  return {
    NativeMenu: ({
      accessibilityHint,
      accessibilityLabel,
      children,
      height,
      hitSlop,
      items,
      onSelect,
      testID,
      width,
    }: Readonly<{
      accessibilityHint?: string;
      accessibilityLabel: string;
      children: React.ReactNode;
      height: number;
      hitSlop?: number;
      items: readonly Readonly<{ id: string; label: string; selected?: boolean }>[];
      onSelect: (id: string) => void;
      testID?: string;
      width: number;
    }>) => {
      const [open, setOpen] = React.useState(false);
      return (
        <View style={{ height, width }}>
          <Pressable
            accessible
            accessibilityHint={accessibilityHint}
            accessibilityLabel={accessibilityLabel}
            accessibilityRole="button"
            hitSlop={hitSlop}
            onPress={() => setOpen(true)}
            style={{ height, width }}
            testID={testID}>
            {children}
          </Pressable>
          {open ? items.map((item) => (
            <Pressable
              accessibilityRole="button"
              key={item.id}
              onPress={() => {
                setOpen(false);
                if (!item.selected) onSelect(item.id);
              }}>
              <Text>{item.label}</Text>
            </Pressable>
          )) : null}
        </View>
      );
    },
  };
});
const mockPush = jest.fn();
jest.mock('expo-router', () => {
  const React = jest.requireActual('react') as typeof import('react');
  return {
    useFocusEffect: (callback: () => void | (() => void)) => React.useEffect(callback, [callback]),
    useRouter: () => ({ push: mockPush }),
  };
});

const originalDimensions = Dimensions.get('window');
const fixtureNow = Date.parse('2026-08-13T06:30:00.000Z');
let dateNowSpy: jest.SpiedFunction<typeof Date.now>;
beforeEach(() => {
  dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(fixtureNow);
  Dimensions.set({ window: { ...originalDimensions, width: 390, fontScale: 1 } });
});
afterEach(() => {
  dateNowSpy.mockRestore();
  Dimensions.set({ window: originalDimensions });
});

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
    revalidateFreshness: jest.fn(async () => undefined),
  } satisfies WeatherApplicationValue;
  return (
    <LocalizationContext value={{ language, messages: messages[language], hour12: false }}>
      <KuyaraThemeContext.Provider value={theme}>
        <SafeAreaProvider initialMetrics={initialMetrics}>
          <WeatherApplicationContext value={weather}>{children}</WeatherApplicationContext>
        </SafeAreaProvider>
      </KuyaraThemeContext.Provider>
    </LocalizationContext>
  );
}

function loadedPresentation(language: 'en' | 'tr' = 'en') {
  const presentation = createTodayPresentation(todayScreenState, language, false, fixtureNow);
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
    const stageColor = theme.atmosphere[presentation.atmosphere];
    expect(StyleSheet.flatten(result.getByTestId('today-stage', hidden).props.style))
      .toMatchObject({ backgroundColor: stageColor, borderRadius: 26, width: 358 });
    expect(result.getByTestId('today-primary-board', hidden)).toBeOnTheScreen();
    expect(result.getByTestId('today-archetype', hidden)).toHaveTextContent(primary.title);
    expect(StyleSheet.flatten(result.getByTestId('today-archetype', hidden).props.style))
      .toMatchObject(typography.title);
    expect(result.getByTestId('today-rationale')).toHaveTextContent(primary.reasons[0]);
    for (const reason of primary.reasons.slice(1)) {
      expect(result.queryByText(reason)).not.toBeOnTheScreen();
    }
    expect(within(result.getByTestId('today-provenance')).getByTestId('today-freshness'))
      .toHaveTextContent(presentation.header.freshness);
    // ADR 0034 section 4: the deterministic badge carries words with no AI mark.
    expect(result.getByTestId('today-generation-mode'))
      .toHaveTextContent(messages[language].today.generationModeStandard);
    expect(result.queryByTestId('today-provenance-sparkle', { includeHiddenElements: true }))
      .not.toBeOnTheScreen();
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
      .toMatchObject({ ...typography.caption, color: theme.colors.textPrimary });
    expect(StyleSheet.flatten(result.getByTestId('today-condition', hidden).props.style))
      .not.toHaveProperty('opacity');
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
    expect(onOpenOutfitDetail.mock.calls).toEqual([[todayOutfitId(1)], [todayOutfitId(1)]]);
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
      ).toMatchObject({ backgroundColor: stageColor, height: tallestStage, justifyContent: 'center' });
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

test.each([
  ['day', Date.parse('2026-08-13T12:00:00.000Z'), 'fallingDay'],
  ['night', Date.parse('2026-08-13T19:00:00.000Z'), 'fallingNight'],
] as const)('%s weather applies its atmosphere color to every Today stage', async (_, now, atmosphere) => {
  dateNowSpy.mockReturnValue(now);
  const result = await render(providers(
    <TodayScreen language="en" onOpenOutfitDetail={jest.fn()} onRefresh={jest.fn()} state={todayScreenState} />,
  ));
  await fireEvent(result.getByTestId('today-content'), 'layout', {
    nativeEvent: { layout: { width: 358, height: 1000, x: 0, y: 0 } },
  });

  const hidden = { includeHiddenElements: true };
  const stageColor = lightTheme.atmosphere[atmosphere];
  expect(StyleSheet.flatten(result.getByTestId('today-stage', hidden).props.style))
    .toMatchObject({ backgroundColor: stageColor });
  for (const suggestion of loadedPresentation().suggestions.slice(1)) {
    expect(StyleSheet.flatten(
      result.getByTestId(`today-alternate-stage-${suggestion.id}`, hidden).props.style,
    )).toMatchObject({ backgroundColor: stageColor });
  }
});

test('Today re-reads its clock when the app becomes active', async () => {
  const addEventListener = jest.spyOn(AppState, 'addEventListener')
    .mockReturnValue({ remove: () => undefined });
  dateNowSpy.mockReturnValue(Date.parse('2026-08-13T12:00:00.000Z'));
  const result = await render(providers(
    <TodayScreen language="en" onOpenOutfitDetail={jest.fn()} onRefresh={jest.fn()} state={todayScreenState} />,
  ));
  const hidden = { includeHiddenElements: true };
  expect(StyleSheet.flatten(result.getByTestId('today-stage', hidden).props.style))
    .toMatchObject({ backgroundColor: lightTheme.atmosphere.fallingDay });

  dateNowSpy.mockReturnValue(Date.parse('2026-08-13T21:00:00.000Z'));
  await act(async () => {
    addEventListener.mock.calls.forEach(([, listener]) => listener('active'));
  });

  expect(StyleSheet.flatten(result.getByTestId('today-stage', hidden).props.style))
    .toMatchObject({ backgroundColor: lightTheme.atmosphere.fallingNight });
  addEventListener.mockRestore();
});

test('accessibility XXXL keeps the complete generation mode and freshness status', async () => {
  Dimensions.set({ window: { ...originalDimensions, width: 390, fontScale: 3.1 } });
  const presentation = createTodayPresentation(
    aiAssistedTodayScreenState,
    'en',
    false,
    fixtureNow,
  );
  if (presentation.kind !== 'loaded' || !presentation.generationMode) {
    throw new Error('Expected AI-assisted Today presentation.');
  }
  const result = await render(providers(
    <TodayScreen
      language="en"
      onOpenOutfitDetail={jest.fn()}
      onRefresh={jest.fn()}
      state={aiAssistedTodayScreenState}
    />,
  ));

  const generationMode = result.getByTestId('today-generation-mode');
  const freshness = result.getByTestId('today-freshness');
  expect(generationMode).toHaveTextContent(presentation.generationMode.label);
  expect(freshness).toHaveTextContent(presentation.header.freshness);
  expect(generationMode.props.numberOfLines).toBeUndefined();
  expect(freshness.props.numberOfLines).toBeUndefined();
  expect(StyleSheet.flatten(freshness.props.style)).toMatchObject({ width: '100%' });
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
      suggestionId={todayOutfitId(1)}
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
  expect(StyleSheet.flatten(result.getByTestId('outfit-detail-board', hidden).props.style))
    .toMatchObject({ width: 358 });
  const plate = result.getByTestId('outfit-detail-board-plate');
  const plateHeightBeforeCaptionMeasure = StyleSheet.flatten(plate.props.style).height;
  const firstBox = layoutGarmentBoard(
    presentation.suggestions[0].boardPieces, 358, 'detail',
  ).boxes.find(({ garmentTypeId }) => garmentTypeId === 'jumpsuit');
  expect(firstBox).toBeDefined();
  const firstCaptionTop = createDetailCaptionLayout(firstBox!, 358).top;
  await fireEvent(result.getByTestId('outfit-detail-caption-content-jumpsuit'), 'layout', {
    nativeEvent: { layout: { width: 120, height: 200, x: 0, y: 0 } },
  });
  expect(StyleSheet.flatten(result.getByTestId('outfit-detail-board-plate').props.style).height)
    .toBeGreaterThanOrEqual(firstCaptionTop + 200);
  expect(plateHeightBeforeCaptionMeasure).toBeGreaterThan(
    StyleSheet.flatten(result.getByTestId('outfit-detail-board', hidden).props.style).height,
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
    .toMatchObject({ backgroundColor: lightTheme.atmosphere[presentation.atmosphere] });
  expect(StyleSheet.flatten(weatherRecap.getByText('Rain').props.style))
    .toMatchObject({ color: lightTheme.colors.textPrimary });
  expect(StyleSheet.flatten(weatherRecap.getByText('65% chance of rain').props.style))
    .toMatchObject({ color: lightTheme.colors.textPrimary });
});

test('outfit detail keeps captions visible and labelled after its board entrance settles', async () => {
  const presentation = loadedPresentation();
  const result = await render(providers(
    <OutfitDetailScreen
      backLabel={messages.en.common.back}
      language="en"
      onBack={() => undefined}
      onSetOwnership={() => undefined}
      ownershipByGarmentType={{}}
      state={todayScreenState}
      suggestionId={todayOutfitId(1)}
    />,
  ));
  await fireEvent(result.getByTestId('outfit-detail-content'), 'layout', {
    nativeEvent: { layout: { width: 358, height: 1000, x: 0, y: 0 } },
  });

  expect(StyleSheet.flatten(result.getByTestId('outfit-detail-caption-overlay').props.style))
    .toMatchObject({ opacity: 1 });
  for (const { garmentTypeId, item, slot } of presentation.suggestions[0].pieces) {
    const caption = result.getByTestId(`outfit-detail-caption-${garmentTypeId}`);
    expect(caption).toBeOnTheScreen();
    expect(caption).toHaveProp(
      'accessibilityLabel',
      `${item}, ${slot}, ${messages.en.today.ownershipUntrackedLabel}`,
    );
  }
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
        suggestionId={todayOutfitId(1)}
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
  test('shows matched states and changes them from each caption menu', async () => {
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
        suggestionId={todayOutfitId(1)}
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
    for (const { garmentTypeId } of presentation.suggestions[0].pieces) {
      const caption = result.getByTestId(`outfit-detail-caption-${garmentTypeId}`);
      expect(caption.props.accessibilityState.selected).toBeUndefined();
      expect(caption).toHaveProp('accessibilityHint', messages[language].today.ownershipChangeHint);
      expect(caption).toHaveProp('accessibilityRole', 'button');
    }
    expect(result.getByTestId('outfit-detail-ownership-summary')).toHaveTextContent(
      messages[language].today.ownershipSummary({
        owned: 1,
        total: presentation.suggestions[0].pieces.length,
      }),
    );

    const jumpsuitCaption = result.getByTestId('outfit-detail-caption-jumpsuit');
    await fireEvent.press(jumpsuitCaption);
    await fireEvent.press(result.getByRole('button', { name: messages[language].today.ownershipOwnedAction }));
    expect(onSetOwnership).not.toHaveBeenCalled();
    await fireEvent.press(jumpsuitCaption);
    await fireEvent.press(result.getByRole('button', { name: messages[language].today.ownershipWantedAction }));
    expect(onSetOwnership).toHaveBeenCalledWith('jumpsuit', 'wanted');

    onSetOwnership.mockClear();
    const rainJacketCaption = result.getByTestId('outfit-detail-caption-rain_jacket');
    await fireEvent.press(rainJacketCaption);
    await fireEvent.press(result.getByRole('button', { name: messages[language].today.ownershipWantedAction }));
    expect(onSetOwnership).not.toHaveBeenCalled();
    await fireEvent.press(rainJacketCaption);
    await fireEvent.press(result.getByRole('button', { name: messages[language].today.ownershipOwnedAction }));
    expect(onSetOwnership).toHaveBeenCalledWith('rain_jacket', 'owned');
  });
});

test('the hero board rises into a stage that stays still', async () => {
  const result = await render(providers(
    <TodayScreen language="en" onOpenOutfitDetail={jest.fn()} onRefresh={jest.fn()} state={todayScreenState} />,
  ));
  await fireEvent(result.getByTestId('today-content'), 'layout', {
    nativeEvent: { layout: { width: 358, height: 1000, x: 0, y: 0 } },
  });
  const hidden = { includeHiddenElements: true };

  // Law 7: the garment pieces arrive; the stage plate they land on and the weather
  // values drawn over it never move.
  expect(StyleSheet.flatten(result.getByTestId('today-primary-board', hidden).parent!.props.style))
    .toMatchObject({ opacity: 0, transform: [{ translateY: spacing.xl }] });
  expect(StyleSheet.flatten(result.getByTestId('today-stage', hidden).props.style))
    .not.toHaveProperty('transform');
  expect(StyleSheet.flatten(result.getByTestId('today-sky', hidden).props.style))
    .not.toHaveProperty('transform');
});

test('the press that completes the outfit fires success once instead of the selection haptic', async () => {
  const selection = jest.spyOn(haptics, 'selection').mockImplementation(() => undefined);
  const success = jest.spyOn(haptics, 'success').mockImplementation(() => undefined);
  const { pieces } = loadedPresentation().suggestions[0];
  const lastPiece = pieces[pieces.length - 1];
  const detail = (ownershipByGarmentType: Readonly<Record<string, 'owned' | 'wanted'>>) => providers(
    <OutfitDetailScreen
      backLabel={messages.en.common.back}
      language="en"
      onBack={() => undefined}
      onSetOwnership={() => undefined}
      ownershipByGarmentType={ownershipByGarmentType}
      state={todayScreenState}
      suggestionId={todayOutfitId(1)}
    />,
  );
  const markOwned = async (result: Awaited<ReturnType<typeof render>>, garmentTypeId: string) => {
    await fireEvent.press(result.getByTestId(`outfit-detail-caption-${garmentTypeId}`));
    await fireEvent.press(result.getByRole('button', { name: messages.en.today.ownershipOwnedAction }));
  };

  // Every piece but the last one is already owned, so this press completes the outfit.
  const result = await render(detail(Object.fromEntries(
    pieces.slice(0, -1).map(({ garmentTypeId }) => [garmentTypeId, 'owned' as const]),
  )));
  await markOwned(result, lastPiece.garmentTypeId);
  expect(success).toHaveBeenCalledTimes(1);
  expect(selection).not.toHaveBeenCalled();

  // Any other ownership change stays a selection under the finger.
  success.mockClear();
  const partial = await render(detail({}));
  await markOwned(partial, lastPiece.garmentTypeId);
  expect(selection).toHaveBeenCalledTimes(1);
  expect(success).not.toHaveBeenCalled();

  selection.mockRestore();
  success.mockRestore();
});

test('Today keeps outfit ownership state and actions hidden', async () => {
  const result = await render(providers(
    <WardrobeApplicationContext value={{
      state: {
        status: 'ready',
        items: todayWardrobeItems,
        isRefreshing: false,
        isMutating: false,
        refreshFailure: null,
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

describe.each(['en', 'tr'] as const)('%s first generation', (language: SupportedLanguage) => {
  test('waits on a skeleton garment board whose status line, not its motion, is the state', async () => {
    const result = await render(providers(
      <TodayScreen
        language={language}
        onOpenOutfitDetail={() => undefined}
        onRefresh={() => undefined}
        state={{ kind: 'loading' }}
      />,
      lightTheme,
      language,
    ));
    await fireEvent(result.getByTestId('today-loading-screen'), 'layout', {
      nativeEvent: { layout: { width: 358, height: 1000, x: 0, y: 0 } },
    });
    const hidden = { includeHiddenElements: true };

    expect(result.getByTestId('today-loading-screen')).toBeOnTheScreen();
    expect(result.queryByTestId('today-stretchy-header')).not.toBeOnTheScreen();
    expect(StyleSheet.flatten(result.getByTestId('today-skeleton-stage', hidden).props.style))
      .toMatchObject({ backgroundColor: lightTheme.colors.stage, borderRadius: 26 });

    // The placeholders stand in for a hero that does not exist yet, so assistive
    // technology is given the status line alone.
    const board = result.getByTestId('today-skeleton-board', hidden);
    const boardStyle = StyleSheet.flatten(board.props.style);
    expect(boardStyle).toMatchObject({ width: 358 });
    expect(boardStyle.height).toBeGreaterThan(0);
    expect(isHiddenFromAccessibility(board)).toBe(true);
    const status = result.getByTestId('today-generating-status');
    expect(status).toHaveTextContent(messages[language].today.generatingStatus);
    expect(status.props.accessibilityLiveRegion).toBe('polite');
    expect(messages[language].today.generatingStatus).not.toContain('!');
  });

  test('says the wait is taking longer once it passes the threshold, and only then', async () => {
    jest.useFakeTimers();
    try {
      const result = await render(providers(
        <TodayScreen
          language={language}
          onOpenOutfitDetail={() => undefined}
          onRefresh={() => undefined}
          state={{ kind: 'loading' }}
        />,
        lightTheme,
        language,
      ));
      const copy = messages[language].today;

      await act(async () => { jest.advanceTimersByTime(7_000); });
      expect(result.getByTestId('today-generating-status')).toHaveTextContent(copy.generatingStatus);

      await act(async () => { jest.advanceTimersByTime(2_000); });
      const status = result.getByTestId('today-generating-status');
      expect(status).toHaveTextContent(copy.generatingLongWaitStatus);
      expect(copy.generatingLongWaitStatus.startsWith(copy.generatingStatus)).toBe(true);
      expect(copy.generatingLongWaitStatus).not.toContain('!');
    } finally {
      jest.useRealTimers();
    }
  });
});

test('the skeleton placeholders breathe on the ambient calm step and hold still under Reduce Motion', async () => {
  const hidden = { includeHiddenElements: true };
  const skeletonOpacity = async (theme: KuyaraTheme) => {
    const result = await render(providers(
      <TodayScreen
        language="en"
        onOpenOutfitDetail={() => undefined}
        onRefresh={() => undefined}
        state={{ kind: 'loading' }}
      />,
      theme,
    ));
    return StyleSheet.flatten(result.getByTestId('today-skeleton-board', hidden).props.style).opacity;
  };

  const breathing = await skeletonOpacity(lightTheme);
  const still = await skeletonOpacity(createKuyaraTheme('light', true));

  expect(lightTheme.motion.ambient.calm).toBeGreaterThan(0);
  expect(createKuyaraTheme('light', true).motion.ambient.calm).toBe(0);
  // Reduce Motion keeps the placeholders at one reduced opacity instead of animating.
  expect(still).toBeCloseTo(PLACEHOLDER_REST);
  expect(breathing).toBeCloseTo(AMBIENT_PULSE_FLOOR * PLACEHOLDER_REST);
});

test('accessibility XXXL keeps the whole generating status line and the skeleton board', async () => {
  Dimensions.set({ window: { ...originalDimensions, width: 390, fontScale: 3.1 } });
  const result = await render(providers(
    <TodayScreen
      language="en"
      onOpenOutfitDetail={() => undefined}
      onRefresh={() => undefined}
      state={{ kind: 'loading' }}
    />,
  ));
  await fireEvent(result.getByTestId('today-loading-screen'), 'layout', {
    nativeEvent: { layout: { width: 358, height: 1000, x: 0, y: 0 } },
  });

  const status = result.getByTestId('today-generating-status');
  expect(status).toHaveTextContent(messages.en.today.generatingStatus);
  expect(status.props.numberOfLines).toBeUndefined();
  // The board is drawn, not typeset, so the largest text size never shrinks or clips it.
  const board = StyleSheet.flatten(
    result.getByTestId('today-skeleton-board', { includeHiddenElements: true }).props.style,
  );
  expect(board).toMatchObject({ width: 358 });
  expect(board.height).toBeGreaterThan(0);
  expect(StyleSheet.flatten(status.props.style)).toMatchObject({ marginTop: spacing.md });
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

// The route composes the cause into the state for the analytics classification only.
// Today must render the same screen and the same copy whichever cause it carries.
test('a classified unavailable state renders exactly the same screen as an unclassified one', async () => {
  for (const failure of failureCategories) {
    const result = await render(providers(
      <TodayScreen
        language="en"
        onOpenOutfitDetail={() => undefined}

        onRefresh={() => undefined}
        state={{ kind: 'unavailable', failure }}
      />,
    ));

    expect(result.getByTestId('today-unavailable-screen')).toBeOnTheScreen();
    expect(result.getByText(messages.en.today.unavailableTitle)).toBeOnTheScreen();
    expect(result.getByText(messages.en.today.unavailableBody)).toBeOnTheScreen();
    expect(result.queryByTestId('today-no-location')).not.toBeOnTheScreen();
  }
});

test('the route composition omits the cause when there is none to report', () => {
  expect(unavailableTodayState(null)).toEqual({ kind: 'unavailable' });
  expect(unavailableTodayState('offline')).toEqual({ kind: 'unavailable', failure: 'offline' });
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

test('unavailable Today supports pull retry and the refresh accessibility action', async () => {
  const onRefresh = jest.fn();
  const impact = jest.spyOn(haptics, 'impactLight').mockImplementation(() => undefined);
  const result = await render(providers(
    <TodayScreen
      isRefreshing
      language="en"
      onOpenOutfitDetail={jest.fn()}
      onRefresh={onRefresh}
      state={{ kind: 'unavailable', failure: 'offline' }}
    />,
  ));
  const screen = result.getByTestId('today-screen');
  expect(screen.props.refreshControl.props.refreshing).toBe(true);
  screen.props.refreshControl.props.onRefresh();
  expect(onRefresh).toHaveBeenCalledTimes(1);
  expect(impact).toHaveBeenCalledTimes(1);

  await fireEvent(screen, 'accessibilityAction', { nativeEvent: { actionName: 'refresh' } });
  expect(onRefresh).toHaveBeenCalledTimes(2);
  expect(screen.props.accessibilityActions).toEqual([
    { name: 'refresh', label: messages.en.today.refreshAction },
  ]);
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
  expect(result.getByTestId('today-freshness')).toHaveTextContent('Refreshing today’s guidance…');
  expect(result.getByTestId('today-freshness')).toHaveProp('accessibilityLiveRegion', 'polite');
  expect(result.getByTestId('today-screen').props.refreshControl.props.refreshing).toBe(true);
  await result.rerender(screen(false, true));
  expect(result.getByTestId('today-freshness')).toHaveTextContent(/Couldn't refresh/);
  expect(result.getByTestId('today-freshness')).toHaveProp('accessibilityLiveRegion', 'polite');
  expect(result.getByTestId('today-archetype')).toHaveTextContent('Rain Ready');
  await fireEvent.press(result.getByTestId('today-archetype'));
  expect(onOpenOutfitDetail).toHaveBeenCalledWith(todayOutfitId(1));
  await result.rerender(screen(false, false, true));
  expect(result.getByTestId('today-freshness')).toHaveProp('accessibilityLiveRegion', 'polite');
  await result.rerender(screen(false, false));
  expect(result.getByTestId('today-freshness')).toHaveProp('accessibilityLiveRegion', 'none');
});

describe.each(['en', 'tr'] as const)('%s Today refresh action', (language) => {
  // The visible pull gesture cannot be performed by a screen reader.
  test('exposes one localized custom action that refreshes without a visible control', async () => {
    const onRefresh = jest.fn();
    const impact = jest.spyOn(haptics, 'impactLight').mockImplementation(() => undefined);
    const result = await render(providers(
      <TodayScreen language={language} onOpenOutfitDetail={jest.fn()} onRefresh={onRefresh}
        state={todayScreenState} />,
      lightTheme,
      language,
    ));

    const screen = result.getByTestId('today-screen');
    expect(screen.props.accessibilityActions).toEqual([
      { name: 'refresh', label: messages[language].today.refreshAction },
    ]);
    expect(result.queryByText(messages[language].today.refreshAction)).not.toBeOnTheScreen();

    await fireEvent(screen, 'accessibilityAction', { nativeEvent: { actionName: 'refresh' } });
    expect(onRefresh).toHaveBeenCalledTimes(1);
    // The haptic belongs to the pull gesture, not to the assistive-technology action.
    expect(impact).not.toHaveBeenCalled();

    await fireEvent(screen, 'accessibilityAction', { nativeEvent: { actionName: 'magicTap' } });
    expect(onRefresh).toHaveBeenCalledTimes(1);
    impact.mockRestore();
  });
});

// Goal 7 found the in-place captions breaking by character and overlapping the shoe at
// the largest accessibility sizes. Above 1.5 they leave the plate as one list under it.
describe.each(['en', 'tr'] as const)('%s outfit detail captions above 1.5', (language) => {
  const ownershipByGarmentType: Record<string, 'owned' | 'wanted'> = {
    jumpsuit: 'owned',
    rain_jacket: 'wanted',
  };
  const detail = async (fontScale: number) => {
    Dimensions.set({ window: { ...originalDimensions, width: 390, fontScale } });
    const result = await render(providers(
      <OutfitDetailScreen
        backLabel={messages[language].common.back}
        language={language}
        onBack={() => undefined}
        onSetOwnership={() => undefined}
        ownershipByGarmentType={ownershipByGarmentType}
        state={todayScreenState}
        suggestionId={todayOutfitId(1)}
      />,
      lightTheme,
      language,
    ));
    await fireEvent(result.getByTestId('outfit-detail-content'), 'layout', {
      nativeEvent: { layout: { width: 358, height: 1000, x: 0, y: 0 } },
    });
    return result;
  };

  test('moves them under the plate in board order, keeping every label and test id', async () => {
    const pieces = loadedPresentation(language).suggestions[0].pieces;
    const inline = await detail(1);
    const labels = pieces.map(({ garmentTypeId }) => {
      const caption = inline.getByTestId(`outfit-detail-caption-${garmentTypeId}`);
      return caption.props.accessibilityLabel;
    });
    expect(inline.queryByTestId('outfit-detail-caption-list')).toBeNull();

    const board = layoutGarmentBoard(
      loadedPresentation(language).suggestions[0].boardPieces, 358, 'detail',
    );
    const stacked = await detail(3);
    const list = stacked.getByTestId('outfit-detail-caption-list');
    const plate = stacked.getByTestId('outfit-detail-board-plate');
    expect(within(plate).queryAllByTestId(/^outfit-detail-caption-/)).toHaveLength(0);
    // With the captions out of the plate it is exactly the board, not board plus text.
    expect(StyleSheet.flatten(plate.props.style).height).toBe(board.height);

    const boardOrder = board.boxes
      .map(({ garmentTypeId }) => garmentTypeId)
      .filter((id) => pieces.some((piece) => piece.garmentTypeId === id));
    expect(within(list).getAllByRole('button').map((row) => row.props.testID))
      .toEqual(boardOrder.map((id) => `outfit-detail-caption-${id}`));

    for (const [index, { garmentTypeId, item, slot }] of pieces.entries()) {
      const caption = stacked.getByTestId(`outfit-detail-caption-${garmentTypeId}`);
      expect(caption.props.accessibilityLabel).toBe(labels[index]);
      expect(caption.props.accessible).toBe(true);
      expect(caption.props.accessibilityHint).toBe(messages[language].today.ownershipChangeHint);
      expect(within(caption).getByText(item)).toBeOnTheScreen();
      expect(within(caption).getByText(slot)).toBeOnTheScreen();
    }
    expect(stacked.getByTestId(
      'outfit-detail-ownership-marker-jumpsuit', { includeHiddenElements: true },
    )).toBeOnTheScreen();
    expect(StyleSheet.flatten(list.props.style)).toMatchObject({ gap: spacing.md });
  });
});

test.each([
  [1, 'row'],
  [1.5, 'row'],
  [3, 'column'],
])('at font scale %s the detail emphasis pill uses a %s layout and captions stay controls', async (fontScale, direction) => {
  Dimensions.set({ window: { ...originalDimensions, width: 390, fontScale } });
  const result = await render(providers(
    <OutfitDetailScreen
      backLabel={messages.en.common.back}
      language="en"
      onBack={() => undefined}
      onSetOwnership={() => undefined}
      ownershipByGarmentType={{}}
      state={todayScreenState}
      suggestionId={todayOutfitId(1)}
    />,
  ));

  expect(result.getByText(messages.en.today.emphasis.recommended)).toBeOnTheScreen();
  expect(StyleSheet.flatten(result.getByTestId('outfit-detail-heading-group').props.style).flexDirection)
    .toBe(direction);
  expect(result.getByTestId('outfit-detail-caption-jumpsuit')).toHaveProp(
    'accessibilityRole',
    'button',
  );
});
