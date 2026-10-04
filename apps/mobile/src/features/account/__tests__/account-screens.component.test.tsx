import { act, fireEvent, render, type RenderResult } from '@testing-library/react-native';
import type { PropsWithChildren, ReactElement } from 'react';
import { Alert, Linking } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import {
  accountScenarios,
  createInMemoryAccountScreens,
  type AccountScenarioName,
  type AccountScreensPort,
} from '@/features/account/application/account-screens';
import { AccountScreensContext } from '@/features/account/application/account-screens-context';
import { AccountProfileCard } from '@/features/account/presentation/account-profile-card';
import { AccountScreen } from '@/features/account/presentation/account-screen';
import { AccountSettingsSection } from '@/features/account/presentation/account-settings-section';
import { AccountSheet } from '@/features/account/presentation/account-sheet';
import { DeleteAccountScreen } from '@/features/account/presentation/delete-account-screen';
import { PRIVACY_POLICY_URL } from '@/features/analytics/domain/privacy-policy';
import { LocalizationContext } from '@/localization/localization-context';
import { messages, type SupportedLanguage } from '@/localization/messages';
import { lightTheme } from '@/theme/theme';
import { KuyaraThemeContext } from '@/theme/theme-context';

jest.mock('@expo/ui', () => jest.requireActual('@/components/ui/__tests__/expo-ui-test-mock'));
jest.mock('@expo/ui/swift-ui', () => jest.requireActual('@/components/ui/__tests__/expo-ui-test-mock'));
jest.mock('@expo/ui/swift-ui/modifiers', () => jest.requireActual('@/components/ui/__tests__/expo-ui-test-mock'));
jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('@expo/ui/community/bottom-sheet', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { View } = jest.requireActual('react-native') as typeof import('react-native');
  return {
    BottomSheet: ({ children, index }: PropsWithChildren<{ index: number }>) =>
      (index >= 0 ? React.createElement(View, { testID: 'sheet-host' }, children) : null),
  };
});

const mockParams: { accountScenario?: string } = {};
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
}));

const en = messages.en.account;
const tr = messages.tr.account;

function renderWith(port: AccountScreensPort, element: ReactElement, language: SupportedLanguage = 'en'): Promise<RenderResult> {
  return render(
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 59, right: 0, bottom: 34, left: 0 } }}>
      <LocalizationContext.Provider value={{ language, messages: messages[language], hour12: false }}>
        <KuyaraThemeContext.Provider value={lightTheme}>
          <AccountScreensContext.Provider value={port}>{element}</AccountScreensContext.Provider>
        </KuyaraThemeContext.Provider>
      </LocalizationContext.Provider>
    </SafeAreaProvider>,
  );
}

const portFor = (scenario: AccountScenarioName) =>
  createInMemoryAccountScreens(accountScenarios[scenario], () => new Date('2026-10-02T07:05:00.000Z'));

afterEach(() => {
  delete mockParams.accountScenario;
  jest.restoreAllMocks();
});

describe('the Profile card (frame 01)', () => {
  test('signed out, it offers sign-in and opens the sheet on Profile', async () => {
    const port = portFor('signedOut');
    const screen = await renderWith(port, <AccountProfileCard />);
    expect(screen.getByText(en.card.title)).toBeTruthy();
    expect(screen.getByText(en.card.body)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('account-profile-card-continue'));
    expect(port.getSnapshot().sheet).toBe('profile');
  });

  test('its close mark hides it for good', async () => {
    const port = portFor('signedOut');
    const screen = await renderWith(port, <AccountProfileCard />);
    await fireEvent.press(screen.getByLabelText(en.card.dismiss));
    expect(port.getSnapshot().cardDismissed).toBe(true);
  });

  test('it is not there once someone is signed in', async () => {
    const screen = await renderWith(portFor('upToDate'), <AccountProfileCard />);
    expect(screen.queryByText(en.card.title)).toBeNull();
  });
});

