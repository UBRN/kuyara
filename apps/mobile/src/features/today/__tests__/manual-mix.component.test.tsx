import { act, fireEvent, render, within } from '@testing-library/react-native';
import { AccessibilityInfo, Dimensions, StyleSheet } from 'react-native';
import { State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { layoutGarmentBoard } from '@/components/ui';
import { useManualMix } from '@/features/recommendation/application/use-manual-mix';
import { slotCandidates, swappableSlots } from '@/features/recommendation/domain/manual-mix';
import { todayScreenState } from '@/features/today/__tests__/fixtures';
import { OutfitDetailScreen } from '@/features/today/presentation/outfit-detail-screen';
import { createTodayPresentation } from '@/features/today/presentation/today-presentation';
import { TourTargetRegistry } from '@/features/walkthrough/application/tour-target-registry';
import { TourTargetsContext } from '@/features/walkthrough/application/walkthrough-context';
import { LocalizationContext } from '@/localization/localization-context';
import { messages, type SupportedLanguage } from '@/localization/messages';
import { EasierToSeeContext, easierToSee as easierToSeeValues } from '@/theme/easier-to-see';
import { lightTheme } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

// GlassButton draws the picker's close as a SwiftUI glass button.
jest.mock('@expo/ui/swift-ui', () => jest.requireActual('@/components/ui/__tests__/expo-ui-test-mock'));
jest.mock('@expo/ui/swift-ui/modifiers', () =>
  jest.requireActual('@/components/ui/__tests__/expo-ui-test-mock'));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
// The platform sheet reports its dismissal after a programmatic close, as NativeSheet documents.
jest.mock('@expo/ui/community/bottom-sheet', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  return {
    BottomSheet: ({ children, index, onClose }: { children: React.ReactNode; index: number; onClose?: () => void }) => {
      const open = React.useRef(index >= 0);
      React.useEffect(() => {
        if (open.current && index < 0) onClose?.();
        open.current = index >= 0;
      }, [index, onClose]);
      return index >= 0 ? React.createElement(View, null, children) : null;
    },
  };
});

jest.mock('expo-router', () => {
  const React = jest.requireActual('react') as typeof import('react');
  return {
    useFocusEffect: (callback: () => void | (() => void)) => React.useEffect(() => callback(), [callback]),
  };
});

const fixtureNow = Date.parse('2026-08-13T06:30:00.000Z');
const originalDimensions = Dimensions.get('window');
let dateNowSpy: jest.SpiedFunction<typeof Date.now>;
beforeEach(() => {
  dateNowSpy = jest.spyOn(Date, 'now').mockReturnValue(fixtureNow);
  Dimensions.set({ window: { ...originalDimensions, width: 390, fontScale: 1 } });
});
afterEach(() => {
  dateNowSpy.mockRestore();
  Dimensions.set({ window: originalDimensions });
});

const hidden = { includeHiddenElements: true };
const { recommendation } = todayScreenState.snapshot;
if (recommendation.status !== 'recommended') throw new Error('Expected the Today fixture to recommend.');
const pick = recommendation.outfits[0];
// 20 degrees and rain, a women's profile: T-shirt, skirt, rain jacket, rain boots.
const catalogName = (language: SupportedLanguage, id: string) =>
  messages[language].catalog[`catalog.garment_type.${id}.name` as keyof (typeof messages)['en']['catalog']];

function Detail({
  language,
  onBoardFocusChange,
  onEditPiece,
}: Readonly<{ language: SupportedLanguage; onBoardFocusChange?: (focused: boolean) => void; onEditPiece?: () => void }>) {
  const manualMix = useManualMix(pick, recommendation.status === 'recommended' ? recommendation.requirements : null,
    'womens');
  return (
    <OutfitDetailScreen
      language={language}
      manualMix={manualMix}
      onBoardFocusChange={onBoardFocusChange}
      onEditPiece={onEditPiece ?? jest.fn()}
      onWoreThis={jest.fn()}
      state={todayScreenState}
      suggestionId={pick.optionId}
      wardrobeItems={[]}
      worn="none"
    />
  );
}

