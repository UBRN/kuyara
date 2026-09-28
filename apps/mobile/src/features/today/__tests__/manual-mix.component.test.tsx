import { act, fireEvent, render, within } from '@testing-library/react-native';
import { AccessibilityInfo, Dimensions } from 'react-native';
import { State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { layoutGarmentBoard } from '@/components/ui';
import { useManualMix } from '@/features/recommendation/application/use-manual-mix';
import { slotCandidates } from '@/features/recommendation/domain/manual-mix';
import { todayScreenState } from '@/features/today/__tests__/fixtures';
import { OutfitDetailScreen } from '@/features/today/presentation/outfit-detail-screen';
import { createTodayPresentation } from '@/features/today/presentation/today-presentation';
import { TourTargetRegistry } from '@/features/walkthrough/application/tour-target-registry';
import { TourTargetsContext } from '@/features/walkthrough/application/walkthrough-context';
import { LocalizationContext } from '@/localization/localization-context';
import { messages, type SupportedLanguage } from '@/localization/messages';
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
) {
  const result = await render(
    <LocalizationContext value={{ language, messages: messages[language], hour12: false, temperatureUnit: 'celsius' }}>
      <KuyaraThemeContext.Provider value={lightTheme}>
        <SafeAreaProvider initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 59, right: 0, bottom: 34, left: 0 },
        }}>
          <TourTargetsContext value={tourTargets}>
            <Detail language={language} {...props} />
          </TourTargetsContext>
        </SafeAreaProvider>
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
    expect(change).toHaveProp('accessibilityLabel', copy.manualMix.changeAccessibilityLabel({
      slot: copy.slots.outer_layer, piece: catalogName(language, 'rain_jacket'),
    }));
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

    // Owner answer 5: the outfit is the reader's now.
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
    // Owner answer 3: the way back sits under "Wore this today", only after a change.
    expect(result.getByRole('button', { name: copy.manualMix.reset })).toBeOnTheScreen();
    announce.mockRestore();
  });

  test('a board piece is adjustable, focus shows its name and position, and the arrows step', async () => {
    const onBoardFocusChange = jest.fn();
    const result = await renderDetail(language, { onBoardFocusChange });
    const order = slotCandidates(pick, 'footwear', recommendation.requirements, 'womens')
      .map(({ garmentTypeId }) => garmentTypeId);
    const position = (id: string) => order.indexOf(id as (typeof order)[number]) + 1;
    const value = (id: string) => copy.manualMix.pieceValue({
      piece: catalogName(language, id), position: position(id), total: order.length,
    });
    const piece = () => result.getByTestId('outfit-detail-board-piece-footwear');
    expect(piece()).toHaveProp('accessibilityRole', 'adjustable');
    expect(piece()).toHaveProp('accessibilityLabel', copy.slots.footwear);
    expect(piece().props.accessibilityValue).toEqual({ text: value('rain_boots') });
    expect(result.queryByTestId('outfit-detail-board-next')).toBeNull();
    expect(onBoardFocusChange).toHaveBeenLastCalledWith(false);

    // VoiceOver's activate toggles the visual focus for people who also look.
    await fireEvent(piece(), 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });
    expect(onBoardFocusChange).toHaveBeenLastCalledWith(true);
    const label = within(result.getByTestId('outfit-detail-board-focus-label', hidden));
    expect(label.getAllByText(catalogName(language, 'rain_boots'), hidden).length).toBeGreaterThan(0);
    expect(label.getAllByText(copy.manualMix.counter(position('rain_boots'), order.length), hidden).length)
      .toBeGreaterThan(0);
    expect(result.getByTestId('outfit-detail-board-previous')).toHaveProp('accessibilityLabel', copy.manualMix.previousPiece);
    expect(result.getByTestId('outfit-detail-board-next')).toHaveProp('accessibilityLabel', copy.manualMix.nextPiece);

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

    // The arrows step too, and the first candidate has nothing before it.
    for (let step = position('rain_boots'); step > 1; step -= 1) {
      await fireEvent(result.getByTestId('outfit-detail-board-previous'), 'accessibilityAction',
        { nativeEvent: { actionName: 'activate' } });
    }
    expect(piece().props.accessibilityValue).toEqual({ text: value(order[0]) });
    expect(result.getByTestId('outfit-detail-board-previous').props.accessibilityState).toEqual({ disabled: true });
    await fireEvent(piece(), 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
    expect(piece().props.accessibilityValue).toEqual({ text: value(order[0]) });

    await fireEvent(piece(), 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });
    expect(onBoardFocusChange).toHaveBeenLastCalledWith(false);
    expect(result.queryByTestId('outfit-detail-board-next')).toBeNull();
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

// The board's own gestures: a tap on a piece focuses it, and a drag on the focused piece past
// half a step commits the next candidate in the picker's order.
test('a tap focuses a piece and a leftward drag past half a step changes it to the next candidate', async () => {
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
  expect(result.getByTestId('outfit-detail-board-next')).toBeOnTheScreen();

  const order = slotCandidates(pick, 'footwear', recommendation.requirements, 'womens')
    .map(({ garmentTypeId }) => garmentTypeId);
  const next = order[order.indexOf('rain_boots') + 1];
  await act(async () => {
    fireGestureHandler(getByGestureTestId('outfit-detail-board-pan'), [
      { state: State.BEGAN, translationX: 0, velocityX: 0 },
      { state: State.ACTIVE, translationX: -20, velocityX: 0 },
      { state: State.ACTIVE, translationX: -80, velocityX: 0 },
      { state: State.END, translationX: -80, velocityX: 0 },
    ]);
  });
  expect(result.getByTestId('outfit-detail-board-piece-footwear').props.accessibilityValue.text)
    .toContain(catalogName('en', next));
  expect(result.getByTestId(`outfit-detail-piece-${next}`)).toBeOnTheScreen();

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
