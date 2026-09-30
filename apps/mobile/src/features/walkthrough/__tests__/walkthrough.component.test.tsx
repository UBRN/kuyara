import { act, fireEvent, render, within } from '@testing-library/react-native';
import { use, useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { AccessibilityInfo, Dimensions, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { NotificationApplicationValue } from '@/features/notifications/application/notification-context';
import { NotificationApplicationContext } from '@/features/notifications/application/notification-context';
import {
  ProfileApplicationContext,
  type ProfileApplicationValue,
} from '@/features/profile/application/profile-context';
import type { LocalProfile } from '@/features/profile/domain/profile';
import { SettingsScreen } from '@/features/profile/presentation/settings-screen';
import { TourSheetScope, TourTarget } from '@/features/walkthrough/application/tour-target';
import {
  TourTargetRegistry,
  type TourRect,
  type TourTargetHandle,
} from '@/features/walkthrough/application/tour-target-registry';
import { WalkthroughController } from '@/features/walkthrough/application/walkthrough-controller';
import {
  TourTargetsContext,
  useWalkthrough,
  WalkthroughContext,
  type WalkthroughTodayFacts,
} from '@/features/walkthrough/application/walkthrough-context';
import {
  activateTourControl,
  WALKTHROUGH_OPEN_DELAY_MS,
  WalkthroughProvider,
} from '@/features/walkthrough/application/walkthrough-provider';
import { planTour, type TourTargetId } from '@/features/walkthrough/domain/walkthrough-steps';
import { WalkthroughOverlay } from '@/features/walkthrough/presentation/walkthrough-overlay';
import { LocalizationContext } from '@/localization/localization-context';
import { messages, type SupportedLanguage } from '@/localization/messages';
import { darkTheme, lightTheme, type KuyaraTheme } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

jest.mock('@expo/ui', () => jest.requireActual('@/components/ui/__tests__/expo-ui-test-mock'));
jest.mock('@expo/ui/swift-ui', () => jest.requireActual('@/components/ui/__tests__/expo-ui-test-mock'));
jest.mock('@expo/ui/swift-ui/modifiers', () =>
  jest.requireActual('@/components/ui/__tests__/expo-ui-test-mock'));
jest.mock('@expo/ui/community/bottom-sheet', () => ({ BottomSheet: () => null }));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { version: '1.0.0' }, platform: { ios: { buildNumber: '16' } } },
}));
let mockPathname = '/';
jest.mock('expo-router', () => ({
  router: { back: jest.fn(), dismissAll: jest.fn(), navigate: jest.fn() },
  usePathname: () => mockPathname,
}));

const initialMetrics = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
  insets: { top: 59, right: 0, bottom: 34, left: 0 },
};

beforeEach(() => {
  jest.useFakeTimers();
  mockPathname = '/';
});
afterEach(() => {
  jest.useRealTimers();
});

function shell(children: ReactNode, language: SupportedLanguage = 'en', theme: KuyaraTheme = lightTheme) {
  return (
    <LocalizationContext value={{ language, messages: messages[language], hour12: false }}>
      <KuyaraThemeContext.Provider value={theme}>
        <SafeAreaProvider initialMetrics={initialMetrics}>{children}</SafeAreaProvider>
      </KuyaraThemeContext.Provider>
    </LocalizationContext>
  );
}

const rect = (x: number, y: number, width: number, height: number): TourRect => ({ x, y, width, height });

function handle(frame: TourRect, extra: Readonly<{ label?: string; name?: string }> = {}): TourTargetHandle {
  return { measure: async () => frame, label: () => extra.label, name: () => extra.name };
}

// The frames each screen would register, as a 393 by 852 point iPhone draws them.
const screenTargets: Readonly<Partial<Record<TourTargetId, TourTargetHandle>>> = {
  outfit: handle(rect(16, 190, 361, 330), { label: 'Smart Casual. Sweater, jeans, loafers.' }),
  piece: handle(rect(16, 300, 361, 80), { label: 'Sweater, Top, not in your Closet', name: 'Sweater' }),
  worn: handle(rect(16, 250, 361, 56)),
  again: handle(rect(16, 700, 361, 50)),
  'closet-head': handle(rect(16, 160, 361, 44)),
  rack: handle(rect(16, 212, 361, 220)),
  history: handle(rect(16, 600, 361, 52)),
};
const sheetTargets: Readonly<Partial<Record<TourTargetId, TourTargetHandle>>> = {
  'sheet-area': handle(rect(16, 440, 361, 300)),
  'sheet-close': handle(rect(16, 440, 44, 44), { label: 'Close' }),
};

function screenRegistry({ badge = true } = {}) {
  const registry = new TourTargetRegistry();
  if (badge) registry.register('badge', handle(rect(16, 150, 180, 28)));
  for (const [id, target] of Object.entries(screenTargets)) {
    registry.register(id as TourTargetId, target as TourTargetHandle);
  }
  return registry;
}