async function renderDetail(
  language: SupportedLanguage = 'en',
  props: Partial<React.ComponentProps<typeof Detail>> = {},
  tourTargets: TourTargetRegistry | null = null,
  easierToSee = false,
) {
  const result = await render(
    <LocalizationContext value={{ language, messages: messages[language], hour12: false, temperatureUnit: 'celsius' }}>
      <KuyaraThemeContext.Provider value={lightTheme}>
        <EasierToSeeContext value={easierToSee}>
        <SafeAreaProvider initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 59, right: 0, bottom: 34, left: 0 },
        }}>
          <TourTargetsContext value={tourTargets}>
            <Detail language={language} {...props} />
          </TourTargetsContext>
        </SafeAreaProvider>
        </EasierToSeeContext>
      </KuyaraThemeContext.Provider>
    </LocalizationContext>,
  );
  await fireEvent(result.getByTestId('outfit-detail-content'), 'layout', {
    nativeEvent: { layout: { width: 358, height: 1000, x: 0, y: 0 } },
  });
  return result;
}

function archetype(language: SupportedLanguage) {
  const presentation = createTodayPresentation(todayScreenState, language, false, 'celsius', fixtureNow);
  if (presentation.kind !== 'loaded') throw new Error('Expected loaded Today presentation.');
  return presentation.suggestions[0];
}

