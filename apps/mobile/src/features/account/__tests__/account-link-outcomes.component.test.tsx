import { fireEvent, render, type RenderResult } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { Alert } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { showIdentityTakenAlert } from '@/features/account/presentation/account-identity-taken-alert';
import { AccountMergeResultContent } from '@/features/account/presentation/account-merge-result';
import { LocalizationContext } from '@/localization/localization-context';
import { messages, type SupportedLanguage } from '@/localization/messages';
import { lightTheme } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

jest.mock('@expo/ui', () => jest.requireActual('@/components/ui/__tests__/expo-ui-test-mock'));
jest.mock('@expo/ui/swift-ui', () => jest.requireActual('@/components/ui/__tests__/expo-ui-test-mock'));
jest.mock('@expo/ui/swift-ui/modifiers', () => jest.requireActual('@/components/ui/__tests__/expo-ui-test-mock'));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));

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

describe('the merge result', () => {
  const counts = { piecesAdded: 4, historyDaysAdded: 3, piecesReceived: 1, historyDaysReceived: 6 };

  test('it states what this phone and the account each gave per kind, the conflict rule and the profile source', async () => {
    const screen = await renderIn(<AccountMergeResultContent counts={counts} onDone={jest.fn()} onOpenCloset={jest.fn()} />);
    expect(screen.getByText(en.merge.title)).toBeTruthy();
    expect(screen.getByTestId('account-merge-closet')).toHaveTextContent(
      '4 pieces from this phone joined your account, and 1 piece from your account joined your Closet.',
    );
    expect(screen.getByTestId('account-merge-history')).toHaveTextContent(
      '3 days from this phone joined your account, and 6 days from your account joined your History.',
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
      'Bu telefondan hesabına 4 parça katıldı, hesabından Gardırobuna 1 parça geldi.',
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
        ...Object.values(copy.merge).map((line) => (typeof line === 'function' ? line(2, 3) : line)),
        ...Object.values(copy.identityTaken).flatMap((line) => (typeof line === 'string' ? [line] : Object.values(line))),
      ].join(' ');
      expect(lines).not.toMatch(/device|server|cloud|cihaz|sunucu|bulut|never|asla|always|her zaman/i);
    }
  });
});
