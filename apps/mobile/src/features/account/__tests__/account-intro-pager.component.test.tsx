import { act, fireEvent, render, within, type RenderResult } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { AccessibilityInfo, AppState, ScrollView, type AppStateStatus } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import {
  ACCOUNT_INTRO_PAGE_DWELL_MS,
  accountIntroPageIds,
  type AccountIntroPageId,
} from '@/features/account/application/account-intro-pages';
import { ACCOUNT_SCREENS_ENABLED } from '@/features/account/application/account-screens-flag';
import { AccountIntroPager } from '@/features/account/presentation/account-intro-pager';
import { LocalizationContext } from '@/localization/localization-context';
import { messages, type SupportedLanguage } from '@/localization/messages';
import { lightTheme } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

jest.mock('@expo/ui', () => jest.requireActual('@/components/ui/__tests__/expo-ui-test-mock'));
jest.mock('@expo/ui/swift-ui', () => jest.requireActual('@/components/ui/__tests__/expo-ui-test-mock'));
jest.mock('@expo/ui/swift-ui/modifiers', () => jest.requireActual('@/components/ui/__tests__/expo-ui-test-mock'));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('@expo/ui/community/bottom-sheet', () => ({
  BottomSheet: ({ children }: PropsWithChildren) => children,
}));

const en = messages.en.account.signIn;

async function renderPager(language: SupportedLanguage = 'en', initialPage?: AccountIntroPageId): Promise<RenderResult> {
  const screen = await render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 59, right: 0, bottom: 34, left: 0 } }}>
      <LocalizationContext.Provider value={{ language, messages: messages[language], hour12: false }}>
        <KuyaraThemeContext.Provider value={lightTheme}>
          <AccountIntroPager initialPage={initialPage} />
        </KuyaraThemeContext.Provider>
      </LocalizationContext.Provider>
    </SafeAreaProvider>,
  );
  // The pages measure the sheet before they draw or move.
  await fireEvent(screen.getByTestId('account-intro-pages').parent!, 'layout', {
    nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 400 } },
  });
  return screen;
}

const dots = (screen: RenderResult) => screen.getByTestId('account-intro-dots');
// The spoken name of the dot whose page shows.
const position = (screen: RenderResult) =>
  within(dots(screen)).getByRole('button', { selected: true }).props.accessibilityLabel;
const control = (screen: RenderResult) => screen.getByTestId('account-intro-play');
const wait = (ms: number) => act(async () => { jest.advanceTimersByTime(ms); });
// Each page's own wait starts when the page before it lands, so time is advanced a dwell at a time.

