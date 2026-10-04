import { act, fireEvent, within } from '@testing-library/react-native';
import type { PropsWithChildren } from 'react';
import { AccessibilityInfo, Alert, StyleSheet } from 'react-native';

import {
  accountScenarios,
  createInMemoryAccountScreens,
  type AccountScenarioName,
} from '@/features/account/application/account-screens';
import { renderWith } from '@/features/account/__tests__/render-account-screen';
import { AccountScreen } from '@/features/account/presentation/account-screen';
import { AccountSheet } from '@/features/account/presentation/account-sheet';
import { DeleteAccountScreen } from '@/features/account/presentation/delete-account-screen';
import { messages } from '@/localization/messages';
import { borderWidths, layout, lightTheme, spacing, typography } from '@/theme/theme';

jest.mock('@expo/ui', () => jest.requireActual('@/components/ui/__tests__/expo-ui-test-mock'));
jest.mock('@expo/ui/swift-ui', () => jest.requireActual('@/components/ui/__tests__/expo-ui-test-mock'));
jest.mock('@expo/ui/swift-ui/modifiers', () => jest.requireActual('@/components/ui/__tests__/expo-ui-test-mock'));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
// The host keeps the sheet's detents, its swipe dismissal and its close callback as props, so a
// test can read how the sheet is presented and close it the way a swipe does.
jest.mock('@expo/ui/community/bottom-sheet', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  return {
    BottomSheet: ({ children, enablePanDownToClose, index, onClose, snapPoints }: PropsWithChildren<{
      index: number; enablePanDownToClose: boolean; onClose: () => void; snapPoints?: string[];
    }>) => (index >= 0
      ? React.createElement(View, { testID: 'sheet-host', ...{ enablePanDownToClose, onClose, snapPoints } }, children)
      : null),
  };
});
jest.mock('expo-router', () => ({ useLocalSearchParams: () => ({}), useRouter: () => ({ push: jest.fn() }) }));

const en = messages.en.account;
const tr = messages.tr.account;

const portFor = (scenario: AccountScenarioName) =>
  createInMemoryAccountScreens(accountScenarios[scenario], () => new Date('2026-10-04T07:05:00.000Z'));

afterEach(() => jest.restoreAllMocks());