function Harness({ controller, registry }: Readonly<{ controller: WalkthroughController; registry: TourTargetRegistry }>) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  return (
    <WalkthroughOverlay
      onActivateLive={() => controller.activateLive()}
      onContinue={() => controller.continue()}
      onSkip={() => controller.skip()}
      registry={registry}
      state={state}
    />
  );
}

async function settle(result: Awaited<ReturnType<typeof render>>, ms = 1_200) {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
  // The bubble is laid out unseen first; lay both sizes out, then let it arrive.
  for (const variant of ['normal', 'tight'] as const) {
    const measurer = result.queryByTestId(`walkthrough-bubble-measure-${variant}`, { includeHiddenElements: true });
    if (measurer) {
      await act(async () => {
        fireEvent(measurer, 'layout', { nativeEvent: { layout: { height: variant === 'normal' ? 170 : 158 } } });
      });
    }
  }
  await act(async () => {
    await jest.advanceTimersByTimeAsync(300);
  });
}

function setup({
  badge = true,
  language = 'en' as SupportedLanguage,
  theme = lightTheme as KuyaraTheme,
}: Readonly<{ badge?: boolean; language?: SupportedLanguage; theme?: KuyaraTheme }> = {}) {
  const writes: string[] = [];
  const controller = new WalkthroughController();
  controller.setGateWriter(async () => { writes.push('walkthrough_version = 1'); });
  const registry = screenRegistry({ badge });
  return { controller, registry, writes, language, theme };
}

async function renderTour(options: Parameters<typeof setup>[0] = {}) {
  const context = setup(options);
  const result = await render(shell(
    <Harness controller={context.controller} registry={context.registry} />,
    context.language,
    context.theme,
  ));
  return { ...context, result };
}

const bubble = (result: Awaited<ReturnType<typeof render>>) => ({
  title: result.getByTestId('walkthrough-title').props.children as string,
  body: within(result.getByTestId('walkthrough-bubble')).getByTestId('walkthrough-body'),
  counter: result.getByTestId('walkthrough-counter').props.children as string,
});

const textOf = (element: { props: { children?: unknown } }): string => {
  const { children } = element.props;
  const parts = Array.isArray(children) ? children : [children];
  return parts.map((part) => (typeof part === 'string'
    ? part
    : part && typeof part === 'object' && 'props' in part
      ? textOf(part as { props: { children?: unknown } })
      : '')).join('');
};

// What the screens and the person do to move from one step to the next: the live control's
// own navigation (observed by the provider in the app) or Continue.
function tourMoves(context: Awaited<ReturnType<typeof renderTour>>) {
  const { controller, registry, result } = context;
  return [
    () => controller.observeRoute('detail'),
    () => {
      for (const [id, target] of Object.entries(sheetTargets)) registry.register(id as TourTargetId, target as TourTargetHandle);
      controller.observeSheet(true);
    },
    () => controller.observeSheet(false),
    () => fireEvent.press(result.getByTestId('walkthrough-continue')),
    () => controller.observeRoute('today'),
    () => fireEvent.press(result.getByTestId('walkthrough-continue')),
    () => controller.observeRoute('profile'),
    () => fireEvent.press(result.getByTestId('walkthrough-continue')),
  ];
}

async function walkTo(context: Awaited<ReturnType<typeof renderTour>>, stepIndex: number) {
  for (const move of tourMoves(context).slice(0, stepIndex)) {
    await act(async () => { move(); });
    await settle(context.result);
  }
}

test('step 1 lights the badge and outfit, rings the outfit and names the badge (EN, light)', async () => {
  const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
  const context = await renderTour();
  await act(async () => { context.controller.start('auto'); });
  await settle(context.result);
  const { result } = context;

  expect(bubble(result).title).toBe('Your outfit for today');
  expect(textOf(bubble(result).body)).toBe(messages.en.walkthrough.steps.outfit.body);
  expect(bubble(result).counter).toBe('Step 1 of 9');
  // A tap step has no Continue: the live control is the way on, and Skip is always there.
  expect(result.queryByTestId('walkthrough-continue')).toBeNull();
  expect(result.getByTestId('walkthrough-skip')).toBeOnTheScreen();
  expect(result.getByLabelText('Skip')).toBeOnTheScreen();
  const live = result.getByTestId('walkthrough-live-target');
  expect(live.props.accessibilityLabel).toBe('Smart Casual. Sweater, jeans, loafers.');
  expect(live.props.accessibilityHint).toBe('Tour. Opens the next step.');
  expect(live.props.pointerEvents).toBe('none');
  // Four blocking views leave the outfit card as the one gap.
  expect(result.getAllByTestId('walkthrough-blocker')).toHaveLength(4);
  expect(result.getByTestId('coach-mark-ring')).toBeOnTheScreen();
  expect(announce).toHaveBeenCalledWith(expect.stringContaining('Your outfit for today.'));
  announce.mockRestore();
});

test('step 1 drops the badge sentence when Today shows no badge', async () => {
  const context = await renderTour({ badge: false });
  await act(async () => { context.controller.start('auto'); });
  await settle(context.result);
  expect(textOf(bubble(context.result).body)).toBe(
    'kuyara chose it for today’s weather. Tap the outfit to see its pieces.',
  );
});

