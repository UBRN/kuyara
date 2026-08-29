import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import SettingsRoute from '@/app/(tabs)/settings';
import { NotificationApplicationProvider } from '@/features/notifications/application/notification-application-provider';
import { useProfileApplication } from '@/features/profile/application/profile-context';
import { ProfileApplicationProvider } from '@/features/profile/application/profile-application-provider';
import type { LocalProfileRecord } from '@/features/profile/data/local-profile-record';
import { messages } from '@/localization/messages';

jest.mock('expo-symbols', () => ({
  SymbolView: () => null,
}));

jest.mock('expo-router', () => ({
  router: { navigate: jest.fn() },
}));

jest.mock('@/features/notifications/data/expo-notification-gateway', () => ({
  ExpoNotificationGateway: class {},
}));

jest.mock('@/infrastructure/sqlite/expo-sqlite-database', () => ({
  openKuyaraDatabase: async () => ({}),
}));

jest.mock('@/infrastructure/sqlite/migrations', () => ({
  migrateDatabase: async () => undefined,
}));

let mockProfile = createProfile();

jest.mock('@/features/profile/data/sqlite-profile-local-data-source', () => ({
  SqliteProfileLocalDataSource: class {
    getOrCreateProfile = async () => mockProfile;

    updateNotificationsOptIn = async (notificationsOptIn: boolean) =>
      (mockProfile = { ...mockProfile, notificationsOptIn: notificationsOptIn ? 1 : 0 });
  },
}));

const initialMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, right: 0, bottom: 34, left: 0 },
};

function createProfile(): LocalProfileRecord {
  return {
    id: 'profile-id',
    clothingPreference: 'womens',
    languagePreference: 'en',
    themePreference: 'light',
    onboardingCompleted: 1,
    notificationsOptIn: 0,
    createdAt: '2026-07-30T10:00:00.000Z',
    updatedAt: '2026-07-30T10:00:00.000Z',
    deletedAt: null,
  };
}

function createGateway(permission: 'undetermined' | 'denied') {
  const openApplicationSettings = jest.fn(async () => undefined);
  return {
    gateway: {
      getPermissionState: async () => permission === 'denied'
        ? { kind: 'denied' as const, canRequestAgain: false }
        : { kind: 'undetermined' as const },
      requestPermission: async () => ({ kind: 'granted' as const }),
      openApplicationSettings,
      scheduleTestNotification: async () => true,
      subscribeToResponses: () => () => undefined,
    },
    openApplicationSettings,
  };
}

function NotificationBridge({
  children,
  gateway,
}: Readonly<{
  children: React.ReactNode;
  gateway: ReturnType<typeof createGateway>['gateway'];
}>) {
  const { state, updateNotificationsOptIn } = useProfileApplication();
  if (state.status !== 'ready') {
    return null;
  }

  return (
    <NotificationApplicationProvider
      gateway={gateway}
      notificationsOptIn={state.profile.notificationsOptIn}
      persistOptIn={updateNotificationsOptIn}>
      {children}
    </NotificationApplicationProvider>
  );
}

function renderSettings(gateway: ReturnType<typeof createGateway>['gateway']) {
  return render(
    <SafeAreaProvider initialMetrics={initialMetrics}>
      <ProfileApplicationProvider>
        <NotificationBridge gateway={gateway}>
          <SettingsRoute />
        </NotificationBridge>
      </ProfileApplicationProvider>
    </SafeAreaProvider>,
  );
}

test('granting permission from the switch persists the opt-in flag', async () => {
  mockProfile = createProfile();
  const { gateway } = createGateway('undetermined');
  const result = await renderSettings(gateway);
  const toggle = await result.findByTestId('settings-notifications-toggle');

  await act(async () => {
    fireEvent(toggle, 'valueChange', true);
  });

  await waitFor(() => expect(
    result.getByTestId('settings-notifications-toggle').props.value,
  ).toBe(true));
});

test('denied permission shows the hint and opens application settings', async () => {
  mockProfile = createProfile();
  const { gateway, openApplicationSettings } = createGateway('denied');
  const result = await renderSettings(gateway);

  expect(await result.findByText(messages.en.notifications.permissionDeniedHint))
    .toBeOnTheScreen();
  fireEvent.press(result.getByTestId('settings-notifications-open-settings'));
  expect(openApplicationSettings).toHaveBeenCalledTimes(1);
});