describe('the sync consent sheet after sign-in (ADR 0041 section 5)', () => {
  test('it asks one more thing with the box unticked, and no terms box', async () => {
    const screen = await renderWith(portFor('consentAfterSignIn'), <AccountSheet host="profile" />);
    expect(screen.getByText(en.consent.title)).toBeTruthy();
    expect(screen.getByText(en.consent.syncConsentSubtitle)).toBeTruthy();
    const box = screen.getByRole('checkbox');
    expect(box).toHaveAccessibleName(en.consent.syncConsentBox);
    expect(box.props.accessibilityState).toMatchObject({ checked: false });
    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
    expect(screen.queryByTestId('account-sign-in-page')).toBeNull();
    expect(screen.queryByTestId('account-consent-text')).toBeNull();
  });

  test('the checkbox is a real checkbox with a 44-point target that ticks and unticks', async () => {
    const screen = await renderWith(portFor('consentAfterSignIn'), <AccountSheet host="profile" />);
    const box = screen.getByRole('checkbox');
    expect(box).toHaveStyle({ minHeight: layout.minimumTouchTarget });
    await fireEvent.press(box);
    expect(screen.getByRole('checkbox').props.accessibilityState).toMatchObject({ checked: true });
    await fireEvent.press(screen.getByRole('checkbox'));
    expect(screen.getByRole('checkbox').props.accessibilityState).toMatchObject({ checked: false });
  });

  test('Continue with the box unticked declines and completes sign-in without the records', async () => {
    const port = portFor('consentAfterSignIn');
    const screen = await renderWith(port, <AccountSheet host="profile" />);
    await fireEvent.press(screen.getByTestId('account-consent-continue'));
    expect(port.getSnapshot().consent.prompt).toBeNull();
    expect(port.getSnapshot().session).toMatchObject({ kind: 'signedIn', syncConsent: 'none' });
    expect(screen.getByTestId('account-result-signedIn')).toBeTruthy();
    expect(screen.getByText(en.welcome.withoutRecords)).toBeTruthy();
  });

  test.each(['en', 'tr'] as const)('after a first sync that failed, the welcome claims nothing reached the account yet (%s)', async (language) => {
    const welcome = accountScenarios.welcomeWithoutRecords;
    if (welcome.result?.kind !== 'signedIn') throw new Error('the scenario shows the welcome');
    const port = createInMemoryAccountScreens({ ...welcome, result: { ...welcome.result, added: 'nothingYet' } });
    const screen = await renderWith(port, <AccountSheet host="profile" />, language);
    const copy = messages[language].account.welcome;
    expect(screen.getByText(copy.notYet)).toBeTruthy();
    expect(screen.queryByText(copy.withoutRecords)).toBeNull();
  });

  test('Continue with the box ticked gives the consent', async () => {
    const port = portFor('consentAfterSignIn');
    const screen = await renderWith(port, <AccountSheet host="profile" />);
    await fireEvent.press(screen.getByRole('checkbox'));
    await fireEvent.press(screen.getByTestId('account-consent-continue'));
    expect(port.getSnapshot().session).toMatchObject({ syncConsent: 'given' });
    expect(port.getSnapshot().result).toMatchObject({ kind: 'signedIn', added: 'records' });
  });

  test('Read the text opens the full text in place and Hide the text closes it', async () => {
    const screen = await renderWith(portFor('consentAfterSignIn'), <AccountSheet host="profile" />);
    const toggle = screen.getByTestId('account-consent-read-text');
    expect(toggle).toHaveAccessibleName(en.consent.readText);
    expect(toggle.props.accessibilityState).toMatchObject({ expanded: false });
    await fireEvent.press(toggle);
    const text = screen.getByTestId('account-consent-text');
    expect(text).toHaveTextContent(/Supabase Inc\. \(USA\)/);
    expect(text).toHaveTextContent(/Sync consent/);
    expect(screen.getByTestId('account-consent-read-text')).toHaveAccessibleName(en.consent.hideText);
    expect(screen.getByTestId('account-consent-read-text').props.accessibilityState).toMatchObject({ expanded: true });
    await fireEvent.press(screen.getByTestId('account-consent-read-text'));
    expect(screen.queryByTestId('account-consent-text')).toBeNull();
  });

  test('focus moves title, subtitle, checkbox, read the text, text, continue', async () => {
    const screen = await renderWith(portFor('consentAfterSignIn'), <AccountSheet host="profile" />);
    await fireEvent.press(screen.getByTestId('account-consent-read-text'));
    const tree = JSON.stringify(screen.toJSON());
    const order = [en.consent.title, en.consent.syncConsentSubtitle, 'account-consent-box', 'account-consent-read-text',
      'account-consent-text', 'account-consent-continue'].map((marker) => tree.indexOf(marker));
    expect(order.every((position) => position >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  test('while the answer is saved Continue spins and takes no second press', async () => {
    const port = portFor('consentSaving');
    const answer = jest.spyOn(port, 'answerConsent');
    const screen = await renderWith(port, <AccountSheet host="profile" />);
    expect(screen.getByTestId('account-consent-continue')).toBeDisabled();
    await fireEvent.press(screen.getByTestId('account-consent-continue'));
    expect(answer).not.toHaveBeenCalled();
  });

  test('an answer that could not be saved shows the error line, spoken, and keeps Continue', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
    const screen = await renderWith(portFor('consentFailed'), <AccountSheet host="profile" />);
    expect(screen.getByTestId('account-consent-failed')).toHaveTextContent(en.consent.failed);
    expect(announce).toHaveBeenCalledWith(en.consent.failed);
    expect(screen.getByTestId('account-consent-continue')).not.toBeDisabled();
  });

  test('the question fills the large detent, scrolls, and keeps Continue pinned out of the scroll', async () => {
    const screen = await renderWith(portFor('consentFailed'), <AccountSheet host="profile" />);
    await fireEvent.press(screen.getByTestId('account-consent-read-text'));
    expect(screen.getByTestId('sheet-host').props.snapPoints).toEqual(['100%']);
    const scroll = screen.getByTestId('account-consent-scroll');
    expect(within(scroll).getByTestId('account-consent-text')).toBeTruthy();
    expect(within(scroll).getByTestId('account-consent-failed')).toBeTruthy();
    expect(within(scroll).queryByTestId('account-consent-continue')).toBeNull();
    expect(screen.getByTestId('account-consent-continue')).toBeTruthy();
  });

  test('while the text is open a swipe cannot close the sheet; closed again, it can', async () => {
    const screen = await renderWith(portFor('consentAfterSignIn'), <AccountSheet host="profile" />);
    expect(screen.getByTestId('sheet-host').props.enablePanDownToClose).toBe(true);
    await fireEvent.press(screen.getByTestId('account-consent-read-text'));
    expect(screen.getByTestId('sheet-host').props.enablePanDownToClose).toBe(false);
    await fireEvent.press(screen.getByTestId('account-consent-read-text'));
    expect(screen.getByTestId('sheet-host').props.enablePanDownToClose).toBe(true);
  });

  test('the full text reads in the regular body style, and only the paragraph leads are semibold', async () => {
    const screen = await renderWith(portFor('consentAfterSignIn'), <AccountSheet host="profile" />);
    await fireEvent.press(screen.getByTestId('account-consent-read-text'));
    const bullet = screen.getByText(`• ${en.consent.syncConsentText.find((line) => line.startsWith('- '))?.slice(2)}`);
    expect(bullet).toHaveStyle({ fontWeight: typography.body.fontWeight });
    expect(screen.getByText('This consent is optional. You are signed in either way.')).toHaveStyle({ fontWeight: '400' });
    expect(screen.getByText('Why.')).toHaveStyle({ fontWeight: typography.bodyStrong.fontWeight });
  });

  test('Read the text is a link-drawn button lined up with the checkbox label', async () => {
    const screen = await renderWith(portFor('consentAfterSignIn'), <AccountSheet host="profile" />);
    const toggle = screen.getByTestId('account-consent-read-text');
    expect(toggle.props.accessibilityRole).toBe('button');
    expect(StyleSheet.flatten(toggle.props.style)).toMatchObject({ minHeight: layout.minimumTouchTarget });
    expect(screen.getByText(en.consent.readText, { includeHiddenElements: true }))
      .toHaveStyle({ color: lightTheme.colors.brandPrimary, textDecorationLine: 'underline' });
    // The label's words start one hairline and one inset in; the button's words start at its own inset.
    const offset = StyleSheet.flatten(screen.getByTestId('account-consent-read-text-row').props.style).marginLeft;
    expect(offset + spacing.sm).toBe(borderWidths.subtle + spacing.md);
  });

  test('closing the sheet over the question declines and shows the same result as Continue unticked', async () => {
    const port = portFor('consentAfterSignIn');
    const screen = await renderWith(port, <AccountSheet host="profile" />);
    await act(async () => screen.getByTestId('sheet-host').props.onClose());
    expect(port.getSnapshot().session).toMatchObject({ kind: 'signedIn', syncConsent: 'none' });
    expect(screen.getByTestId('account-result-signedIn')).toBeTruthy();
    expect(screen.getByText(en.welcome.withoutRecords)).toBeTruthy();
  });

  test('closing it after an answer that could not be saved says the records do not sync', async () => {
    const port = portFor('consentFailed');
    const screen = await renderWith(port, <AccountSheet host="profile" />);
    await act(async () => screen.getByTestId('sheet-host').props.onClose());
    expect(screen.getByText(en.welcome.withoutRecords)).toBeTruthy();
  });

  test('the Turkish sheet uses the approved words', async () => {
    const screen = await renderWith(portFor('consentAfterSignIn'), <AccountSheet host="profile" />, 'tr');
    expect(screen.getByText('Bir şey daha')).toBeTruthy();
    expect(screen.getByText(tr.consent.syncConsentSubtitle)).toBeTruthy();
    expect(screen.getByRole('checkbox')).toHaveAccessibleName('Evet, kayıtlarım eşitlensin.');
    expect(screen.getByTestId('account-consent-read-text')).toHaveAccessibleName('Metni aç');
    expect(screen.getByTestId('account-consent-continue')).toHaveAccessibleName('Devam');
  });
});

describe('the Account screen records group (ADR 0041 section 10)', () => {
  test('with the consent the records sync, and withdrawing asks the system first', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const port = portFor('upToDate');
    const screen = await renderWith(port, <AccountScreen onOpenDelete={jest.fn()} />);
    expect(screen.getByTestId('account-records-status-row')).toBeTruthy();
    expect(screen.getByText(en.records.label)).toBeTruthy();
    expect(screen.getByText(en.records.on)).toBeTruthy();
    expect(screen.getByText(en.records.onFooter)).toBeTruthy();
    await fireEvent.press(screen.getByText(en.records.withdraw));
    expect(alert).toHaveBeenCalledWith(en.withdrawAlert.title, en.withdrawAlert.body, expect.any(Array));
    const buttons = alert.mock.calls[0][2] as { text: string; style?: string; onPress?: () => void }[];
    const confirm = buttons.find((button) => button.text === en.withdrawAlert.confirm);
    expect(confirm?.style).toBe('destructive');
    await act(async () => confirm?.onPress?.());
    expect(port.getSnapshot().session).toMatchObject({ kind: 'signedIn', syncConsent: 'withdrawn' });
    expect(screen.getByText(en.records.off)).toBeTruthy();
    expect(screen.getAllByText(en.account.notIncluded)).toHaveLength(3);
  });

  test('the status row reads as a status with a noun, never as the action row beside it', () => {
    expect(en.records.label).toBe('Record sync');
    expect(tr.records.label).toBe('Kayıt eşitleme');
    for (const copy of [en, tr]) {
      expect(copy.records.label).not.toBe(copy.records.give);
      expect(copy.records.label).not.toBe(copy.records.withdraw);
    }
  });

  test('without the consent the Closet and History rows say Not included, never a count of none', async () => {
    for (const scenario of ['recordsNotSynced', 'recordsWithdrawn'] as const) {
      const screen = await renderWith(portFor(scenario), <AccountScreen onOpenDelete={jest.fn()} />);
      // The Closet, History and preferences rows.
      expect(screen.getAllByText(en.account.notIncluded)).toHaveLength(3);
      expect(screen.queryByText(en.account.pieces(0))).toBeNull();
      expect(screen.queryByText(en.account.days(0))).toBeNull();
      await screen.unmount();
    }
  });

  test('the withdrawal confirmation names every phone, the deleted copies and this phone\'s records, and no place', () => {
    for (const body of [en.withdrawAlert.body, tr.withdrawAlert.body]) {
      expect(body).not.toMatch(/server|sunucu|cloud|bulut|Supabase|Frankfurt|USA|ABD/i);
      // Whole sentences: each ends with a full stop and the next starts with a capital.
      expect(body.split(/(?<=\.) /u).every((sentence) => /^\p{Lu}.*\.$/u.test(sentence))).toBe(true);
    }
    expect(en.withdrawAlert.body).toBe('Sync stops on every phone signed in to your account. Your account’s copies of your '
      + 'Closet, History, style preferences, daily choices and departure records are deleted. The records on this phone stay.');
    expect(tr.withdrawAlert.body).toBe('Hesabınla oturum açılmış bütün telefonlarda eşitleme durur. Gardırobunun, Geçmişinin, '
      + 'stil tercihlerinin, günlük seçimlerinin ve çıkış kayıtlarının hesabındaki kopyaları silinir. '
      + 'Bu telefondaki kayıtların olduğu gibi kalır.');
  });

  test('without the consent it offers the same sheet, which Continue unticked closes with nothing changed', async () => {
    const port = portFor('recordsNotSynced');
    const screen = await renderWith(port, <AccountScreen onOpenDelete={jest.fn()} />);
    expect(screen.getByText(en.records.off)).toBeTruthy();
    expect(screen.getByText(en.records.offFooter)).toBeTruthy();
    expect(screen.queryByTestId('account-consent')).toBeNull();
    await fireEvent.press(screen.getByText(en.records.give));
    expect(port.getSnapshot().consent.prompt).toBe('account');
    expect(screen.getByTestId('account-consent')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('account-consent-continue'));
    expect(port.getSnapshot().consent.prompt).toBeNull();
    expect(port.getSnapshot().session).toMatchObject({ syncConsent: 'none' });
  });

  test('ticking the box there gives the consent', async () => {
    const port = portFor('recordsWithdrawn');
    const screen = await renderWith(port, <AccountScreen onOpenDelete={jest.fn()} />);
    await fireEvent.press(screen.getByText(en.records.give));
    await fireEvent.press(screen.getByRole('checkbox'));
    await fireEvent.press(screen.getByTestId('account-consent-continue'));
    expect(port.getSnapshot().session).toMatchObject({ syncConsent: 'given' });
    expect(screen.getByText(en.records.on)).toBeTruthy();
  });

  test('signing out without the records promises no sync of them', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const screen = await renderWith(portFor('recordsNotSynced'), <AccountScreen onOpenDelete={jest.fn()} />);
    await fireEvent.press(screen.getByText(en.account.signOut));
    expect(alert).toHaveBeenCalledWith(en.signOutAlert.title, en.signOutAlert.bodyWithoutRecords, expect.any(Array));
  });

  test('while an answer or a withdrawal is saved the records row does nothing', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const port = portFor('recordsSaving');
    const open = jest.spyOn(port, 'openConsent');
    const screen = await renderWith(port, <AccountScreen onOpenDelete={jest.fn()} />);
    await fireEvent.press(screen.getByTestId('account-records-action-row'));
    expect(open).not.toHaveBeenCalled();
    expect(alert).not.toHaveBeenCalled();
  });

  test('a withdrawal that failed says nothing changed in the system footer, with the danger mark', async () => {
    const screen = await renderWith(portFor('withdrawFailed'), <AccountScreen onOpenDelete={jest.fn()} />);
    const group = screen.getByTestId('account-records-group');
    expect(screen.getByTestId('account-records-group-footer')).toHaveTextContent(en.records.failed);
    expect(within(group).getAllByTestId('expo-ui-icon').some((icon) => icon.props.accessibilityLabel === 'exclamationmark.triangle.fill'
      && StyleSheet.flatten(icon.props.style).backgroundColor === lightTheme.colors.dangerInk)).toBe(true);
  });
});