test('the tour speaks Turkish in Turkish (TR, dark)', async () => {
  const context = await renderTour({ language: 'tr', theme: darkTheme });
  await act(async () => { context.controller.start('auto'); });
  await settle(context.result);
  const { result } = context;
  expect(bubble(result).title).toBe('Bugünkü kombinin');
  expect(textOf(bubble(result).body)).toBe(messages.tr.walkthrough.steps.outfit.body);
  expect(bubble(result).counter).toBe('Adım 1/9');
  expect(result.getByLabelText('Geç')).toBeOnTheScreen();
  expect(result.getByTestId('walkthrough-live-target').props.accessibilityHint)
    .toBe('Tur. Sonraki adımı açar.');
  await walkTo(context, 1);
  // The piece is named by the row's catalog name as a whole word ("Sweater" in the fixture).
  expect(textOf(bubble(result).body)).toBe(
    'Her parçanın adı yanında yazar. Tek başına görmek için Sweater parçasına dokun.',
  );
});

test('the tour advances on the live control\'s navigation and on Continue, and Done stores the gate once', async () => {
  const context = await renderTour();
  const { controller, result, writes } = context;
  await act(async () => { controller.start('auto'); });
  await settle(result);

  const seen: [string, string, boolean][] = [];
  const record = () => seen.push([
    bubble(result).counter,
    bubble(result).title,
    result.queryByTestId('walkthrough-continue') !== null,
  ]);
  record();
  for (const move of tourMoves(context)) {
    await act(async () => { move(); });
    await settle(result);
    record();
  }
  expect(seen).toEqual([
    ['Step 1 of 9', 'Your outfit for today', false],
    ['Step 2 of 9', 'Every piece by name', false],
    ['Step 3 of 9', 'Mark what you own or want', false],
    ['Step 4 of 9', 'On the day you wear it', true],
    ['Step 5 of 9', 'Back to Today', false],
    ['Step 6 of 9', 'If your day changes', true],
    ['Step 7 of 9', 'Your Closet and History', false],
    ['Step 8 of 9', 'Your Closet', true],
    ['Step 9 of 9', 'History', true],
  ]);
  expect(writes).toEqual([]);
  const done = result.getByTestId('walkthrough-continue');
  expect(done.props.accessibilityLabel).toBe('Done');
  await act(async () => { fireEvent.press(done); });
  await act(async () => { await jest.advanceTimersByTimeAsync(400); });
  expect(writes).toEqual(['walkthrough_version = 1']);
  expect(result.queryByTestId('walkthrough-skip')).toBeNull();
});

// A native view reports its layout when it mounts and when its size changes, never for new
// content of the same size. At the largest standard text size step 9's tight bubble came out
// exactly as tall as step 8's, so a measurer kept across steps never reported again and the
// card never arrived. Each step lays its bubble out in freshly mounted measurers.
test('a step whose bubble lays out at the last step\'s height still arrives', async () => {
  const context = await renderTour();
  const { controller, result } = context;
  await act(async () => { controller.start('auto'); });
  await settle(result);
  await walkTo(context, 7);
  expect(bubble(result).counter).toBe('Step 8 of 9');
  const measurers = () => (['normal', 'tight'] as const).map((variant) => (
    result.getByTestId(`walkthrough-bubble-measure-${variant}`, { includeHiddenElements: true })
  ));
  const laidOut = measurers();

  await act(async () => { fireEvent.press(result.getByTestId('walkthrough-continue')); });
  await act(async () => { await jest.advanceTimersByTimeAsync(1_200); });
  for (const measurer of measurers()) {
    if (laidOut.includes(measurer)) continue;
    const variant = measurer.props.testID.endsWith('tight') ? 'tight' : 'normal';
    await act(async () => {
      fireEvent(measurer, 'layout', { nativeEvent: { layout: { height: variant === 'normal' ? 170 : 158 } } });
    });
  }
  await act(async () => { await jest.advanceTimersByTimeAsync(300); });

  expect(bubble(result)).toMatchObject({ counter: 'Step 9 of 9', title: 'History' });
});

test('a look step blocks every touch, shows no ring and is announced', async () => {
  const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
  const context = await renderTour();
  await act(async () => { context.controller.start('auto'); });
  await settle(context.result);
  await walkTo(context, 3);
  expect(bubble(context.result).counter).toBe('Step 4 of 9');
  expect(context.result.getAllByTestId('walkthrough-blocker')).toHaveLength(1);
  expect(context.result.queryByTestId('walkthrough-live-target')).toBeNull();
  expect(context.result.queryByTestId('coach-mark-ring')).toBeNull();
  expect(announce).toHaveBeenLastCalledWith(expect.stringContaining('On the day you wear it.'));
  announce.mockRestore();
});

