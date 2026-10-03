import { fireEvent, render, type RenderResult } from '@testing-library/react-native';
import type { PropsWithChildren, ReactElement } from 'react';
import { Alert } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { showIdentityTakenAlert } from '@/features/account/presentation/account-identity-taken-alert';
import { AccountMergeResultContent } from '@/features/account/presentation/account-merge-result';
import { AccountSwitchSheet } from '@/features/account/presentation/account-switch-sheet';
import { LocalizationContext } from '@/localization/localization-context';
import { messages, type SupportedLanguage } from '@/localization/messages';
import { lightTheme } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

jest.mock('@expo/ui', () => jest.requireActual('@/components/ui/__tests__/expo-ui-test-mock'));
jest.mock('@expo/ui/swift-ui', () => jest.requireActual('@/components/ui/__tests__/expo-ui-test-mock'));
jest.mock('@expo/ui/swift-ui/modifiers', () => jest.requireActual('@/components/ui/__tests__/expo-ui-test-mock'));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
const mockSheetProps: { enablePanDownToClose?: boolean } = {};
jest.mock('@expo/ui/community/bottom-sheet', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  return {
    BottomSheet: ({ children, enablePanDownToClose, index }: PropsWithChildren<{ index: number; enablePanDownToClose?: boolean }>) => {
      mockSheetProps.enablePanDownToClose = enablePanDownToClose;
      return index >= 0 ? React.createElement(View, { testID: 'sheet-host' }, children) : null;
    },
  };
});

const en = messages.en.account;
const tr = messages.tr.account;

function renderIn(element: ReactElement, language: SupportedLanguage = 'en'): Promise<RenderResult> {
  return render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 59, right: 0, bottom: 34, left: 0 } }}>
      <LocalizationContext.Provider value={{ language, messages: messages[language], hour12: false }}>
        <KuyaraThemeContext.Provider value={lightTheme}>{element}</KuyaraThemeContext.Provider>
      </LocalizationContext.Provider>
    </SafeAreaProvider>,
  );
}

afterEach(() => jest.restoreAllMocks());

describe('the different-account sheet', () => {
  const prompt = { pieces: 14, days: 9, pendingChanges: 0 };

  test('it cannot be swiped away and states what this phone holds', async () => {
    const screen = await renderIn(<AccountSwitchSheet onAdd={jest.fn()} onDontAdd={jest.fn()} prompt={prompt} />);
    expect(mockSheetProps.enablePanDownToClose).toBe(false);
    expect(screen.getByText(en.switchAccount.title)).toBeTruthy();
    expect(screen.getByTestId('account-switch-holds')).toHaveTextContent('Your Closet has 14 pieces and your History 9 days.');
    expect(screen.queryByTestId('account-switch-pending')).toBeNull();
  });

  test('the two answers are equally weighted and each reports its own choice', async () => {
    const onAdd = jest.fn();
    const onDontAdd = jest.fn();
    const screen = await renderIn(<AccountSwitchSheet onAdd={onAdd} onDontAdd={onDontAdd} prompt={prompt} />);
    const add = screen.getByTestId('account-switch-add');
    const dontAdd = screen.getByTestId('account-switch-dont-add');
    expect(add.props.style).toBeDefined();
    expect(add.props.style).toEqual(dontAdd.props.style);
    await fireEvent.press(add);
    expect(onAdd).toHaveBeenCalledTimes(1);
    await fireEvent.press(dontAdd);
    expect(onDontAdd).toHaveBeenCalledTimes(1);
  });

  test('changes not synced yet are counted, since "Don\'t add" loses them', async () => {
    const screen = await renderIn(<AccountSwitchSheet onAdd={jest.fn()} onDontAdd={jest.fn()} prompt={{ ...prompt, pendingChanges: 3 }} />);
    expect(screen.getByTestId('account-switch-pending')).toHaveTextContent(en.switchAccount.pending(3));
    expect(en.switchAccount.pending(1)).toBe('1 change from the other account has not synced yet. Don’t add loses it.');
  });

  test('with no prompt it shows nothing', async () => {
    const screen = await renderIn(<AccountSwitchSheet onAdd={jest.fn()} onDontAdd={jest.fn()} prompt={null} />);
    expect(screen.queryByTestId('sheet-host')).toBeNull();
  });

  test('Turkish', async () => {
    const screen = await renderIn(
      <AccountSwitchSheet onAdd={jest.fn()} onDontAdd={jest.fn()} prompt={{ ...prompt, pendingChanges: 2 }} />,
      'tr',
    );
    expect(screen.getByText(tr.switchAccount.title)).toBeTruthy();
    expect(screen.getByLabelText(tr.switchAccount.add)).toBeTruthy();
    expect(screen.getByLabelText(tr.switchAccount.dontAdd)).toBeTruthy();
    expect(screen.getByTestId('account-switch-pending')).toHaveTextContent(tr.switchAccount.pending(2));
  });
});