describe.each(['en', 'tr'] as const)('%s manual mix', (language) => {
  const copy = messages[language].today;

  test('the row Change opens the slot picker, weather-suitable first, and a choice changes the outfit', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
    const result = await renderDetail(language);
    expect(result.getByTestId('outfit-detail-edit-hint')).toHaveTextContent(copy.boardHint);
    expect(result.queryByText(copy.manualMix.reset)).toBeNull();

    const change = result.getByTestId('outfit-detail-change-outer_layer');
    // One whole sentence per slot, never a translated slot name inflected in place.
    expect(change).toHaveProp('accessibilityLabel', {
      en: `Change the outer layer, now ${catalogName('en', 'rain_jacket')}`,
      tr: `Dış katmanı değiştir, şu an ${catalogName('tr', 'rain_jacket')}`,
    }[language]);
    await fireEvent.press(change);
    const sheet = within(result.getByTestId('piece-picker-sheet'));
    expect(sheet.getByRole('header', { name: copy.slots.outer_layer })).toBeOnTheScreen();
    const fits = within(result.getByTestId('piece-picker-fits'));
    const others = within(result.getByTestId('piece-picker-others'));
    expect(fits.getByTestId('piece-picker-option-rain_jacket')).toHaveProp('accessibilityState', { selected: true });
    expect(fits.getByTestId('piece-picker-current-rain_jacket')).toHaveTextContent(copy.manualMix.pickerCurrent);
    expect(others.getByText(copy.manualMix.pickerOtherHint)).toBeOnTheScreen();
    const expected = slotCandidates(pick, 'outer_layer', recommendation.requirements, 'womens');
    expect(result.getAllByTestId(/^piece-picker-option-/).map(({ props }) => props.testID))
      .toEqual(expected.map(({ garmentTypeId }) => `piece-picker-option-${garmentTypeId}`));
    expect(expected.find(({ garmentTypeId }) => garmentTypeId === 'trench_coat')?.suitable).toBe(false);

    await fireEvent.press(others.getByTestId('piece-picker-option-trench_coat'));
    expect(result.queryByTestId('piece-picker-sheet')).toBeNull();

    // The outfit is the reader's now.
    const heading = within(result.getByTestId('outfit-detail-heading-group'));
    expect(heading.getByRole('header', { name: copy.manualMix.title })).toBeOnTheScreen();
    expect(result.getByTestId('outfit-detail-changed-from'))
      .toHaveTextContent(copy.manualMix.changedFrom(archetype(language).title));
    expect(result.getByTestId('outfit-detail-piece-trench_coat')).toBeOnTheScreen();
    expect(result.getByTestId('outfit-detail-piece-changed-trench_coat', hidden))
      .toHaveTextContent(copy.manualMix.changed);
    expect(result.getByTestId('outfit-detail-generation-source'))
      .toHaveTextContent(copy.manualMix.sourceOne.deterministic);
    // The note stands in the hint's place, in its own glyph and ink; the two never show together.
    expect(result.getByText(copy.manualMix.unusual)).toBeOnTheScreen();
    expect(result.queryByText(copy.boardHint)).toBeNull();
    expect(announce).toHaveBeenCalledWith(copy.manualMix.unusualAccessibilityLabel);
    // "Why it works" is the changed outfit's own: the rain jacket answers nothing now.
    expect(within(result.getByTestId('outfit-detail-reasons')).queryByText(
      new RegExp(catalogName(language, 'rain_jacket')))).toBeNull();
    // The way back sits under "Wore this today", only after a change.
    expect(result.getByRole('button', { name: copy.manualMix.reset })).toBeOnTheScreen();
    announce.mockRestore();
  });

  test('a board piece is adjustable, and enlarging it opens the strip of its candidates', async () => {
    const onBoardFocusChange = jest.fn();
    const result = await renderDetail(language, { onBoardFocusChange });
    const candidates = slotCandidates(pick, 'footwear', recommendation.requirements, 'womens');
    const order = candidates.map(({ garmentTypeId }) => garmentTypeId);
    const position = (id: string) => order.indexOf(id as (typeof order)[number]) + 1;
    const value = (id: string) => copy.manualMix.pieceValue({
      piece: catalogName(language, id), position: position(id), total: order.length,
    });
    const piece = () => result.getByTestId('outfit-detail-board-piece-footwear');
    expect(piece()).toHaveProp('accessibilityRole', 'adjustable');
    expect(piece()).toHaveProp('accessibilityLabel', copy.slots.footwear);
    expect(piece().props.accessibilityValue).toEqual({ text: value('rain_boots') });
    expect(result.queryByTestId('outfit-detail-board-strip')).toBeNull();
    expect(onBoardFocusChange).toHaveBeenLastCalledWith(false);

    // VoiceOver's activate toggles the enlargement for people who also look.
    await fireEvent(piece(), 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });
    expect(onBoardFocusChange).toHaveBeenLastCalledWith(true);
    const strip = within(result.getByTestId('outfit-detail-board-strip'));
    // The header names the piece and its place, and reads before the tiles and Done.
    expect(strip.getByTestId('outfit-detail-board-strip-header')).toHaveProp('accessibilityLabel', value('rain_boots'));
    expect(strip.getByTestId('outfit-detail-board-strip-header'))
      .toHaveTextContent(`${catalogName(language, 'rain_boots')}${copy.manualMix.counter(position('rain_boots'), order.length)}`);
    const tiles = strip.getAllByTestId(/^outfit-detail-board-strip-tile-/);
    expect(tiles.map(({ props }) => props.testID)).toEqual(order.map((id) => `outfit-detail-board-strip-tile-${id}`));
    for (const [index, tile] of tiles.entries()) {
      const candidate = candidates[index];
      expect(tile).toHaveProp('accessibilityRole', 'button');
      expect(tile).toHaveProp('accessibilityLabel', catalogName(language, candidate.garmentTypeId));
      expect(tile.props.accessibilityState).toEqual({ selected: candidate.garmentTypeId === 'rain_boots' });
      expect(tile.props.accessibilityHint).toBe(candidate.suitable ? undefined : copy.manualMix.pickerOtherHint);
    }
    const done = strip.getByTestId('outfit-detail-board-strip-done');
    expect(done).toHaveProp('accessibilityRole', 'button');
    expect(done).toHaveProp('accessibilityLabel', copy.manualMix.done);
    const readingOrder = within(result.getByTestId('outfit-detail-board-strip'))
      .getAllByTestId(/^outfit-detail-board-strip-(header|tile-.+|done)$/).map(({ props }) => props.testID);
    expect(readingOrder[0]).toBe('outfit-detail-board-strip-header');
    expect(readingOrder.at(-1)).toBe('outfit-detail-board-strip-done');

    // Increment and decrement walk the picker's order.
    const next = order[position('rain_boots')];
    await fireEvent(piece(), 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    expect(piece().props.accessibilityValue).toEqual({ text: value(next) });
    expect(within(result.getByTestId('outfit-detail-heading-group'))
      .getByRole('header', { name: copy.manualMix.title })).toBeOnTheScreen();
    await fireEvent(piece(), 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
    expect(piece().props.accessibilityValue).toEqual({ text: value('rain_boots') });
    // Kuyara's own piece back is no change.
    expect(within(result.getByTestId('outfit-detail-heading-group'))
      .getByRole('header', { name: archetype(language).title })).toBeOnTheScreen();

    // The first candidate has nothing before it.
    await fireEvent.press(result.getByTestId(`outfit-detail-board-strip-tile-${order[0]}`));
    expect(piece().props.accessibilityValue).toEqual({ text: value(order[0]) });
    await fireEvent(piece(), 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
    expect(piece().props.accessibilityValue).toEqual({ text: value(order[0]) });

    await fireEvent(piece(), 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });
    expect(onBoardFocusChange).toHaveBeenLastCalledWith(false);
    expect(result.queryByTestId('outfit-detail-board-strip')).toBeNull();
  });

  test('a tile changes the piece while it stays large; the title follows at once and "changed from" waits', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
    const onBoardFocusChange = jest.fn();
    const result = await renderDetail(language, { onBoardFocusChange });
    const order = slotCandidates(pick, 'footwear', recommendation.requirements, 'womens')
      .map(({ garmentTypeId }) => garmentTypeId);
    const other = order.find((id) => id !== 'rain_boots')!;
    const changedFrom = copy.manualMix.changedFrom(archetype(language).title);
    await fireEvent(result.getByTestId('outfit-detail-board-piece-footwear'), 'accessibilityAction',
      { nativeEvent: { actionName: 'activate' } });

    // The strip sits outside the board's gesture: it is not inside the detector's view.
    expect(within(result.getByTestId('outfit-detail-board-plate')).queryByTestId('outfit-detail-board-strip')).toBeNull();
    // A gap between tiles does nothing.
    await fireEvent.press(result.getByTestId('outfit-detail-board-strip-grid'));
    expect(onBoardFocusChange).toHaveBeenLastCalledWith(true);
    expect(result.queryByText(changedFrom)).toBeNull();

    await fireEvent.press(result.getByTestId(`outfit-detail-board-strip-tile-${other}`));
    // A tile steps without settling, and VoiceOver hears the new piece.
    expect(onBoardFocusChange).toHaveBeenLastCalledWith(true);
    expect(result.getByTestId('outfit-detail-board-strip')).toBeOnTheScreen();
    expect(result.getByTestId(`outfit-detail-board-strip-tile-${other}`).props.accessibilityState)
      .toEqual({ selected: true });
    expect(announce).toHaveBeenCalledWith(copy.manualMix.pieceValue({
      piece: catalogName(language, other), position: order.indexOf(other) + 1, total: order.length,
    }));
    expect(within(result.getByTestId('outfit-detail-heading-group'))
      .getByRole('header', { name: copy.manualMix.title })).toBeOnTheScreen();
    expect(result.queryByText(changedFrom)).toBeNull();

    // Done settles; then "changed from" opens.
    await fireEvent.press(result.getByTestId('outfit-detail-board-strip-done'));
    expect(onBoardFocusChange).toHaveBeenLastCalledWith(false);
    expect(result.getByTestId('outfit-detail-changed-from')).toHaveTextContent(changedFrom);
    expect(result.getByText(changedFrom)).toBeOnTheScreen();
    announce.mockRestore();
  });

  test('VoiceOver\'s escape settles the enlargement, from a piece or from the strip', async () => {
    const onBoardFocusChange = jest.fn();
    const result = await renderDetail(language, { onBoardFocusChange });
    const piece = () => result.getByTestId('outfit-detail-board-piece-bottom');
    await fireEvent(piece(), 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });
    expect(onBoardFocusChange).toHaveBeenLastCalledWith(true);
    await fireEvent(piece(), 'accessibilityEscape');
    expect(onBoardFocusChange).toHaveBeenLastCalledWith(false);
    await fireEvent(piece(), 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });
    await fireEvent(result.getByTestId('outfit-detail-board-strip'), 'accessibilityEscape');
    expect(onBoardFocusChange).toHaveBeenLastCalledWith(false);
  });

  test('back to kuyara\'s pick restores the recommendation and leaves', async () => {
    const result = await renderDetail(language);
    await fireEvent(result.getByTestId('outfit-detail-board-piece-bottom'), 'accessibilityAction',
      { nativeEvent: { actionName: 'increment' } });
    expect(result.getByRole('button', { name: copy.manualMix.reset })).toBeOnTheScreen();
    await fireEvent.press(result.getByRole('button', { name: copy.manualMix.reset }));
    expect(within(result.getByTestId('outfit-detail-heading-group'))
      .getByRole('header', { name: archetype(language).title })).toBeOnTheScreen();
    expect(result.queryByRole('button', { name: copy.manualMix.reset })).toBeNull();
    expect(result.getByTestId('outfit-detail-piece-skirt')).toBeOnTheScreen();
    expect(result.getByTestId('outfit-detail-generation-source'))
      .toHaveTextContent(copy.generationSourceDeterministic);
    expect(result.getByTestId('outfit-detail-edit-hint')).toHaveTextContent(copy.boardHint);
  });

  test('the row still opens the piece sheet, and the board no longer does', async () => {
    const onEditPiece = jest.fn();
    const result = await renderDetail(language, { onEditPiece });
    await fireEvent(result.getByTestId('outfit-detail-board-piece-primary_top'), 'accessibilityAction',
      { nativeEvent: { actionName: 'activate' } });
    expect(onEditPiece).not.toHaveBeenCalled();
    await fireEvent.press(result.getByTestId('outfit-detail-piece-t_shirt'));
    expect(onEditPiece).toHaveBeenCalledWith(expect.objectContaining({ garmentTypeId: 't_shirt' }));
  });

  // Phase 8's step 2 lights and makes live the first piece row, and VoiceOver's activation of
  // the tour's stand-in opens the piece sheet exactly as a tap on the row does.
  test('the tour registers the whole first piece row, and its activation opens the piece sheet', async () => {
    const registry = new TourTargetRegistry();
    const onEditPiece = jest.fn();
    const result = await renderDetail(language, { onEditPiece }, registry);
    const [first, second] = archetype(language).pieces;
    const row = result.getByTestId(`outfit-detail-piece-${first.garmentTypeId}`);
    const piece = registry.get('piece');
    expect(piece?.name()).toBe(first.item);
    expect(piece?.label()).toBe(row.props.accessibilityLabel);
    expect(piece?.reveal).toEqual(expect.any(Function));
    expect(piece?.scrollBy).toEqual(expect.any(Function));

    // The tour's wrapper holds the whole row, its Change included, and only the first row's
    // wrapper reports its layout to the tour.
    type Element = typeof row;
    const wrapperOf = (element: Element) => {
      let node = element.parent;
      while (node && node.props.collapsable !== false) node = node.parent;
      if (!node) throw new Error('Expected the row inside a tour wrapper.');
      return node;
    };
    const wrapper = wrapperOf(row);
    expect(within(wrapper).getAllByTestId(/^outfit-detail-change-/)).toHaveLength(1);
    expect(within(wrapper).queryByTestId(`outfit-detail-piece-${second.garmentTypeId}`)).toBeNull();
    const reported: string[] = [];
    registry.subscribe((id) => reported.push(id));
    const layout = { nativeEvent: { layout: { x: 0, y: 0, width: 358, height: 80 } } };
    await fireEvent(wrapperOf(result.getByTestId(`outfit-detail-piece-${second.garmentTypeId}`)), 'layout', layout);
    expect(reported).toEqual([]);
    await fireEvent(wrapper, 'layout', layout);
    expect(reported).toEqual(['piece']);

    await fireEvent.press(row);
    await act(async () => piece?.activate?.());
    expect(onEditPiece).toHaveBeenCalledTimes(2);
    expect(onEditPiece.mock.calls[0][0]).toEqual(expect.objectContaining({ garmentTypeId: first.garmentTypeId }));
    expect(onEditPiece.mock.calls[1][0]).toEqual(onEditPiece.mock.calls[0][0]);
  });
});

