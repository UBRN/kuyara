import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import SettingsRoute from '@/app/(tabs)/(profile)/settings';
import NotificationsSettingsRoute from '@/app/(tabs)/(profile)/settings/notifications';
import { ProductAnalyticsProvider } from '@/features/analytics/application/product-analytics-provider';
import { InMemoryFirstUseStore } from '@/features/analytics/data/in-memory-first-use-store';
import { RecordingProductAnalytics } from '@/features/analytics/data/recording-product-analytics';
import { NotificationApplicationProvider } from '@/features/notifications/application/notification-application-provider';
import type { NotificationGateway, NotificationKind, NotificationPermissionState } from '@/features/notifications/data/notification-gateway';
import { useProfileApplication } from '@/features/profile/application/profile-context';
import { ProfileApplicationProvider } from '@/features/profile/application/profile-application-provider';
import type { LocalProfileRecord } from '@/features/profile/data/local-profile-record';
import { messages } from '@/localization/messages';

jest.mock('expo-symbols', () => ({
  SymbolView: () => null,
}));

jest.mock('@expo/ui', () => jest.requireActual('@/components/ui/__tests__/expo-ui-test-mock'));
jest.mock('@expo/ui/swift-ui', () => jest.requireActual('@/components/ui/__tests__/expo-ui-test-mock'));
jest.mock('@expo/ui/swift-ui/modifiers', () => jest.requireActual('@/components/ui/__tests__/expo-ui-test-mock'));

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), navigate: jest.fn(), push: jest.fn() },
  Stack: { Screen: () => null },
  useFocusEffect: () => undefined,
}));

const mockRouter = jest.requireMock('expo-router').router as {
  back: jest.Mock;
  navigate: jest.Mock;
  push: jest.Mock;
};

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

    updateMorningBriefingOptIn = async (morningBriefingOptIn: boolean) =>
      (mockProfile = { ...mockProfile, morningBriefingOptIn: morningBriefingOptIn ? 1 : 0 });
  },
}));

const initialMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, right: 0, bottom: 34, left: 0 },
};

function createProfile(): LocalProfileRecord {
  return {
    id: 'profile-id',
    gender: 'woman',
    dressStyle: 'smart',
    birthDate: null,
    languagePreference: 'en',
    themePreference: 'light',
    onboardingCompleted: 1,
    notificationsOptIn: 0,
    weatherAlertOfferShown: 0,
    morningBriefingOptIn: 0,
    analyticsConsent: 'undecided',
    createdAt: '2026-07-30T10:00:00.000Z',
    updatedAt: '2026-07-30T10:00:00.000Z',
    deletedAt: null,
  };
}

function createGateway(permission: 'undetermined' | 'denied' | 'granted') {
  const openApplicationSettings = jest.fn(async () => undefined);
  const permissionStates = {
    denied: { kind: 'denied' as const, canRequestAgain: false },
    granted: { kind: 'granted' as const },
    undetermined: { kind: 'undetermined' as const },
  };
  return {
    gateway: {
      getPermissionState: async () => permissionStates[permission],
      requestPermission: async () => ({ kind: 'granted' as const }),
      openApplicationSettings,
      cancelScheduledWeatherAlerts: async () => true,
      scheduleWeatherAlert: async () => true,
      subscribeToResponses: (_listener: (kind: NotificationKind) => void) => () => undefined,
    },
    openApplicationSettings,
  };
}