for (let stepIndex = 0; stepIndex < 9; stepIndex += 1) {
  test(`Skip on step ${stepIndex + 1} closes the offered tour and stores the gate once`, async () => {
    const context = await renderTour();
    await act(async () => { context.controller.start('auto'); });
    await settle(context.result);
    await walkTo(context, stepIndex);
    expect(bubble(context.result).counter).toBe(`Step ${stepIndex + 1} of 9`);
    await act(async () => { fireEvent.press(context.result.getByTestId('walkthrough-skip')); });
    await act(async () => { await jest.advanceTimersByTimeAsync(400); });
    expect(context.writes).toEqual(['walkthrough_version = 1']);
    expect(context.controller.getSnapshot().status).toBe('idle');
    expect(context.result.queryByTestId('walkthrough-skip')).toBeNull();
  });
}

test('the Help row\'s tour never writes the gate, on Skip or on Done', async () => {
  const context = await renderTour();
  await act(async () => { context.controller.start('manual'); });
  await settle(context.result);
  await act(async () => { fireEvent.press(context.result.getByTestId('walkthrough-skip')); });
  await act(async () => { await jest.advanceTimersByTimeAsync(400); });
  await act(async () => { context.controller.start('manual'); });
  await settle(context.result);
  await walkTo(context, 8);
  await act(async () => { fireEvent.press(context.result.getByTestId('walkthrough-continue')); });
  await act(async () => { await jest.advanceTimersByTimeAsync(400); });
  expect(context.writes).toEqual([]);
});

// Review finding 1: VoiceOver's activation cannot reach a control under the overlay, so the
// stand-in performs the live control's own action through the controller.
test('VoiceOver activating the stand-in advances every tap and back step', async () => {
  const context = await renderTour();
  const { controller, registry, result } = context;
  // Each live control's own navigation, as the screens and the router would land it.
  const performed: TourTargetId[] = [];
  controller.setActivator((id) => {
    performed.push(id);
    if (id === 'outfit') controller.observeRoute('detail');
    if (id === 'piece') {
      for (const [target, handleValue] of Object.entries(sheetTargets)) {
        registry.register(target as TourTargetId, handleValue as TourTargetHandle);
      }
      controller.observeSheet(true);
    }
    if (id === 'sheet-close') controller.observeSheet(false);
    if (id === 'nav-back') controller.observeRoute('today');
    if (id === 'tab-profile') controller.observeRoute('profile');
  });
  await act(async () => { controller.start('auto'); });
  await settle(result);
  const activate = async () => {
    await act(async () => {
      fireEvent(result.getByTestId('walkthrough-live-target'), 'accessibilityAction', {
        nativeEvent: { actionName: 'activate' },
      });
    });
    await settle(result);
  };
  const counters: string[] = [bubble(result).counter];
  await activate(); counters.push(bubble(result).counter);
  await activate(); counters.push(bubble(result).counter);
  await activate(); counters.push(bubble(result).counter);
  await act(async () => { fireEvent.press(result.getByTestId('walkthrough-continue')); });
  await settle(result);
  await activate(); counters.push(bubble(result).counter);
  await act(async () => { fireEvent.press(result.getByTestId('walkthrough-continue')); });
  await settle(result);
  await activate(); counters.push(bubble(result).counter);
  expect(performed).toEqual(['outfit', 'piece', 'sheet-close', 'nav-back', 'tab-profile']);
  expect(counters).toEqual(['Step 1 of 9', 'Step 2 of 9', 'Step 3 of 9', 'Step 4 of 9', 'Step 6 of 9', 'Step 8 of 9']);
  // A look step has nothing live, so no stand-in to activate.
  expect(result.queryByTestId('walkthrough-live-target')).toBeNull();
});

test('the stand-in performs a screen\'s registered action, the system back or the Profile tab', () => {
  const registry = new TourTargetRegistry();
  const outfit = jest.fn();
  registry.register('outfit', { ...handle(rect(0, 0, 10, 10)), activate: outfit });
  const navigation = { back: jest.fn(), navigate: jest.fn() };
  activateTourControl('outfit', registry, navigation);
  activateTourControl('nav-back', registry, navigation);
  activateTourControl('tab-profile', registry, navigation);
  expect(outfit).toHaveBeenCalledTimes(1);
  expect(navigation.back).toHaveBeenCalledTimes(1);
  expect(navigation.navigate).toHaveBeenCalledWith('/profile');
});