// M12: the row pressable fills the row and the row's content is drawn over it, so a tap on the
// row body reaches the pressable only when every layer above it lets touches through. RNTL's
// press skips native hit testing, so the layering itself is the behaviour under test.
test('no layer drawn over a piece row covers its pressable, and the row Change stays pressable', async () => {
  const result = await renderDetail('en');
  type Element = ReturnType<typeof result.getByTestId>;
  const isHost = (node: Element) => typeof node.type === 'string';
  const hostChildren = (node: Element): Element[] => node.children.flatMap((child) =>
    typeof child === 'string' ? [] : isHost(child) ? [child] : hostChildren(child));
  const hostParent = (node: Element) => {
    let parent = node.parent;
    while (parent && !isHost(parent)) parent = parent.parent;
    if (!parent) throw new Error('Expected a host parent.');
    return parent;
  };
  const isChange = (node: Element) => /^outfit-detail-change-/.test(String(node.props.testID ?? ''));
  // The layers that take a touch at some point of the row, drawn above the pressable.
  const covering = (node: Element): Element[] => {
    if (node.props.pointerEvents === 'none') return [];
    if (node.props.pointerEvents === 'box-none') return hostChildren(node).flatMap(covering);
    return isChange(node) ? [] : [node];
  };

  const pieces = archetype('en').pieces;
  expect(pieces.length).toBeGreaterThan(1);
  for (const { garmentTypeId } of pieces) {
    const pressable = result.getByTestId(`outfit-detail-piece-${garmentTypeId}`);
    const row = hostParent(pressable);
    const siblings = hostChildren(row);
    const above = siblings.slice(siblings.indexOf(pressable) + 1);
    expect(above.length).toBeGreaterThan(0);
    expect(above.flatMap(covering).map((node) => node.props.testID ?? node.type)).toEqual([]);
  }

  // The Change control is drawn above the pressable and takes its own touches.
  const change = result.getByTestId('outfit-detail-change-outer_layer');
  expect(change.props.pointerEvents).not.toBe('none');
  for (let node = change.parent; node && node.props.testID !== 'outfit-detail-pieces'; node = node.parent) {
    expect(['none', 'box-only']).not.toContain(node.props.pointerEvents);
  }
});