describe('the sign-in page (frames 02, 17, 18, 19, 33)', () => {
  test('it lists the benefits, both providers, Not now and the privacy policy', async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    const screen = await renderWith(portFor('signIn'), <AccountSheet host="profile" />);
    expect(screen.getByText(en.signIn.title)).toBeTruthy();
    Object.values(en.signIn.pages).forEach(({ title, body }) => {
      expect(screen.getByText(title)).toBeTruthy();
      expect(screen.getByText(body)).toBeTruthy();
    });
    expect(screen.getByLabelText(en.signIn.continueWith.apple)).toBeTruthy();
    expect(screen.getByLabelText(en.signIn.continueWith.google)).toBeTruthy();
    expect(screen.queryByTestId('account-sign-in-status')).toBeNull();
    await fireEvent.press(screen.getByTestId('account-sign-in-privacy'));
    expect(openURL).toHaveBeenCalledWith(PRIVACY_POLICY_URL.en);
  });

  test('the privacy link follows the app language', async () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    const screen = await renderWith(portFor('signIn'), <AccountSheet host="profile" />, 'tr');
    await fireEvent.press(screen.getByTestId('account-sign-in-privacy'));
    expect(openURL).toHaveBeenCalledWith(PRIVACY_POLICY_URL.tr);
    expect(PRIVACY_POLICY_URL.tr).toBe('https://ubrn.github.io/kuyara/tr/privacy-policy?lang=tr');
  });

  test('the sheet shows only on the screen that opened it', async () => {
    const screen = await renderWith(portFor('signIn'), <AccountSheet host="settings" />);
    expect(screen.queryByTestId('account-sign-in-page')).toBeNull();
  });

  test.each([
    ['signInCancelled', en.signIn.cancelled],
    ['signInOffline', en.signIn.offline],
    ['signInFailed', en.signIn.failed.apple],
  ] as const)('%s shows its status line above the buttons', async (scenario, text) => {
    const screen = await renderWith(portFor(scenario), <AccountSheet host="profile" />);
    expect(screen.getByTestId('account-sign-in-status')).toHaveTextContent(text);
    expect(screen.getByLabelText(en.signIn.continueWith.apple)).not.toBeDisabled();
  });

  test('while Apple signs in, its button keeps its title and the rest wait', async () => {
    const screen = await renderWith(portFor('signInPending'), <AccountSheet host="profile" />);
    expect(screen.getByTestId('account-sign-in-apple-loading')).toBeTruthy();
    expect(screen.getByLabelText(en.signIn.continueWith.google)).toBeDisabled();
    expect(screen.getByTestId('account-sign-in-not-now')).toBeDisabled();
  });

  test('Not now closes the sheet', async () => {
    const port = portFor('signIn');
    const screen = await renderWith(port, <AccountSheet host="profile" />);
    await fireEvent.press(screen.getByTestId('account-sign-in-not-now'));
    expect(port.getSnapshot().sheet).toBeNull();
  });

  test('signing in turns the same sheet into the signed-in result', async () => {
    const port = portFor('signIn');
    const screen = await renderWith(port, <AccountSheet host="profile" />);
    await fireEvent.press(screen.getByLabelText(en.signIn.continueWith.apple));
    expect(screen.getByTestId('account-result-signedIn')).toBeTruthy();
    expect(screen.getByText(en.welcome.title)).toBeTruthy();
    expect(screen.getByText(en.welcome.summary(14, 9))).toBeTruthy();
    await fireEvent.press(screen.getByTestId('account-result-done'));
    expect(port.getSnapshot()).toMatchObject({ sheet: null, result: null, session: { kind: 'signedIn' } });
  });

  test('opened from outfit detail, the sheet starts on the compose benefit page', async () => {
    const port = portFor('signedOut');
    port.openSignIn('detail');
    const screen = await renderWith(port, <AccountSheet host="detail" />);
    expect(screen.getByTestId('account-sheet-detail')).toBeTruthy();
    expect(screen.getByTestId('account-intro-dot-compose').props.accessibilityState).toEqual({ selected: true });
    expect(screen.getByTestId('account-intro-dot-closet').props.accessibilityState).toEqual({ selected: false });
    // Profile and Settings keep starting on the first page.
    const fromProfile = await renderWith(portFor('signIn'), <AccountSheet host="profile" />);
    expect(fromProfile.getAllByTestId('account-intro-dot-closet').at(-1)!.props.accessibilityState).toEqual({ selected: true });
  });

  test('the footnote says weather and outfit suggestions work without an account, never that everything works the same', async () => {
    for (const language of ['en', 'tr'] as const) {
      const { footer } = messages[language].account.signIn;
      expect(footer.startsWith(language === 'en'
        ? 'Weather and outfit suggestions work without an account.'
        : 'Hava ve kombin önerileri hesap olmadan da çalışır.')).toBe(true);
      expect(footer).not.toMatch(/works the same|aynı şekilde/);
    }
    const screen = await renderWith(portFor('signIn'), <AccountSheet host="profile" />);
    expect(screen.getByText(new RegExp(en.signIn.footer.slice(0, 40)))).toBeTruthy();
  });

  test('the Turkish page uses the approved copy', async () => {
    const screen = await renderWith(portFor('signIn'), <AccountSheet host="profile" />, 'tr');
    expect(screen.getByText(tr.signIn.title)).toBeTruthy();
    expect(screen.getByLabelText(tr.signIn.continueWith.apple)).toBeTruthy();
    expect(screen.getByLabelText(tr.signIn.notNow)).toBeTruthy();
  });
});