// Build 16, step 3: the piece sheet lays its content out only after it mounts. The tour
// measured the step as soon as the sheet's Close registered, before the sheet knew where it
// starts, and the frame that came later told it nothing: the bubble centred over the sheet.
test('the piece sheet offers Close and its area only once it has laid out, and again when it moves', async () => {
  // The Simulator's frames: the sheet's content 16 points under its top, Close 16 in.
  let sheetFrame: TourRect | null = null;
  const measure = jest.spyOn(View.prototype as unknown as { measureInWindow: View['measureInWindow'] }, 'measureInWindow')
    .mockImplementation(function measureInWindow(this: View, callback) {
      const props = (this as unknown as { props: { testID?: string; children?: { props?: { testID?: string } } } }).props;
      if (props.testID === 'walkthrough-sheet-scope') {
        const frame = sheetFrame ?? rect(0, 0, 0, 0);
        callback(frame.x, frame.y, frame.width, frame.height);
      } else if (props.children?.props?.testID === 'sheet-close-control') {
        callback(16, 16, 44, 44);
      }
    });
  const registry = new TourTargetRegistry();
  const emitted: TourTargetId[] = [];
  registry.subscribe((id) => emitted.push(id));
  const walkthrough = { active: true, sheetStep: true, restart: () => undefined, reportToday: () => undefined };
  const result = await render(shell(
    <TourTargetsContext value={registry}>
      <WalkthroughContext value={walkthrough}>
        <TourSheetScope>
          <TourTarget id="sheet-close" label="Close"><View testID="sheet-close-control" /></TourTarget>
        </TourSheetScope>
      </WalkthroughContext>
    </TourTargetsContext>,
  ));
  const window = Dimensions.get('window');
  const layout = async (frame: TourRect) => {
    sheetFrame = frame;
    await act(async () => {
      fireEvent(result.getByTestId('walkthrough-sheet-scope'), 'layout', {
        nativeEvent: { layout: { x: 0, y: 0, width: frame.width, height: frame.height } },
      });
    });
  };

  // Mounted, and laid out before the sheet has a size: nothing for the tour to measure yet.
  await layout(rect(0, 0, 0, 0));
  expect(registry.has('sheet-close')).toBe(false);
  expect(registry.has('sheet-area')).toBe(false);

  // At the medium detent the sheet starts under its 373 points, the bottom inset and the edge.
  await layout(rect(0, 16, 393, 373));
  const mediumTop = window.height - 8 - 34 - (16 + 373);
  expect(await registry.get('sheet-area')?.measure()).toEqual(rect(0, mediumTop, window.width, window.height - mediumTop));
  expect(await registry.get('sheet-close')?.measure()).toEqual(rect(16, mediumTop + 16, 44, 44));

  // Dragged to the large detent: the area registers again, so a shown step measures again.
  emitted.length = 0;
  await layout(rect(0, 16, 393, 740));
  const largeTop = window.height - 8 - 34 - (16 + 740);
  expect(emitted).toContain('sheet-area');
  expect(await registry.get('sheet-area')?.measure()).toEqual(rect(0, largeTop, window.width, window.height - largeTop));
  expect(await registry.get('sheet-close')?.measure()).toEqual(rect(16, largeTop + 16, 44, 44));
  measure.mockRestore();
});

// Review finding 3: exhausted recommendations draw no "Ask the stylist again".
test('without Ask the stylist again the tour skips step 6 and counts eight steps', async () => {
  const context = await renderTour();
  const { controller, registry, result } = context;
  registry.register('again', { ...handle(rect(0, 0, 0, 0)) })();
  expect(registry.has('again')).toBe(false);
  await act(async () => { controller.start('auto', planTour((id) => registry.has(id))); });
  await settle(result);
  expect(bubble(result).counter).toBe('Step 1 of 8');
  const seen: string[] = [];
  const moves = tourMoves(context);
  // Moves 1 to 5 reach the back step; its pop lands on the Profile tab step, not step 6.
  for (const move of [...moves.slice(0, 5), moves[6], moves[7]]) {
    await act(async () => { move(); });
    await settle(result);
    seen.push(`${bubble(result).counter} ${bubble(result).title}`);
  }
  expect(seen).toEqual([
    'Step 2 of 8 Every piece by name',
    'Step 3 of 8 Mark what you own or want',
    'Step 4 of 8 On the day you wear it',
    'Step 5 of 8 Back to Today',
    'Step 6 of 8 Your Closet and History',
    'Step 7 of 8 Your Closet',
    'Step 8 of 8 History',
  ]);
  expect(result.getByTestId('walkthrough-continue').props.accessibilityLabel).toBe('Done');
  await act(async () => { fireEvent.press(result.getByTestId('walkthrough-continue')); });
  await act(async () => { await jest.advanceTimersByTimeAsync(400); });
  expect(context.writes).toEqual(['walkthrough_version = 1']);
});

// --- The provider: when the tour opens --------------------------------------------------

function profile(overrides: Partial<LocalProfile> = {}): LocalProfile {
  return {
    id: 'profile-id',
    gender: 'woman',
    clothingPreference: 'womens',
    dressStyle: 'smart',
    styleAesthetics: [],
    morningSheetEnabled: true,
    easierToSee: false,
    birthDate: null,
    displayName: null,
    namePromptVersion: 1,
    walkthroughVersion: 0,
    languagePreference: 'en',
    themePreference: 'light',
    onboardingCompleted: true,
    notificationsOptIn: false,
    weatherAlertOfferShown: false,
    morningBriefingOptIn: false,
    analyticsConsent: 'granted',
    createdAt: '2026-09-01T08:00:00.000Z',
    updatedAt: '2026-09-01T08:00:00.000Z',
    ...overrides,
  };
}