let screenReader = false;
beforeEach(() => {
  jest.useFakeTimers();
  screenReader = false;
  jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockImplementation(() => Promise.resolve(screenReader));
  jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('the sign-in benefit pages', () => {
  test('stay behind the account screens switch', () => {
    expect(ACCOUNT_SCREENS_ENABLED).toBe(false);
  });

  test('show six pages, each one spoken element with its title and sentence, starting at the leftmost', async () => {
    const screen = await renderPager();
    expect(accountIntroPageIds).toHaveLength(6);
    for (const id of accountIntroPageIds) {
      const { title, body } = en.pages[id];
      expect(screen.getByTestId(`account-intro-page-${id}`).props.accessibilityLabel).toBe(`${title}. ${body}`);
    }
    expect(position(screen)).toBe(en.pagePosition(1, 6));
    const marks = within(dots(screen)).getAllByRole('button').map((dot) => dot.props.accessibilityLabel);
    expect(marks).toEqual([1, 2, 3, 4, 5, 6].map((page) => en.pagePosition(page, 6)));
  });

  test('move on by themselves once, a dwell apart, announce each title and stop on the last', async () => {
    const screen = await renderPager();
    await wait(ACCOUNT_INTRO_PAGE_DWELL_MS);
    expect(position(screen)).toBe(en.pagePosition(2, 6));
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenLastCalledWith(en.pages.history.title);
    for (let step = 0; step < 6; step += 1) await wait(ACCOUNT_INTRO_PAGE_DWELL_MS);
    expect(position(screen)).toBe(en.pagePosition(6, 6));
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenLastCalledWith(en.pages.compose.title);
  });

  test('a touch hands them over: they stop moving for the rest of the visit', async () => {
    const screen = await renderPager();
    await fireEvent(screen.getByTestId('account-intro-pages'), 'touchStart');
    await wait(ACCOUNT_INTRO_PAGE_DWELL_MS * 3);
    expect(position(screen)).toBe(en.pagePosition(1, 6));
  });

  test('each dot is a button that jumps to its page and stops the advance', async () => {
    const screen = await renderPager();
    await fireEvent.press(screen.getByTestId('account-intro-dot-devices'));
    expect(position(screen)).toBe(en.pagePosition(4, 6));
    expect(control(screen).props.accessibilityLabel).toBe(en.playPages);
    await wait(ACCOUNT_INTRO_PAGE_DWELL_MS * 3);
    expect(position(screen)).toBe(en.pagePosition(4, 6));
  });

  test('pause stops the advance and play resumes it from the page shown', async () => {
    const screen = await renderPager();
    expect(control(screen).props.accessibilityLabel).toBe(en.pausePages);
    await wait(ACCOUNT_INTRO_PAGE_DWELL_MS);
    await fireEvent.press(control(screen));
    expect(control(screen).props.accessibilityLabel).toBe(en.playPages);
    await wait(ACCOUNT_INTRO_PAGE_DWELL_MS * 3);
    expect(position(screen)).toBe(en.pagePosition(2, 6));
    await fireEvent.press(control(screen));
    expect(control(screen).props.accessibilityLabel).toBe(en.pausePages);
    await wait(ACCOUNT_INTRO_PAGE_DWELL_MS);
    expect(position(screen)).toBe(en.pagePosition(3, 6));
  });

  test('after the one pass the control offers play, and play runs one more pass from the first page', async () => {
    const screen = await renderPager();
    for (let step = 0; step < 5; step += 1) await wait(ACCOUNT_INTRO_PAGE_DWELL_MS);
    expect(position(screen)).toBe(en.pagePosition(6, 6));
    expect(control(screen).props.accessibilityLabel).toBe(en.playPages);
    await fireEvent.press(control(screen));
    expect(position(screen)).toBe(en.pagePosition(1, 6));
    expect(control(screen).props.accessibilityLabel).toBe(en.pausePages);
    for (let step = 0; step < 6; step += 1) await wait(ACCOUNT_INTRO_PAGE_DWELL_MS);
    expect(position(screen)).toBe(en.pagePosition(6, 6));
    expect(control(screen).props.accessibilityLabel).toBe(en.playPages);
  });

  test('opened on a page, they start there; on the last they rest and play runs a pass from the first', async () => {
    const screen = await renderPager('en', 'compose');
    expect(position(screen)).toBe(en.pagePosition(6, 6));
    expect(screen.getByTestId('account-intro-page-compose').props.accessibilityLabel)
      .toBe(`${en.pages.compose.title}. ${en.pages.compose.body}`);
    await wait(ACCOUNT_INTRO_PAGE_DWELL_MS * 2);
    expect(position(screen)).toBe(en.pagePosition(6, 6));
    expect(control(screen).props.accessibilityLabel).toBe(en.playPages);
    await fireEvent.press(control(screen));
    expect(position(screen)).toBe(en.pagePosition(1, 6));
  });

  test('the scroll view opens on that page once the pages have their width', async () => {
    // Before the sheet is measured the pages have no width, so a scroll then lands nowhere: the
    // page is the scroll view's own starting offset, given with the width.
    const screen = await renderPager('en', 'history');
    expect(screen.getByTestId('account-intro-pages').props.contentOffset).toEqual({ x: 390, y: 0 });
    await fireEvent(screen.getByTestId('account-intro-pages').parent!, 'layout', {
      nativeEvent: { layout: { x: 0, y: 0, width: 400, height: 400 } },
    });
    expect(screen.getByTestId('account-intro-pages').props.contentOffset).toEqual({ x: 400, y: 0 });
    // And once the pages are that wide, the scroll view is brought to the page as well.
    const scrollTo = jest.fn();
    const pages = screen.getByTestId('account-intro-pages');
    jest.spyOn(ScrollView.prototype, 'scrollTo').mockImplementation(scrollTo);
    await fireEvent(pages, 'contentSizeChange', 400 * accountIntroPageIds.length, 400);
    expect(scrollTo).toHaveBeenLastCalledWith({ x: 400, animated: false });
  });

  test('never move while a screen reader runs', async () => {
    screenReader = true;
    const screen = await renderPager();
    await act(async () => {});
    await wait(ACCOUNT_INTRO_PAGE_DWELL_MS * 3);
    expect(position(screen)).toBe(en.pagePosition(1, 6));
    expect(screen.queryByTestId('account-intro-play')).toBeNull();
  });

  test('opened while the app is inactive, they wait until it is active again', async () => {
    let change: (state: AppStateStatus) => void = () => undefined;
    // The test renderer's AppState mock has no state of its own, so the test sets one.
    const mutable = AppState as { currentState: unknown };
    const original = mutable.currentState;
    mutable.currentState = 'inactive';
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
      change = listener as typeof change;
      return { remove: () => undefined };
    });
    const screen = await renderPager().finally(() => { mutable.currentState = original; });
    await wait(ACCOUNT_INTRO_PAGE_DWELL_MS * 2);
    expect(position(screen)).toBe(en.pagePosition(1, 6));
    await act(async () => change('active'));
    await wait(ACCOUNT_INTRO_PAGE_DWELL_MS);
    expect(position(screen)).toBe(en.pagePosition(2, 6));
  });

  test('speak Turkish', async () => {
    const screen = await renderPager('tr');
    expect(screen.getByText(messages.tr.account.signIn.pages.closet.title)).toBeTruthy();
    expect(position(screen)).toBe(messages.tr.account.signIn.pagePosition(1, 6));
    expect(control(screen).props.accessibilityLabel).toBe(messages.tr.account.signIn.pausePages);
  });
});
