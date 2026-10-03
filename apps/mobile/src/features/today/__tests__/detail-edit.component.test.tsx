import { act, fireEvent, render, within } from '@testing-library/react-native';
import { HeaderHeightContext } from 'expo-router/react-navigation';
import ReactNative, { AccessibilityInfo, Dimensions, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useManualMix } from '@/features/recommendation/application/use-manual-mix';
import {
  accessoryFreeTodayScreenState,
  coldTodayScreenState,
  todayScreenState,
} from '@/features/today/__tests__/fixtures';
import type { TodayScreenState } from '@/features/today/model';
import { OutfitDetailScreen } from '@/features/today/presentation/outfit-detail-screen';
import { LocalizationContext } from '@/localization/localization-context';
import { messages, type SupportedLanguage } from '@/localization/messages';
import { lightTheme } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

jest.mock('@expo/ui/swift-ui', () => jest.requireActual('@/components/ui/__tests__/expo-ui-test-mock'));
jest.mock('@expo/ui/swift-ui/modifiers', () =>
  jest.requireActual('@/components/ui/__tests__/expo-ui-test-mock'));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
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
// The segmented control is native; each segment stands as a pressable here.
jest.mock('@expo/ui/community/segmented-control', () => {
  const { Pressable, View } = jest.requireActual('react-native') as typeof import('react-native');
  return {
    SegmentedControl: ({ onChange, selectedIndex, testID, values }: {
      onChange: (event: { nativeEvent: { selectedSegmentIndex: number } }) => void;
      selectedIndex: number;
      testID?: string;
      values: string[];
    }) => (
      <View testID={testID}>
        {values.map((value, index) => (
          <Pressable
            accessibilityLabel={value}
            accessibilityState={{ selected: index === selectedIndex }}
            key={value}
            onPress={() => onChange({ nativeEvent: { selectedSegmentIndex: index } })}
            testID={`${testID}-${index}`}
          />
        ))}
      </View>
    ),
  };
});
jest.mock('expo-router', () => {
  const React = jest.requireActual('react') as typeof import('react');
  return {
    useFocusEffect: (callback: () => void | (() => void)) => React.useEffect(() => callback(), [callback]),
    Stack: { Toolbar: Object.assign(() => null, { Button: () => null }) },
  };
});

const fixtureNow = Date.parse('2026-08-13T06:30:00.000Z');
const originalDimensions = Dimensions.get('window');
beforeEach(() => {
  jest.spyOn(Date, 'now').mockReturnValue(fixtureNow);
  Dimensions.set({ window: { ...originalDimensions, width: 390, fontScale: 1 } });
});
afterEach(() => {
  jest.restoreAllMocks();
  Dimensions.set({ window: originalDimensions });
});

const hidden = { includeHiddenElements: true };
const catalogName = (language: SupportedLanguage, id: string) =>
  messages[language].catalog[`catalog.garment_type.${id}.name` as keyof (typeof messages)['en']['catalog']];
const pickOf = (state: TodayScreenState) => {
  if (state.kind !== 'loaded' || state.snapshot.recommendation.status !== 'recommended') {
    throw new Error('Expected a recommended fixture.');
  }
  return { outfit: state.snapshot.recommendation.outfits[0], requirements: state.snapshot.recommendation.requirements };
};

function Detail({ state, language, ...rest }: Readonly<{ state: TodayScreenState; language: SupportedLanguage }>
  & Partial<React.ComponentProps<typeof OutfitDetailScreen>>) {
  const { outfit, requirements } = pickOf(state);
  const manualMix = useManualMix(outfit, requirements, 'womens');
  return (
    <OutfitDetailScreen
      language={language}
      manualMix={manualMix}
      onEditPiece={jest.fn()}
      onWoreThis={jest.fn()}
      state={state}
      suggestionId={outfit.optionId}
      wardrobeItems={[]}
      worn="none"
      {...rest}
    />
  );
}

function tree(
  language: SupportedLanguage,
  state: TodayScreenState = todayScreenState,
  props: Partial<React.ComponentProps<typeof OutfitDetailScreen>> = {},
) {
  return (
    <LocalizationContext value={{ language, messages: messages[language], hour12: false, temperatureUnit: 'celsius' }}>
      <KuyaraThemeContext.Provider value={lightTheme}>
        <SafeAreaProvider initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 59, right: 0, bottom: 34, left: 0 },
        }}>
          <HeaderHeightContext value={undefined}>
            <Detail language={language} state={state} {...props} />
          </HeaderHeightContext>
        </SafeAreaProvider>
      </KuyaraThemeContext.Provider>
    </LocalizationContext>
  );
}