test('a suitable change drops the hint and raises no note', async () => {
  const result = await renderDetail('en');
  await act(async () => {
    fireEvent(result.getByTestId('outfit-detail-board-piece-footwear'), 'accessibilityAction',
      { nativeEvent: { actionName: 'increment' } });
  });
  expect(result.queryByText(messages.en.today.boardHint)).toBeNull();
  expect(result.queryByText(messages.en.today.manualMix.unusual)).toBeNull();
});

// The board's own gestures: a tap on a piece enlarges it, and a leftward flick on the enlarged
// piece commits the next candidate in the picker's order.
test('a tap enlarges a piece and a leftward flick changes it to the next candidate', async () => {
  const onBoardFocusChange = jest.fn();
  const result = await renderDetail('en', { onBoardFocusChange });
  const { boardPieces } = archetype('en');
  const shoes = layoutGarmentBoard(boardPieces, 358, 'detail').boxes.find(({ slot }) => slot === 'footwear')!;
  await act(async () => {
    fireGestureHandler(getByGestureTestId('outfit-detail-board-tap'), [
      { state: State.BEGAN, x: shoes.x + shoes.width / 2, y: shoes.y + shoes.height / 2 },
      { state: State.ACTIVE, x: shoes.x + shoes.width / 2, y: shoes.y + shoes.height / 2 },
      { state: State.END, x: shoes.x + shoes.width / 2, y: shoes.y + shoes.height / 2 },
    ]);
  });
  expect(onBoardFocusChange).toHaveBeenLastCalledWith(true);
  expect(result.getByTestId('outfit-detail-board-strip')).toBeOnTheScreen();

  const order = slotCandidates(pick, 'footwear', recommendation.requirements, 'womens')
    .map(({ garmentTypeId }) => garmentTypeId);
  const next = order[order.indexOf('rain_boots') + 1];
  // A flick in the drag's direction commits at any distance past the slop.
  await act(async () => {
    fireGestureHandler(getByGestureTestId('outfit-detail-board-pan'), [
      { state: State.BEGAN, translationX: 0, velocityX: 0 },
      { state: State.ACTIVE, translationX: -20, velocityX: -600 },
      { state: State.ACTIVE, translationX: -40, velocityX: -600 },
      { state: State.END, translationX: -40, velocityX: -600 },
    ]);
  });
  expect(result.getByTestId('outfit-detail-board-piece-footwear').props.accessibilityValue.text)
    .toContain(catalogName('en', next));
  expect(result.getByTestId(`outfit-detail-piece-${next}`)).toBeOnTheScreen();
  // The piece stays large after the step.
  expect(onBoardFocusChange).toHaveBeenLastCalledWith(true);

  // A short drag springs home and changes nothing.
  await act(async () => {
    fireGestureHandler(getByGestureTestId('outfit-detail-board-pan'), [
      { state: State.BEGAN, translationX: 0, velocityX: 0 },
      { state: State.ACTIVE, translationX: -20, velocityX: 0 },
      { state: State.END, translationX: -20, velocityX: 0 },
    ]);
  });
  expect(result.getByTestId(`outfit-detail-piece-${next}`)).toBeOnTheScreen();
});