describe('the result sheets (frames 04, 14, 15, 26)', () => {
  test('restoring shows the counts and Continue keeps it going', async () => {
    const port = portFor('restoring');
    const screen = await renderWith(port, <AccountSheet host="profile" />);
    const counts = { piecesDone: 8, piecesTotal: 14, daysDone: 5, daysTotal: 9 };
    expect(screen.getByText(en.restore.progressTitle)).toBeTruthy();
    expect(screen.getByTestId('account-result-progress')).toHaveTextContent(en.restore.progressCount(counts));
    await fireEvent.press(screen.getByTestId('account-result-done'));
    expect(port.getSnapshot().sheet).toBeNull();
    expect(port.getSnapshot().session).toMatchObject({ sync: { kind: 'restoring' } });
  });

  test('the Turkish restore count puts no suffix on a numeral', async () => {
    const screen = await renderWith(portFor('restoring'), <AccountSheet host="profile" />, 'tr');
    expect(screen.getByTestId('account-result-progress')).toHaveTextContent('14 parçadan 8 parça ve 9 günden 5 gün geldi.');
  });

  test('restored names the counts and where the profile came from', async () => {
    const screen = await renderWith(portFor('restored'), <AccountSheet host="profile" />);
    expect(screen.getByText(en.restore.doneTitle)).toBeTruthy();
    expect(screen.getByText(en.restore.doneBody(14, 9))).toBeTruthy();
    expect(screen.getByText(en.restore.doneProfile)).toBeTruthy();
  });

  test('the deletion result shows on Settings, never on Profile', async () => {
    const onSettings = await renderWith(portFor('deleted'), <AccountSheet host="settings" />);
    expect(onSettings.getByText(en.deleted.title)).toBeTruthy();
    expect(onSettings.getByText(en.deleted.gone.apple)).toBeTruthy();
    await onSettings.unmount();
    const onProfile = await renderWith(portFor('deleted'), <AccountSheet host="profile" />);
    expect(onProfile.queryByText(en.deleted.title)).toBeNull();
  });

  test('a development link loads a scenario', async () => {
    mockParams.accountScenario = 'welcome';
    const port = portFor('signedOut');
    await renderWith(port, <AccountSheet host="profile" />);
    expect(port.getSnapshot().result).toMatchObject({ kind: 'signedIn' });
  });
});

