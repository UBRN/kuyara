import { act, fireEvent, render, within, type RenderResult } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { AccessibilityInfo } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import {
  ACCOUNT_INTRO_PAGE_DWELL_MS,
  accountIntroPageIds,
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

async function renderPager(language: SupportedLanguage = 'en'): Promise<RenderResult> {
  const screen = await render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 59, right: 0, bottom: 34, left: 0 } }}>
      <LocalizationContext.Provider value={{ language, messages: messages[language], hour12: false }}>
        <KuyaraThemeContext.Provider value={lightTheme}>
          <AccountIntroPager />
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
const position = (screen: RenderResult) => dots(screen).props.accessibilityValue.text;
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

  test('show five pages, each one spoken element with its title and sentence, starting at the leftmost', async () => {
    const screen = await renderPager();
    expect(accountIntroPageIds).toHaveLength(5);
    for (const id of accountIntroPageIds) {
      const { title, body } = en.pages[id];
      expect(screen.getByTestId(`account-intro-page-${id}`).props.accessibilityLabel).toBe(`${title}. ${body}`);
    }
    expect(position(screen)).toBe(en.pagePosition(1, 5));
    const marks = within(dots(screen)).getAllByTestId(/^account-intro-dot-/).map((dot) => dot.props.testID);
    expect(marks).toEqual(['account-intro-dot-current', ...accountIntroPageIds.slice(1).map((id) => `account-intro-dot-${id}`)]);
  });

  test('move on by themselves once, a dwell apart, announce each title and stop on the last', async () => {
    const screen = await renderPager();
    await wait(ACCOUNT_INTRO_PAGE_DWELL_MS);
    expect(position(screen)).toBe(en.pagePosition(2, 5));
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenLastCalledWith(en.pages.history.title);
    for (let step = 0; step < 6; step += 1) await wait(ACCOUNT_INTRO_PAGE_DWELL_MS);
    expect(position(screen)).toBe(en.pagePosition(5, 5));
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenLastCalledWith(en.pages.photos.title);
  });

  test('a touch hands them over: they stop moving for the rest of the visit', async () => {
    const screen = await renderPager();
    await fireEvent(screen.getByTestId('account-intro-pages'), 'touchStart');
    await wait(ACCOUNT_INTRO_PAGE_DWELL_MS * 3);
    expect(position(screen)).toBe(en.pagePosition(1, 5));
  });

  test('the dots are one adjustable control that moves a page at a time and stops the advance', async () => {
    const screen = await renderPager();
    expect(dots(screen).props.accessibilityRole).toBe('adjustable');
    expect(dots(screen).props.accessibilityLabel).toBe(en.pageIndicator);
    await fireEvent(dots(screen), 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    expect(position(screen)).toBe(en.pagePosition(2, 5));
    await fireEvent(dots(screen), 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
    await fireEvent(dots(screen), 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
    expect(position(screen)).toBe(en.pagePosition(1, 5));
    await wait(ACCOUNT_INTRO_PAGE_DWELL_MS * 3);
    expect(position(screen)).toBe(en.pagePosition(1, 5));
  });

  test('never move while a screen reader runs', async () => {
    screenReader = true;
    const screen = await renderPager();
    await act(async () => {});
    await wait(ACCOUNT_INTRO_PAGE_DWELL_MS * 3);
    expect(position(screen)).toBe(en.pagePosition(1, 5));
  });

  test('speak Turkish', async () => {
    const screen = await renderPager('tr');
    expect(screen.getByText(messages.tr.account.signIn.pages.closet.title)).toBeTruthy();
    expect(position(screen)).toBe(messages.tr.account.signIn.pagePosition(1, 5));
  });
});