function profileValue(value: LocalProfile, markWalkthroughSeen: jest.Mock): ProfileApplicationValue {
  const noop = async () => undefined;
  return {
    state: { status: 'ready', profile: value, isSaving: false },
    retry: noop,
    completeOnboarding: noop,
    updateGender: noop,
    updateDressStyle: noop,
    updateBirthDate: noop,
    updateDisplayName: noop,
    updateLanguagePreference: noop,
    updateThemePreference: noop,
    updateNotificationsOptIn: noop,
    updateMorningBriefingOptIn: noop,
    markWeatherAlertOfferShown: noop,
    updateAnalyticsConsent: noop,
    markWalkthroughSeen,
  };
}

// The Help row's action, as Today's probe last received it.
const probe: { restart: (() => void) | null; registry: TourTargetRegistry | null } = {
  restart: null,
  registry: null,
};

// Stands in for Today: registers its outfit (and Ask the stylist again unless exhausted) and
// reports its facts.
function TodayProbe({ exhausted, facts }: Readonly<{ exhausted: boolean; facts: WalkthroughTodayFacts }>) {
  const walkthrough = useWalkthrough();
  const registry = use(TourTargetsContext);
  useEffect(() => registry?.register('outfit', screenTargets.outfit as TourTargetHandle), [registry]);
  useEffect(() => (exhausted ? undefined : registry?.register('again', screenTargets.again as TourTargetHandle)),
    [exhausted, registry]);
  useEffect(() => { walkthrough?.reportToday(facts); }, [facts, walkthrough]);
  useEffect(() => { probe.restart = walkthrough?.restart ?? null; }, [walkthrough]);
  useEffect(() => { probe.registry = registry ?? null; }, [registry]);
  return null;
}

const settledToday: WalkthroughTodayFacts = { settled: true, overlayOpen: false, dayQuestion: false, namePrompt: false };

async function renderProvider({
  exhausted = false,
  facts = settledToday,
  openedNotifications = 0,
  sessionIndex = 1,
  value = profile(),
}: Readonly<{
  exhausted?: boolean;
  facts?: WalkthroughTodayFacts;
  openedNotifications?: number;
  sessionIndex?: number;
  value?: LocalProfile;
}> = {}) {
  const markWalkthroughSeen = jest.fn(async () => undefined);
  const tree = (current: LocalProfile, currentFacts: WalkthroughTodayFacts, opened: number) => shell(
    <ProfileApplicationContext value={profileValue(current, markWalkthroughSeen)}>
      <NotificationApplicationContext
        value={{ openedNotifications: opened } as unknown as NotificationApplicationValue}>
        <WalkthroughProvider sessionIndex={sessionIndex}>
          <TodayProbe exhausted={exhausted} facts={currentFacts} />
        </WalkthroughProvider>
      </NotificationApplicationContext>
    </ProfileApplicationContext>,
  );
  const result = await render(tree(value, facts, openedNotifications));
  const rerender = async (next: LocalProfile, nextFacts = facts, nextOpened = openedNotifications) => {
    await act(async () => { await result.rerender(tree(next, nextFacts, nextOpened)); });
  };
  return { markWalkthroughSeen, result, rerender };
}

async function waitOpen(result: Awaited<ReturnType<typeof render>>) {
  await settle(result, WALKTHROUGH_OPEN_DELAY_MS + 1_000);
}

test('an existing user\'s quiet launch opens the tour over a settled Today, and Skip stores the gate', async () => {
  const { markWalkthroughSeen, result } = await renderProvider();
  await act(async () => { await jest.advanceTimersByTimeAsync(WALKTHROUGH_OPEN_DELAY_MS - 100); });
  expect(result.queryByTestId('walkthrough-skip')).toBeNull();
  await waitOpen(result);
  expect(bubble(result).counter).toBe('Step 1 of 9');
  await act(async () => { fireEvent.press(result.getByTestId('walkthrough-skip')); });
  await act(async () => { await jest.advanceTimersByTimeAsync(400); });
  expect(markWalkthroughSeen).toHaveBeenCalledTimes(1);
});

test.each([
  ['an outfit that has not settled (runway, refresh, regeneration)', { ...settledToday, settled: false }],
  ['a sheet or prompt over Today', { ...settledToday, overlayOpen: true }],
] as const)('the tour does not open over %s, and opens once it has gone', async (_, facts) => {
  const { rerender, result } = await renderProvider({ facts });
  await waitOpen(result);
  expect(result.queryByTestId('walkthrough-skip')).toBeNull();
  await rerender(profile(), settledToday);
  await waitOpen(result);
  expect(bubble(result).counter).toBe('Step 1 of 9');
});

test('the tour opens only on Today', async () => {
  const { rerender, result } = await renderProvider({ facts: { ...settledToday, settled: false } });
  mockPathname = '/profile';
  await rerender(profile(), settledToday);
  await waitOpen(result);
  expect(result.queryByTestId('walkthrough-skip')).toBeNull();
  mockPathname = '/';
  await rerender(profile(), settledToday);
  await waitOpen(result);
  expect(bubble(result).counter).toBe('Step 1 of 9');
});