function NotificationBridge({
  children,
  gateway,
}: Readonly<{
  children: React.ReactNode;
  gateway: NotificationGateway;
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

// ADR 0030 section 5: the toggle now lives on `/settings/notifications`, reached from the
// root list's Notifications row, so this harness mirrors `MountedSettingsRoutes` in
// `preference-propagation.component.test.tsx` rather than mounting the toggle directly.
function MountedNotificationRoutes({ onMount }: Readonly<{ onMount: () => void }>) {
  const [route, setRoute] = useState<'notifications' | 'settings'>('settings');

  useEffect(onMount, [onMount]);
  useEffect(() => {
    mockRouter.back.mockImplementation(() => setRoute('settings'));
    mockRouter.push.mockImplementation((path: string) => {
      if (path === '/settings/notifications') {
        setRoute('notifications');
      }
    });
  }, []);

  return route === 'notifications' ? <NotificationsSettingsRoute /> : <SettingsRoute />;
}

function renderSettings(
  gateway: NotificationGateway,
  analytics: RecordingProductAnalytics,
) {
  return render(
    <SafeAreaProvider initialMetrics={initialMetrics}>
      <ProfileApplicationProvider>
        <ProductAnalyticsProvider
          analytics={analytics}
          firstUseStore={new InMemoryFirstUseStore()}>
          <NotificationBridge gateway={gateway}>
            <MountedNotificationRoutes onMount={() => {}} />
          </NotificationBridge>
        </ProductAnalyticsProvider>
      </ProfileApplicationProvider>
    </SafeAreaProvider>,
  );
}

test('granting permission from the switch persists the opt-in flag and reports the resolved outcome', async () => {
  mockProfile = createProfile();
  const { gateway } = createGateway('undetermined');
  const analytics = new RecordingProductAnalytics();
  const result = await renderSettings(gateway, analytics);

  await fireEvent.press(await result.findByTestId('settings-notifications-row'));
  const toggle = await result.findByTestId('settings-notifications-toggle-row-toggle');

  await act(async () => {
    fireEvent(toggle, 'valueChange', true);
  });

  await waitFor(() => expect(
    result.getByTestId('settings-notifications-toggle-row-toggle').props.value,
  ).toBe(true));

  await waitFor(() => expect(analytics.names()).toEqual([
    'setting_changed',
    'notification_permission_resolved',
    'feature_used_first_time',
  ]));
  expect(analytics.captures.map((capture) => capture.properties)).toEqual([
    { schema_version: 3, setting_name: 'notifications_enabled', new_value: true },
    { schema_version: 3, outcome: 'enabled' },
    { schema_version: 3, feature_name: 'notifications' },
  ]);
});

test('denied permission shows the hint, opens application settings, and reports a blocked outcome', async () => {
  mockProfile = createProfile();
  const { gateway, openApplicationSettings } = createGateway('denied');
  const analytics = new RecordingProductAnalytics();
  const result = await renderSettings(gateway, analytics);

  await fireEvent.press(await result.findByTestId('settings-notifications-row'));

  expect(await result.findByText(messages.en.notifications.permissionDeniedHint))
    .toBeOnTheScreen();
  fireEvent.press(result.getByTestId('settings-notifications-open-settings'));
  expect(openApplicationSettings).toHaveBeenCalledTimes(1);

  const toggle = await result.findByTestId('settings-notifications-toggle-row-toggle');
  await act(async () => {
    fireEvent(toggle, 'valueChange', true);
  });

  // Blocked by the OS permission: the persisted opt-in never changes, so only the
  // permission outcome is reported, not `setting_changed`.
  await waitFor(() => expect(analytics.names()).toEqual(['notification_permission_resolved']));
  expect(analytics.captures[0].properties).toEqual({
    schema_version: 3,
    outcome: 'blocked',
    can_request_again: false,
  });
});

test('a tapped notification response is reported as notification_opened and opens Today', async () => {
  mockProfile = createProfile();
  const { gateway } = createGateway('undetermined');
  let respond: ((kind: NotificationKind) => void) | null = null;
  const respondingGateway = {
    ...gateway,
    subscribeToResponses: (listener: (kind: NotificationKind) => void) => {
      respond = listener;
      return () => undefined;
    },
  };
  const analytics = new RecordingProductAnalytics();
  const result = await renderSettings(respondingGateway, analytics);
  await result.findByTestId('settings-notifications-row');

  await act(async () => {
    respond?.('morning_briefing');
  });

  // Taxonomy 5.13: the tap is named by kind and by nothing else.
  const opened = analytics.captures.find((capture) => capture.name === 'notification_opened');
  expect(opened?.properties).toEqual({ schema_version: 3, kind: 'morning_briefing' });
  expect(mockRouter.navigate).toHaveBeenCalledWith('/');
});

test('the morning briefing is its own row and reports the same events the alert row does', async () => {
  mockProfile = createProfile();
  const { gateway } = createGateway('undetermined');
  const analytics = new RecordingProductAnalytics();
  const result = await renderSettings(gateway, analytics);

  await fireEvent.press(await result.findByTestId('settings-notifications-row'));
  const briefing = await result.findByTestId('settings-morning-briefing-toggle-row-toggle');

  await act(async () => {
    fireEvent(briefing, 'valueChange', true);
  });

  await waitFor(() => expect(
    result.getByTestId('settings-morning-briefing-toggle-row-toggle').props.value,
  ).toBe(true));
  // The weather alert row is untouched: the two opt-ins are independent.
  expect(result.getByTestId('settings-notifications-toggle-row-toggle').props.value).toBe(false);
  await waitFor(() => expect(analytics.names()).toEqual([
    'setting_changed',
    'notification_permission_resolved',
    'feature_used_first_time',
  ]));
  expect(analytics.captures.map((capture) => capture.properties)).toEqual([
    { schema_version: 3, setting_name: 'morning_briefing_enabled', new_value: true },
    { schema_version: 3, outcome: 'enabled' },
    { schema_version: 3, feature_name: 'notifications' },
  ]);

  await act(async () => {
    fireEvent(
      result.getByTestId('settings-morning-briefing-toggle-row-toggle'),
      'valueChange',
      false,
    );
  });

  await waitFor(() => expect(analytics.captures).toHaveLength(4));
  expect(analytics.captures[3].properties).toEqual({
    schema_version: 3,
    setting_name: 'morning_briefing_enabled',
    new_value: false,
  });
});

test('an opt-in the OS revoked reads Off on the Settings root row', async () => {
  // The alert row is the only Settings row valued from these keys, so the single Off is
  // unambiguously its own and no On is left anywhere on the screen.
  mockProfile = { ...createProfile(), notificationsOptIn: 1, analyticsConsent: 'granted' };
  const { gateway } = createGateway('denied');
  const result = await renderSettings(gateway, new RecordingProductAnalytics());

  await result.findByTestId('settings-notifications-row');
  await waitFor(() => expect(result.getAllByText(messages.en.notifications.statusOff))
    .toHaveLength(1));
  expect(result.queryByText(messages.en.notifications.statusOn)).not.toBeOnTheScreen();
});

// ADR 0004: the root row stands for the whole Notifications surface, so the briefing alone
// is enough to read On once the OS permission agrees.
test('the briefing alone reads On on the Settings root row', async () => {
  mockProfile = { ...createProfile(), morningBriefingOptIn: 1 };
  const { gateway } = createGateway('granted');
  const result = await renderSettings(gateway, new RecordingProductAnalytics());

  await result.findByTestId('settings-notifications-row');
  await waitFor(() => expect(result.getAllByText(messages.en.notifications.statusOn))
    .toHaveLength(1));
  expect(result.queryByText(messages.en.notifications.statusOff)).not.toBeOnTheScreen();
});

test('the blocked sub-screen keeps the preference on the toggle beside the denied footer', async () => {
  // ADR 0030 section 5: the toggle shows the stored preference and the footer, plus the
  // Open Settings row, carry why it is not in force.
  mockProfile = { ...createProfile(), notificationsOptIn: 1 };
  const { gateway } = createGateway('denied');
  const result = await renderSettings(gateway, new RecordingProductAnalytics());

  await fireEvent.press(await result.findByTestId('settings-notifications-row'));

  expect((await result.findByTestId('settings-notifications-toggle-row-toggle')).props.value)
    .toBe(true);
  expect(result.getByText(messages.en.notifications.permissionDeniedHint)).toBeOnTheScreen();
  expect(result.getByTestId('settings-notifications-open-settings')).toBeOnTheScreen();
});

test('a permission prompt left unanswered still shows the denied hint on the blocked attempt', async () => {
  mockProfile = createProfile();
  const { gateway } = createGateway('undetermined');
  const result = await renderSettings(
    { ...gateway, requestPermission: async () => ({ kind: 'undetermined' as const }) },
    new RecordingProductAnalytics(),
  );

  await fireEvent.press(await result.findByTestId('settings-notifications-row'));
  expect(result.getByText(messages.en.notifications.introduction, { exact: false }))
    .toBeOnTheScreen();

  await act(async () => {
    fireEvent(await result.findByTestId('settings-notifications-toggle-row-toggle'), 'valueChange', true);
  });

  await waitFor(() => expect(result.getByText(messages.en.notifications.permissionDeniedHint))
    .toBeOnTheScreen());
  expect(result.getByTestId('settings-notifications-open-settings')).toBeOnTheScreen();
});

test('granting permission in system settings clears the hint the refused opt-in left', async () => {
  // The refusal is remembered so the footer survives a prompt left unanswered, but the
  // permission read on `active` outranks it once the OS says notifications are allowed.
  mockProfile = createProfile();
  const addEventListener = jest.spyOn(AppState, 'addEventListener')
    .mockReturnValue({ remove: () => undefined });
  let permission: NotificationPermissionState = { kind: 'undetermined' };
  const { gateway } = createGateway('undetermined');
  const result = await renderSettings(
    {
      ...gateway,
      getPermissionState: async () => permission,
      requestPermission: async () => ({ kind: 'undetermined' as const }),
    },
    new RecordingProductAnalytics(),
  );

  await fireEvent.press(await result.findByTestId('settings-notifications-row'));
  await act(async () => {
    fireEvent(
      await result.findByTestId('settings-notifications-toggle-row-toggle'),
      'valueChange',
      true,
    );
  });
  await waitFor(() => expect(result.getByText(messages.en.notifications.permissionDeniedHint))
    .toBeOnTheScreen());

  permission = { kind: 'granted' };
  await act(async () => {
    addEventListener.mock.calls.forEach(([, listener]) => listener('active'));
  });

  await waitFor(() => expect(result.queryByText(messages.en.notifications.permissionDeniedHint))
    .toBeNull());
  expect(result.queryByTestId('settings-notifications-open-settings')).toBeNull();
  addEventListener.mockRestore();
});