// The rule against sentences assembled from translated fragments: every changeable slot has
// its own whole spoken sentence in both languages.
test('each changeable slot has its own whole change sentence in English and Turkish', () => {
  const sentences = {
    en: {
      primary_top: 'Change the top, now X', bottom: 'Change the bottom, now X',
      one_piece: 'Change the one-piece, now X', mid_layer: 'Change the mid layer, now X',
      outer_layer: 'Change the outer layer, now X', footwear: 'Change the footwear, now X',
    },
    // Never "<slot name> parçasını değiştir": "Tek parça parçasını değiştir" was the defect.
    tr: {
      primary_top: 'Üstü değiştir, şu an X', bottom: 'Altı değiştir, şu an X',
      one_piece: 'Tek parçayı değiştir, şu an X', mid_layer: 'Orta katmanı değiştir, şu an X',
      outer_layer: 'Dış katmanı değiştir, şu an X', footwear: 'Ayakkabıyı değiştir, şu an X',
    },
  } as const;
  for (const language of ['en', 'tr'] as const) {
    const labels = messages[language].today.manualMix.changeAccessibilityLabel;
    expect(Object.keys(labels).sort()).toEqual([...swappableSlots].sort());
    for (const slot of swappableSlots) expect(labels[slot]('X')).toBe(sentences[language][slot]);
  }
});