// Each closed case below proves the harness can open: the Help row's tour then opens.
async function expectOnlyHelpOpens(result: Awaited<ReturnType<typeof render>>) {
  await waitOpen(result);
  expect(result.queryByTestId('walkthrough-skip')).toBeNull();
  await act(async () => { probe.restart?.(); });
  await waitOpen(result);
  expect(bubble(result).counter).toBe('Step 1 of 9');
}

test('a stored gate keeps the offered tour closed', async () => {
  const { result } = await renderProvider({ value: profile({ walkthroughVersion: 1 }) });
  await expectOnlyHelpOpens(result);
});

test.each([
  ['the morning or evening day-type question', { facts: { ...settledToday, dayQuestion: true } }],
  ['the name prompt', { facts: { ...settledToday, namePrompt: true } }],
  ['the analytics consent sheet', { value: profile({ analyticsConsent: 'undecided' }), sessionIndex: 2 }],
  ['an opened notification', { openedNotifications: 1 }],
] as const)('one overlay per launch: a launch %s claims waits for the next quiet one', async (_, options) => {
  const { result } = await renderProvider(options);
  await expectOnlyHelpOpens(result);
});

test('a deep-link launch never gets the tour, even back on Today', async () => {
  mockPathname = '/settings';
  const deepLink = await renderProvider();
  mockPathname = '/';
  await deepLink.rerender(profile());
  await expectOnlyHelpOpens(deepLink.result);
});

test('the consent sheet claims only a launch it will ask in', async () => {
  // Consent is asked from the second session on, so an undecided first session stays quiet.
  const { result } = await renderProvider({ value: profile({ analyticsConsent: 'undecided' }), sessionIndex: 1 });
  await waitOpen(result);
  expect(bubble(result).counter).toBe('Step 1 of 9');
});

test('a new user gets the tour in the onboarding session once the first outfit arrives', async () => {
  const { result, rerender } = await renderProvider({
    value: profile({ onboardingCompleted: false }),
    facts: { ...settledToday, settled: false },
  });
  await waitOpen(result);
  expect(result.queryByTestId('walkthrough-skip')).toBeNull();
  // Onboarding done, the morning question answered, the runway gone: the outfit has arrived.
  await rerender(profile(), { ...settledToday, dayQuestion: true });
  await waitOpen(result);
  expect(bubble(result).counter).toBe('Step 1 of 9');
});

test('the Help row restarts the tour from step 1 over Today without touching the gate', async () => {
  const { markWalkthroughSeen, result } = await renderProvider({
    value: profile({ walkthroughVersion: 1 }),
    openedNotifications: 1,
  });
  await waitOpen(result);
  expect(result.queryByTestId('walkthrough-skip')).toBeNull();
  await act(async () => { probe.restart?.(); });
  await waitOpen(result);
  expect(bubble(result).counter).toBe('Step 1 of 9');
  await act(async () => { fireEvent.press(result.getByTestId('walkthrough-skip')); });
  await act(async () => { await jest.advanceTimersByTimeAsync(400); });
  expect(markWalkthroughSeen).not.toHaveBeenCalled();
  // One overlay per launch: the offered tour does not follow it in the same launch.
  await waitOpen(result);
  expect(result.queryByTestId('walkthrough-skip')).toBeNull();
});

test.each([
  ['with Ask the stylist again on Today', false, 'Step 1 of 9'],
  ['with recommendations exhausted', true, 'Step 1 of 8'],
] as const)('the provider plans the tour %s', async (_, exhausted, counter) => {
  const { result } = await renderProvider({ exhausted });
  await waitOpen(result);
  expect(bubble(result).counter).toBe(counter);
});

// Review finding 2: a notification opened mid-tour takes over; the tour ends and stores
// nothing, so it starts over at the next quiet launch.
test('a notification opened during the tour ends it without storing the gate', async () => {
  const { markWalkthroughSeen, rerender, result } = await renderProvider();
  await waitOpen(result);
  expect(bubble(result).counter).toBe('Step 1 of 9');
  await rerender(profile(), settledToday, 1);
  await act(async () => { await jest.advanceTimersByTimeAsync(400); });
  expect(result.queryByTestId('walkthrough-skip')).toBeNull();
  expect(markWalkthroughSeen).not.toHaveBeenCalled();
  // The launch is now claimed: the offered tour does not come back in it.
  await waitOpen(result);
  expect(result.queryByTestId('walkthrough-skip')).toBeNull();
});

test('a notification opened during the Help row\'s tour ends it too', async () => {
  const { markWalkthroughSeen, rerender, result } = await renderProvider({ value: profile({ walkthroughVersion: 1 }) });
  await act(async () => { probe.restart?.(); });
  await waitOpen(result);
  expect(bubble(result).counter).toBe('Step 1 of 9');
  await rerender(profile({ walkthroughVersion: 1 }), settledToday, 1);
  await act(async () => { await jest.advanceTimersByTimeAsync(400); });
  expect(result.queryByTestId('walkthrough-skip')).toBeNull();
  expect(markWalkthroughSeen).not.toHaveBeenCalled();
});