describe('the deletion page names only what the account holds', () => {
  test('without the records it names the name and gender, with them the Closet and History', async () => {
    const without = await renderWith(portFor('recordsWithdrawn'), <DeleteAccountScreen />);
    expect(without.getByText(en.deletion.goneDataWithoutRecords)).toBeTruthy();
    expect(without.queryByText(en.deletion.goneData)).toBeNull();
    await without.unmount();
    const withRecords = await renderWith(portFor('upToDate'), <DeleteAccountScreen />);
    expect(withRecords.getByText(en.deletion.goneData)).toBeTruthy();
  });
});

describe('the restore result names only what came from the account', () => {
  test('the profile line follows its source', async () => {
    const port = portFor('restored');
    const screen = await renderWith(port, <AccountSheet host="profile" />);
    expect(screen.getByText(en.restore.doneProfile)).toBeTruthy();
    await act(async () => port.load({ ...accountScenarios.restored, result: { kind: 'restored', pieces: 14, days: 9, profileFrom: 'accountNameAndGender' } }));
    expect(screen.getByText(en.restore.doneNameAndGender)).toBeTruthy();
    expect(screen.queryByText(en.restore.doneProfile)).toBeNull();
  });
});

describe('the deletion result when Apple could not be disconnected (ADR 0041 section 7)', () => {
  test('it says what was deleted and how to remove kuyara from Sign in with Apple', async () => {
    const screen = await renderWith(portFor('deletedAppleUnrevoked'), <AccountSheet host="app" />);
    expect(screen.getByText(en.deleted.goneUnrevoked)).toBeTruthy();
    expect(screen.queryByText(en.deleted.gone.apple)).toBeNull();
    expect(screen.getByTestId('account-result-apple-unrevoked'))
      .toHaveTextContent(/Settings > your name > Sign in with Apple, choose kuyara and tap Delete\./);
  });

  test('in Turkish it names the path in Turkish iOS terms', async () => {
    const screen = await renderWith(portFor('deletedAppleUnrevoked'), <AccountSheet host="app" />, 'tr');
    expect(screen.getByTestId('account-result-apple-unrevoked'))
      .toHaveTextContent(/Ayarlar > adın > Apple ile Giriş Yap bölümünü aç, kuyara’yı seç ve Sil’e dokun\./);
  });

  test('a revoked deletion shows no such line', async () => {
    const screen = await renderWith(portFor('deleted'), <AccountSheet host="app" />);
    expect(screen.queryByTestId('account-result-apple-unrevoked')).toBeNull();
    expect(screen.getByText(en.deleted.gone.apple)).toBeTruthy();
  });
});