// Final-spec sections 4, 6 and 8: the enlarged piece is drawn a second time at its grow size
// (never scaled up from its resting drawing), grows between 1.6 and 2 times inside the
// stage, and the strip fits the column, with Easier to see (board caps x 1.3) as without it.
describe.each([false, true])('Easier to see %s', (large) => {
  test('the enlarged piece grows 1.6 to 2 times in the stage and only it gets a big drawing', async () => {
    const result = await renderDetail('en', {}, null, large);
    const { boardPieces } = archetype('en');
    const boxes = layoutGarmentBoard(boardPieces, 358, 'detail', large).boxes;
    // A settled piece hands its big drawing back once its shrink is a quarter done, which Jest's
    // Reanimated mock never animates; only pieces never enlarged are checked for none.
    const enlarged = new Set<string>();
    for (const { slot, garmentTypeId } of boardPieces) {
      enlarged.add(slot);
      await fireEvent(result.getByTestId(`outfit-detail-board-piece-${slot}`), 'accessibilityAction',
        { nativeEvent: { actionName: 'activate' } });
      const big = StyleSheet.flatten(result.getByTestId(`outfit-detail-board-drawing-${slot}-${garmentTypeId}-big`,
        hidden).props.style);
      const box = boxes.find((candidate) => candidate.slot === slot)!;
      const grow = big.width / box.width;
      expect(grow).toBeGreaterThanOrEqual(1.6);
      expect(grow).toBeLessThanOrEqual(2);
      expect(big.transform).toEqual([{ scale: 1 / grow }]);
      // The adjustable element covers the grown piece, which stays on the stage.
      const target = StyleSheet.flatten(result.getByTestId(`outfit-detail-board-piece-${slot}`).props.style);
      expect(target.width).toBeGreaterThanOrEqual(Math.max(44, box.width * 1.6) - 0.01);
      if (box.width * grow >= 44) {
        expect(target.left).toBeGreaterThanOrEqual(-0.01);
        expect(target.left + target.width).toBeLessThanOrEqual(358.01);
      }
      // Stepped-back pieces keep their resting drawing only.
      for (const other of boardPieces.filter((piece) => !enlarged.has(piece.slot))) {
        expect(result.queryByTestId(`outfit-detail-board-drawing-${other.slot}-${other.garmentTypeId}-big`, hidden))
          .toBeNull();
      }
      // The strip's grid fits the column in rows of at most seven 44-point tiles.
      const grid = StyleSheet.flatten(result.getByTestId('outfit-detail-board-strip-grid').props.style);
      expect(grid.width).toBeLessThanOrEqual(358);
      await fireEvent.press(result.getByTestId('outfit-detail-board-strip-done'));
    }
    expect(easierToSeeValues.boardOutline).toBe(2.8);
  });
});