describe('the Settings Account group (frames 05, 06, 13, 23, 36)', () => {
  test('signed out, it offers sign-in with the benefit footnote', async () => {
    const port = portFor('signedOut');
    const screen = await renderWith(port, <AccountSettingsSection onOpenAccount={jest.fn()} />);
    expect(screen.getByText(en.settings.group)).toBeTruthy();
    expect(screen.getByText(en.settings.signedOutFooter)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('settings-account-sign-in-row'));
    expect(port.getSnapshot().sheet).toBe('settings');
  });

  test('signed in, it names the method and the sync status and opens Account', async () => {
    const onOpenAccount = jest.fn();
    const screen = await renderWith(portFor('upToDate'), <AccountSettingsSection onOpenAccount={onOpenAccount} />);
    expect(screen.getByText(en.settings.signedIn.apple)).toBeTruthy();
    expect(screen.getByText(en.sync.upToDate)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('settings-account-row'));
    expect(onOpenAccount).toHaveBeenCalledTimes(1);
  });

  test('offline, the row says how many changes wait', async () => {
    const screen = await renderWith(portFor('offline'), <AccountSettingsSection onOpenAccount={jest.fn()} />);
    expect(screen.getByText('Offline · 3 waiting')).toBeTruthy();
  });

  test.each([
    ['deletedNotice', en.settings.deleted],
    ['signedOutNotice', en.settings.signedOut],
  ] as const)('%s replaces the footnote once, until the next visit', async (scenario, text) => {
    const port = portFor(scenario);
    const screen = await renderWith(port, <AccountSettingsSection onOpenAccount={jest.fn()} />);
    expect(screen.getByTestId('settings-account-notice')).toHaveTextContent(text);
    expect(screen.queryByText(en.settings.signedOutFooter)).toBeNull();
    await screen.unmount();
    expect(port.getSnapshot().session).toEqual({ kind: 'signedOut', notice: null });
  });
});

describe('the Account screen (frames 07-10, 21, 22, 34, 35)', () => {
  test('up to date: identity, counts, the last sync and the birth-date sentence', async () => {
    const screen = await renderWith(portFor('upToDate'), <AccountScreen onOpenDelete={jest.fn()} />);
    expect(screen.getByText('q7m2x9kd4v@privaterelay.appleid.com')).toBeTruthy();
    expect(screen.getByText('q7m2x9kd4v@privaterelay.appleid.com').props).toEqual(expect.objectContaining({
      ellipsizeMode: 'middle', numberOfLines: 1,
    }));
    expect(screen.getByText(en.method.apple)).toBeTruthy();
    expect(screen.getByText(en.sync.upToDate)).toBeTruthy();
    expect(screen.getByText('14 pieces')).toBeTruthy();
    expect(screen.getByText('9 days')).toBeTruthy();
    expect(screen.getByText(en.account.included)).toBeTruthy();
    expect(screen.getByText(en.sync.upToDateFooter('06:41'))).toBeTruthy();
    expect(screen.getByText(en.account.connected)).toBeTruthy();
    expect(screen.getByText(en.account.add.google)).toBeTruthy();
  });

  test.each([
    ['offline', en.sync.offline, '3 waiting', en.sync.offlineFooter(3, '06:12')],
    ['syncing', en.sync.syncing, '3 syncing', en.sync.syncingFooter(3, '06:12')],
    ['syncFailed', en.sync.failed, '3 waiting', en.sync.failedFooter(3, '06:12')],
    ['accountRestoring', en.sync.restoring, '8 of 14', en.sync.restoringFooter({ piecesDone: 8, piecesTotal: 14, daysDone: 5, daysTotal: 9 })],
    ['restorePaused', en.sync.offline, '8 of 14', en.sync.pausedFooter({ piecesDone: 8, piecesTotal: 14, daysDone: 5, daysTotal: 9 })],
  ] as const)('%s: status, count and footer', async (scenario, label, value, footer) => {
    const screen = await renderWith(portFor(scenario), <AccountScreen onOpenDelete={jest.fn()} />);
    expect(screen.getByText(label)).toBeTruthy();
    expect(screen.getByText(value)).toBeTruthy();
    expect(screen.getByText(footer)).toBeTruthy();
  });

  test('offline, Sync now waits; after a failure it turns into Try again and syncs', async () => {
    const offlinePort = portFor('offline');
    const offline = await renderWith(offlinePort, <AccountScreen onOpenDelete={jest.fn()} />);
    await fireEvent.press(offline.getByText(en.sync.syncNow));
    expect(offlinePort.getSnapshot()).toBe(accountScenarios.offline);
    await offline.unmount();

    const port = portFor('syncFailed');
    const screen = await renderWith(port, <AccountScreen onOpenDelete={jest.fn()} />);
    await fireEvent.press(screen.getByText(en.sync.retry));
    expect(screen.getByText(en.sync.upToDate)).toBeTruthy();
    expect(port.getSnapshot().session).toMatchObject({ pendingChanges: 0, lastSyncedAt: '2026-10-02T07:05:00.000Z' });
  });

  test('Add Google links a second method', async () => {
    const screen = await renderWith(portFor('upToDate'), <AccountScreen onOpenDelete={jest.fn()} />);
    await fireEvent.press(screen.getByText(en.account.add.google));
    expect(screen.getByTestId('account-method-google-row')).toBeTruthy();
  });

  test('Sign out asks the system first and keeps everything', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const port = portFor('upToDate');
    const screen = await renderWith(port, <AccountScreen onOpenDelete={jest.fn()} />);
    await fireEvent.press(screen.getByText(en.account.signOut));
    expect(alert).toHaveBeenCalledWith(en.signOutAlert.title, en.signOutAlert.body, expect.any(Array));
    const buttons = alert.mock.calls[0][2] as { text: string; onPress?: () => void }[];
    await act(async () => buttons.find((button) => button.text === en.signOutAlert.confirm)?.onPress?.());
    expect(port.getSnapshot().session).toEqual({ kind: 'signedOut', notice: 'signedOut' });
  });

  test('Delete account opens the deletion page', async () => {
    const onOpenDelete = jest.fn();
    const screen = await renderWith(portFor('upToDate'), <AccountScreen onOpenDelete={onOpenDelete} />);
    await fireEvent.press(screen.getByText(en.account.delete));
    expect(onOpenDelete).toHaveBeenCalledTimes(1);
  });

  test('the Turkish screen uses Gardırop', async () => {
    const screen = await renderWith(portFor('upToDate'), <AccountScreen onOpenDelete={jest.fn()} />, 'tr');
    expect(screen.getByText(tr.account.closet)).toBeTruthy();
    expect(screen.getByText('14 parça')).toBeTruthy();
  });
});