async function renderDetail(
  language: SupportedLanguage,
  state: TodayScreenState = todayScreenState,
  props: Partial<React.ComponentProps<typeof OutfitDetailScreen>> = {},
) {
  const result = await render(tree(language, state, props));
  await fireEvent(result.getByTestId('outfit-detail-content'), 'layout',
    { nativeEvent: { layout: { width: 358, height: 1000, x: 0, y: 0 } } });
  return result;
}
type Rendered = Awaited<ReturnType<typeof renderDetail>>;

const activate = (result: Rendered, slot: string) =>
  fireEvent(result.getByTestId(`outfit-detail-board-piece-${slot}`), 'accessibilityAction',
    { nativeEvent: { actionName: 'activate' } });
// A picker choice plays once the sheet has gone.
const afterSheet = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 600)); });
const nextFrame = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
const rowSlots = (result: Rendered) => result.getAllByTestId(/^outfit-detail-row-/, hidden)
  .map(({ props }) => String(props.testID).replace('outfit-detail-row-', ''));
// The test renderer has no native tags: a view stands for its test ID.
const focusByTestID = () => {
  jest.spyOn(ReactNative as unknown as { findNodeHandle: object }, 'findNodeHandle', 'get').mockReturnValue(
    ((instance: { props?: { testID?: string } } | null) => instance?.props?.testID ?? null) as never);
  return jest.spyOn(AccessibilityInfo, 'setAccessibilityFocus').mockImplementation(() => undefined);
};

// A composed result standing in for kuyara's pick, as the route passes it.
const composeResult = (key: string) => ({
  key,
  line: <Text testID="compose-line">1 / 3</Text>,
  subtitle: 'composed subtitle',
  source: 'composed source',
  detail: { outfit: pickOf(todayScreenState).outfit, changedSlots: [], pinnedSlots: [], pieceColors: {} },
});