// Item 12: the Help row's request is "start the tour now over Today". If Today cannot host it
// and the person leaves, the request lapses; it must not open the tour unprompted later.
test('a Help restart the person walked away from does not open the tour when Today settles later', async () => {
  const { rerender, result } = await renderProvider({
    facts: { ...settledToday, settled: false },
    value: profile({ walkthroughVersion: 1 }),
  });
  mockPathname = '/settings';
  await act(async () => { probe.restart?.(); });
  // Settings, Help then lands on Today, which is not settled, and the person moves on.
  mockPathname = '/';
  await rerender(profile({ walkthroughVersion: 1 }), { ...settledToday, settled: false });
  mockPathname = '/weather';
  await rerender(profile({ walkthroughVersion: 1 }), { ...settledToday, settled: false });
  mockPathname = '/';
  await rerender(profile({ walkthroughVersion: 1 }), settledToday);
  await waitOpen(result);
  expect(result.queryByTestId('walkthrough-skip')).toBeNull();
});

test('a Help restart still opens once the Today it landed on settles', async () => {
  const { rerender, result } = await renderProvider({
    facts: { ...settledToday, settled: false },
    value: profile({ walkthroughVersion: 1 }),
  });
  mockPathname = '/settings';
  await act(async () => { probe.restart?.(); });
  mockPathname = '/';
  await rerender(profile({ walkthroughVersion: 1 }), { ...settledToday, settled: false });
  await rerender(profile({ walkthroughVersion: 1 }), settledToday);
  await waitOpen(result);
  expect(bubble(result).counter).toBe('Step 1 of 9');
});

// Item 11: Profile keeps its own stack, so the Profile tab can land on Settings, the Closet
// or History. Step 7 must still reach Profile's root, where steps 8 and 9 have their targets.
test('a Profile tab that restores a retained sub-screen is reset to Profile\'s root instead of ending the tour', async () => {
  const { rerender, result } = await renderProvider({ value: profile({ walkthroughVersion: 1 }) });
  const router = jest.requireMock('expo-router').router as { dismissAll: jest.Mock };
  router.dismissAll.mockClear();
  const go = async (pathname: string) => {
    mockPathname = pathname;
    await rerender(profile({ walkthroughVersion: 1 }));
    await settle(result);
  };
  const next = async () => {
    await act(async () => { fireEvent.press(result.getByTestId('walkthrough-continue')); });
    await settle(result);
  };
  await act(async () => {
    // The targets the other screens of the tour would register.
    for (const id of ['piece', 'worn', 'closet-head', 'rack', 'history'] as const) {
      probe.registry?.register(id, screenTargets[id] as TourTargetHandle);
    }
    probe.restart?.();
  });
  await waitOpen(result);
  await go('/opt-3f2a');
  let unregisterSheet: (() => void)[] = [];
  await act(async () => {
    unregisterSheet = Object.entries(sheetTargets).map(([id, target]) =>
      probe.registry!.register(id as TourTargetId, target as TourTargetHandle));
  });
  await settle(result);
  await act(async () => { unregisterSheet.forEach((unregister) => unregister()); });
  await settle(result);
  await next();
  await go('/');
  await next();
  expect(bubble(result).counter).toBe('Step 7 of 9');

  await go('/settings');
  expect(router.dismissAll).toHaveBeenCalledTimes(1);
  expect(bubble(result).counter).toBe('Step 7 of 9');
  await go('/profile');
  expect(bubble(result).counter).toBe('Step 8 of 9');
});

// --- Settings, Help --------------------------------------------------------------------------

test.each(['en', 'tr'] as const)('Settings, Help carries the tour row in %s and it never writes', async (language) => {
  const onRestartTour = jest.fn();
  const noop = async () => undefined;
  const result = await render(shell(
    <SettingsScreen
      isSaving={false}
      notificationsOn={false}
      onAppearanceChange={noop}
      onDressStyleChange={noop}
      onGenderChange={noop}
      onLanguageChange={noop}
      onMorningSheetEnabledChange={noop}
      onNameChange={noop}
      onOpenBirthDate={jest.fn()}
      onOpenEasierToSee={jest.fn()}
      onOpenLicence={jest.fn()}
      onOpenNotifications={jest.fn()}
      onOpenPrivacy={jest.fn()}
      onOpenServiceProviders={jest.fn()}
      onOpenSupport={jest.fn()}
      onRate={jest.fn()}
      onRestartTour={onRestartTour}
      onShare={jest.fn()}
      onStyleAestheticsChange={noop}
      profile={profile({ languagePreference: language })}
      showRate
    />,
    language,
  ));
  const help = within(result.getByTestId('settings-help-group'));
  expect(help.getByText(language === 'en'
    ? 'Get to know kuyara step by step'
    : 'kuyara’yı adım adım tanı')).toBeTruthy();
  await act(async () => { fireEvent.press(help.getByTestId('settings-walkthrough-row')); });
  expect(onRestartTour).toHaveBeenCalledTimes(1);
});