// Final-spec section 8: at the largest standard text size the header keeps one line: the name
// truncates as a guard, the counter and Done never do, and the header is at least 44 points.
test.each(['en', 'tr'] as const)('%s strip header keeps one line at the largest standard text size', async (language) => {
  Dimensions.set({ window: { ...originalDimensions, width: 390, fontScale: 1.353 } });
  const result = await renderDetail(language);
  for (const { slot } of archetype(language).boardPieces) {
    await fireEvent(result.getByTestId(`outfit-detail-board-piece-${slot}`), 'accessibilityAction',
      { nativeEvent: { actionName: 'activate' } });
    const header = result.getByTestId('outfit-detail-board-strip-header');
    expect(StyleSheet.flatten(header.props.style).minHeight).toBe(44);
    const [name, counter] = within(header).getAllByText(/.+/);
    expect(name.props.numberOfLines).toBe(1);
    expect(counter.props.numberOfLines).toBeUndefined();
    expect(result.getByTestId('outfit-detail-board-strip-done')).toHaveTextContent(messages[language].today.manualMix.done);
    for (const tile of result.getAllByTestId(/^outfit-detail-board-strip-tile-/)) {
      expect(StyleSheet.flatten(tile.props.style).position).toBe('absolute');
    }
    await fireEvent.press(result.getByTestId('outfit-detail-board-strip-done'));
  }
});