describe.each(['en', 'tr'] as const)('%s detail edit', (language) => {
  const copy = messages[language].today;
  const mix = copy.manualMix;

  test('Take off in the strip header lays the board out without the layer and leaves its row in place', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
    const queued = jest.spyOn(AccessibilityInfo, 'announceForAccessibilityWithOptions').mockImplementation(() => undefined);
    const focus = focusByTestID();
    const onBoardFocusChange = jest.fn();
    const result = await renderDetail(language, todayScreenState, { onBoardFocusChange });
    const rowsBefore = rowSlots(result);
    await activate(result, 'outer_layer');
    const takeOff = result.getByTestId('outfit-detail-board-strip-take-off');
    expect(takeOff).toHaveTextContent(mix.takeOff);
    expect(takeOff).toHaveProp('accessibilityLabel', mix.takeOffAccessibilityLabel.outer_layer);
    announce.mockClear();
    queued.mockClear();
    await fireEvent.press(takeOff);
    await nextFrame();

    // The focus ends in the same render: no enlargement outlives its piece.
    expect(onBoardFocusChange).toHaveBeenLastCalledWith(false);
    expect(result.queryByTestId('outfit-detail-board-piece-outer_layer')).toBeNull();
    expect(result.queryByTestId('outfit-detail-board-strip')).toBeNull();
    // The row stays where the layer was, as an empty place with Change.
    expect(rowSlots(result)).toEqual(rowsBefore);
    const row = within(result.getByTestId('outfit-detail-row-outer_layer'));
    expect(row.getByText(mix.noLayer.outer_layer)).toBeOnTheScreen();
    expect(row.getByText(mix.tookOff)).toBeOnTheScreen();
    expect(row.getByTestId('outfit-detail-empty-tile-outer_layer', hidden)).toBeOnTheScreen();
    expect(row.getByTestId('outfit-detail-change-outer_layer')).toHaveTextContent(mix.change);
    expect(result.getByTestId('outfit-detail-empty-outer_layer'))
      .toHaveProp('accessibilityLabel', `${mix.noLayer.outer_layer}, ${mix.tookOff}`);
    // VoiceOver lands on the empty place, and one announcement says the layer went and the
    // outfit is unusual for the rain now. It waits for the focused place to be read instead of
    // being cut off by it.
    expect(focus).toHaveBeenLastCalledWith('outfit-detail-empty-outer_layer');
    expect(announce).not.toHaveBeenCalled();
    expect(queued.mock.calls).toEqual([[mix.takenOffUnusual.outer_layer, { queue: true }]]);
    expect(result.getByText(mix.unusual)).toBeOnTheScreen();
    expect(result.getByTestId('outfit-detail-generation-source')).toHaveTextContent(mix.sourceOne.deterministic);
  });

  test('the empty place opens its picker with "wear without" first and current; a piece puts a layer back', async () => {
    const result = await renderDetail(language);
    await fireEvent(result.getByTestId('outfit-detail-board-piece-outer_layer'), 'accessibilityAction',
      { nativeEvent: { actionName: 'takeOff' } });
    await fireEvent.press(result.getByTestId('outfit-detail-change-outer_layer'));
    const sheet = within(result.getByTestId('piece-picker-sheet'));
    const options = result.getAllByTestId(/^piece-picker-option-/).map(({ props }) => props.testID);
    expect(options[0]).toBe('piece-picker-option-none');
    const without = sheet.getByTestId('piece-picker-option-none');
    expect(without).toHaveProp('accessibilityState', { selected: true });
    expect(within(without).getByText(mix.wearWithout.outer_layer)).toBeOnTheScreen();
    expect(sheet.getByTestId('piece-picker-current-none')).toHaveTextContent(mix.pickerCurrent);

    await fireEvent.press(sheet.getByTestId('piece-picker-option-rain_jacket'));
    await afterSheet();
    expect(result.getByTestId('outfit-detail-board-piece-outer_layer')).toBeOnTheScreen();
    expect(result.getByTestId('outfit-detail-piece-rain_jacket')).toBeOnTheScreen();
    // Back to kuyara's own pick: nothing differs any more.
    expect(result.getByTestId('outfit-detail-generation-source')).toHaveTextContent(copy.generationSourceDeterministic);
  });

  test('a worn layer\'s own Change has no "wear without" entry', async () => {
    const result = await renderDetail(language);
    await fireEvent.press(result.getByTestId('outfit-detail-change-outer_layer'));
    expect(result.queryByTestId('piece-picker-option-none')).toBeNull();
  });

  test('Add a layer follows the piece rows while a layer slot is free, with a tab for each free slot', async () => {
    const result = await renderDetail(language);
    const add = result.getByTestId('outfit-detail-add-layer');
    expect(within(add).getByText(mix.addLayer, hidden)).toBeOnTheScreen();
    expect(within(add).getByText(mix.addLayerHint, hidden)).toBeOnTheScreen();
    expect(rowSlots(result).at(-1)).toBe('footwear');
    // Only the mid layer is free: no tabs.
    await fireEvent.press(within(add).getByRole('button'));
    expect(within(result.getByTestId('piece-picker-sheet')).getByRole('header', { name: mix.addLayer }))
      .toBeOnTheScreen();
    expect(result.queryByTestId('piece-picker-tabs')).toBeNull();
    expect(result.queryByTestId('piece-picker-option-none')).toBeNull();
    await fireEvent.press(result.getByTestId('piece-picker-close'));
    await afterSheet();

    // With the outer layer off too, both are free and the picker opens on the mid layer.
    await fireEvent(result.getByTestId('outfit-detail-board-piece-outer_layer'), 'accessibilityAction',
      { nativeEvent: { actionName: 'takeOff' } });
    await fireEvent.press(within(result.getByTestId('outfit-detail-add-layer')).getByRole('button'));
    const tabs = within(result.getByTestId('piece-picker-tabs'));
    expect(tabs.getByLabelText(copy.slots.mid_layer)).toHaveProp('accessibilityState', { selected: true });
    await fireEvent.press(tabs.getByLabelText(copy.slots.outer_layer));
    expect(result.getByTestId('piece-picker-option-rain_jacket')).toBeOnTheScreen();
    await fireEvent.press(tabs.getByLabelText(copy.slots.mid_layer));
    const mid = result.getAllByTestId(/^piece-picker-option-/)[0];
    const midId = String(mid.props.testID).replace('piece-picker-option-', '');
    await fireEvent.press(mid);
    await afterSheet();

    // The added layer hangs on the board and its row reads Added.
    expect(result.getByTestId('outfit-detail-board-piece-mid_layer')).toBeOnTheScreen();
    expect(result.getByTestId(`outfit-detail-piece-added-${midId}`, hidden)).toHaveTextContent(mix.added);
    expect(result.getByTestId('outfit-detail-add-layer')).toBeOnTheScreen();
  });

  test('a finishing touch is taken off by its own Take off, leaves the list and is put back', async () => {
    const focus = focusByTestID();
    const result = await renderDetail(language, coldTodayScreenState);
    const touches = within(result.getByTestId('outfit-detail-finishing-touches'));
    const neck = touches.getByTestId('outfit-detail-accessory-take-off-neck');
    expect(neck).toHaveTextContent(mix.takeOff);
    await fireEvent.press(neck);
    await nextFrame();
    expect(touches.queryByTestId('outfit-detail-accessory-take-off-neck')).toBeNull();
    expect(touches.getByTestId('outfit-detail-accessories-removed-text')).toHaveTextContent(mix.accessoriesTookOff(1));
    expect(focus).toHaveBeenLastCalledWith('outfit-detail-accessories-removed-text');
    // One finishing touch changed: the outfit is the reader's now.
    expect(result.getByText(mix.reset, hidden)).toBeOnTheScreen();
    expect(result.getByTestId('outfit-detail-generation-source')).toHaveTextContent(mix.sourceOne.deterministic);

    await fireEvent.press(touches.getByTestId('outfit-detail-accessory-take-off-hands'));
    expect(touches.getByTestId('outfit-detail-accessories-removed-text')).toHaveTextContent(mix.accessoriesTookOff(2));
    expect(result.getByTestId('outfit-detail-generation-source')).toHaveTextContent(mix.sourceMany.deterministic);

    await fireEvent.press(touches.getByTestId('outfit-detail-accessories-put-back'));
    await nextFrame();
    // VoiceOver lands on the first finishing touch put back, the neck's.
    const neckPiece = pickOf(coldTodayScreenState).outfit.accessories.neck?.garment.garmentTypeId;
    expect(focus).toHaveBeenLastCalledWith(`outfit-detail-accessory-${neckPiece}`);
    expect(touches.getByTestId('outfit-detail-accessory-take-off-neck')).toBeOnTheScreen();
    expect(touches.getByTestId('outfit-detail-accessory-take-off-hands')).toBeOnTheScreen();
    expect(touches.queryByTestId('outfit-detail-accessories-removed')).toBeNull();
    expect(result.getByTestId('outfit-detail-generation-source')).toHaveTextContent(copy.generationSourceDeterministic);
  });

  test('the heading stays without a finishing touch, and Add an accessory adds one that reads Added', async () => {
    const result = await renderDetail(language, accessoryFreeTodayScreenState);
    const touches = within(result.getByTestId('outfit-detail-finishing-touches'));
    expect(touches.getByRole('header', { name: copy.finishingTouchesHeading })).toBeOnTheScreen();
    const add = touches.getByTestId('outfit-detail-add-accessory');
    expect(within(add).getByText(mix.addAccessory, hidden)).toBeOnTheScreen();
    expect(within(add).getByText(mix.addAccessoryHint, hidden)).toBeOnTheScreen();
    await fireEvent.press(within(add).getByRole('button'));

    const sheet = within(result.getByTestId('piece-picker-sheet'));
    expect(sheet.getByRole('header', { name: mix.addAccessory })).toBeOnTheScreen();
    // Nothing the warm day asks for: no "fits today's weather" group, the four slots in order.
    expect(sheet.queryByText(mix.pickerFits)).toBeNull();
    expect(result.getAllByTestId(/^piece-picker-group-/).map(({ props }) => props.testID)).toEqual(
      ['head', 'neck', 'hands', 'handheld'].map((slot) => `piece-picker-group-${slot}`));
    for (const slot of ['head', 'neck', 'hands', 'handheld'] as const) {
      expect(within(result.getByTestId(`piece-picker-group-${slot}`)).getByRole('header', { name: copy.slots[slot] }))
        .toBeOnTheScreen();
    }
    await fireEvent.press(sheet.getByTestId('piece-picker-option-umbrella'));
    await afterSheet();

    const row = within(touches.getByTestId('outfit-detail-accessory-umbrella'));
    expect(row.getByText(catalogName(language, 'umbrella'))).toBeOnTheScreen();
    expect(row.getByText(mix.accessoryAdded(copy.slots.handheld))).toBeOnTheScreen();
    // Spoken with a comma pause, never the middle dot the subtitle shows.
    expect(touches.getByTestId('outfit-detail-accessory-umbrella').props.accessibilityLabel)
      .toBe(`${catalogName(language, 'umbrella')}, ${copy.slots.handheld}, ${mix.added}`);
    expect(touches.getByTestId('outfit-detail-accessory-take-off-handheld')).toBeOnTheScreen();
    // Taking an added one off simply forgets it: nothing of kuyara's was taken off.
    await fireEvent.press(touches.getByTestId('outfit-detail-accessory-take-off-handheld'));
    expect(touches.queryByTestId('outfit-detail-accessories-removed')).toBeNull();
    expect(result.getByTestId('outfit-detail-generation-source')).toHaveTextContent(copy.generationSourceDeterministic);
  });

  test('a removed accessory\'s row speaks one sentence and its Take off another', async () => {
    const result = await renderDetail(language, coldTodayScreenState);
    const button = result.getByTestId('outfit-detail-accessory-take-off-handheld');
    expect(button.props.accessibilityLabel).toMatch(new RegExp(catalogName(language, 'umbrella')));
    expect(button.props.accessibilityLabel).not.toBe(mix.takeOff);
    // What is carried is left behind, not taken off.
    expect(button.props.accessibilityLabel).toBe({
      en: `Leave behind what you carry, now ${catalogName(language, 'umbrella')}`,
      tr: `Yanına aldığını bırak, şu an ${catalogName(language, 'umbrella')}`,
    }[language]);
  });

  test('pinned slots read "Your choice", and the compose slots render where the screen leaves them', async () => {
    const result = await renderDetail(language, todayScreenState, {
      pinnedSlots: ['bottom'],
      composeEntry: () => <Text testID="compose-entry">entry</Text>,
    });
    const bottom = within(result.getByTestId('outfit-detail-row-bottom'));
    expect(bottom.getByText(mix.yourChoice, hidden)).toBeOnTheScreen();
    expect(bottom.getByTestId('outfit-detail-change-bottom')).toBeOnTheScreen();
    const order = result.getByTestId('outfit-detail-content');
    const ids: string[] = [];
    const walk = (node: { props?: { testID?: string }; children?: unknown[] }) => {
      if (node.props?.testID) ids.push(node.props.testID);
      for (const child of node.children ?? []) if (typeof child === 'object' && child) walk(child as never);
    };
    walk(order as never);
    expect(ids.indexOf('compose-entry')).toBeGreaterThan(ids.indexOf('outfit-detail-worn-error'));
    expect(ids.indexOf('compose-entry')).toBeLessThan(ids.indexOf('outfit-detail-reset'));
  });

  test('a composed result shows its line under the names, its subtitle and its own source sentence', async () => {
    const result = await renderDetail(language, todayScreenState, { composeResult: composeResult('composed#1') });
    expect(result.getByTestId('compose-line')).toBeOnTheScreen();
    // Its "Show another" takes touches: nothing above it in the board lets them fall through.
    for (let node = result.getByTestId('compose-line').parent; node; node = node.parent) {
      expect(['none', 'box-only']).not.toContain(node.props.pointerEvents);
    }
    expect(result.queryByText(copy.boardHint)).toBeNull();
    expect(within(result.getByTestId('outfit-detail-heading-group')).getByRole('header', { name: mix.title }))
      .toBeOnTheScreen();
    expect(result.getByTestId('outfit-detail-changed-from')).toHaveTextContent('composed subtitle');
    expect(result.getByTestId('outfit-detail-generation-source')).toHaveTextContent('composed source');
  });

  test('another composed option ends the enlargement in the same render', async () => {
    const onBoardFocusChange = jest.fn();
    const result = await renderDetail(language, todayScreenState, { composeResult: composeResult('composed#1'), onBoardFocusChange });
    await activate(result, 'outer_layer');
    expect(result.getByTestId('outfit-detail-board-strip')).toBeOnTheScreen();
    await result.rerender(tree(language, todayScreenState, { composeResult: composeResult('composed#2'), onBoardFocusChange }));
    expect(result.queryByTestId('outfit-detail-board-strip')).toBeNull();
    expect(onBoardFocusChange).toHaveBeenLastCalledWith(false);
  });
});