describe('the merge result', () => {
  const counts = { piecesAdded: 4, historyDaysAdded: 3, piecesReceived: 1, historyDaysReceived: 6 };

  test('it states what each side gave per kind, the conflict rule and the profile source', async () => {
    const screen = await renderIn(<AccountMergeResultContent counts={counts} onDone={jest.fn()} onOpenCloset={jest.fn()} />);
    expect(screen.getByText(en.merge.title)).toBeTruthy();
    expect(screen.getByTestId('account-merge-closet')).toHaveTextContent(
      '4 pieces joined your account, and 1 piece from your account joined your Closet.',
    );
    expect(screen.getByTestId('account-merge-history')).toHaveTextContent(
      '3 days joined your account, and 6 days from your account joined your History.',
    );
    expect(screen.getByText(en.merge.rule)).toBeTruthy();
    expect(screen.getByText(en.merge.duplicates)).toBeTruthy();
    expect(screen.getByText(en.restore.doneProfile)).toBeTruthy();
  });

  test('"Open Closet" and "Done" each report their own press', async () => {
    const onDone = jest.fn();
    const onOpenCloset = jest.fn();
    const screen = await renderIn(<AccountMergeResultContent counts={counts} onDone={onDone} onOpenCloset={onOpenCloset} />);
    await fireEvent.press(screen.getByTestId('account-merge-open-closet'));
    expect(onOpenCloset).toHaveBeenCalledTimes(1);
    expect(onDone).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('account-result-done'));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  test('Turkish', async () => {
    const screen = await renderIn(<AccountMergeResultContent counts={counts} onDone={jest.fn()} onOpenCloset={jest.fn()} />, 'tr');
    expect(screen.getByText(tr.merge.title)).toBeTruthy();
    expect(screen.getByTestId('account-merge-closet')).toHaveTextContent(
      'Hesabına 4 parça katıldı, hesabından Gardırobuna 1 parça geldi.',
    );
    expect(screen.getByLabelText(tr.merge.openCloset)).toBeTruthy();
  });
});

describe('the identity that belongs to another account', () => {
  test.each(['apple', 'google'] as const)('%s: a system alert with one OK names the way out', (provider) => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    showIdentityTakenAlert(en, provider);
    expect(alert).toHaveBeenCalledWith(en.identityTaken.title[provider], en.identityTaken.body[provider], [{ text: 'OK' }]);
  });

  test('Turkish', () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    showIdentityTakenAlert(tr, 'google');
    expect(alert).toHaveBeenCalledWith('Bu Google hesabı zaten kullanılıyor', tr.identityTaken.body.google, [{ text: 'Tamam' }]);
  });
});

describe('the copy boundary', () => {
  test('no new account line names where data is kept', () => {
    for (const copy of [en, tr]) {
      const lines = [
        ...Object.values(copy.switchAccount).map((line) => (typeof line === 'function' ? line(2, 3) : line)),
        ...Object.values(copy.merge).map((line) => (typeof line === 'function' ? line(2, 3) : line)),
        ...Object.values(copy.identityTaken).flatMap((line) => (typeof line === 'string' ? [line] : Object.values(line))),
      ].join(' ');
      expect(lines).not.toMatch(/device|server|cloud|cihaz|sunucu|bulut|never|asla|always|her zaman/i);
    }
  });
});