describe('the deletion page (frames 11, 12, 25, 37, 38)', () => {
  test('it says what goes and what stays, then deletes after the system alert', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const port = portFor('upToDate');
    const screen = await renderWith(port, <DeleteAccountScreen />);
    expect(screen.getByText(en.deletion.goneAccount.apple)).toBeTruthy();
    expect(screen.getByText(en.deletion.goneData)).toBeTruthy();
    expect(screen.getByText(en.deletion.stay)).toBeTruthy();
    expect(screen.getByText(en.deletion.footer.apple)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('delete-account-button'));
    expect(alert).toHaveBeenCalledWith(en.deleteAlert.title, en.deleteAlert.body, expect.any(Array));
    expect(port.getSnapshot().session.kind).toBe('signedIn');
    const buttons = alert.mock.calls[0][2] as { text: string; onPress?: () => void }[];
    await act(async () => buttons.find((button) => button.text === en.deleteAlert.confirm)?.onPress?.());
    expect(port.getSnapshot()).toMatchObject({
      session: { kind: 'signedOut', notice: 'deleted' },
      sheet: 'settings',
      result: { kind: 'deleted', provider: 'apple' },
    });
  });

  test('while deleting, the button holds its place with the spinner and the time line', async () => {
    const screen = await renderWith(portFor('deleting'), <DeleteAccountScreen />);
    expect(screen.getByTestId('delete-account-button')).toBeDisabled();
    expect(screen.getByTestId('delete-account-deleting')).toHaveTextContent(en.deletion.deleting);
  });

  test('after a failure the button is back with the error line', async () => {
    const screen = await renderWith(portFor('deleteFailed'), <DeleteAccountScreen />);
    expect(screen.getByTestId('delete-account-button')).not.toBeDisabled();
    expect(screen.getByTestId('delete-account-status')).toHaveTextContent(en.deletion.failed);
  });

  test('offline, deletion cannot start', async () => {
    const screen = await renderWith(portFor('deleteOffline'), <DeleteAccountScreen />);
    expect(screen.getByTestId('delete-account-button')).toBeDisabled();
    expect(screen.getByTestId('delete-account-status')).toHaveTextContent(en.deletion.offline);
  });
});
