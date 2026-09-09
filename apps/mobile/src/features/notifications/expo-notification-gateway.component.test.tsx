import { Platform } from 'react-native';

import { ExpoNotificationGateway } from '@/features/notifications/data/expo-notification-gateway';

const notifications = jest.requireMock('expo-notifications') as {
  getAllScheduledNotificationsAsync: jest.Mock;
  cancelScheduledNotificationAsync: jest.Mock;
  scheduleNotificationAsync: jest.Mock;
  setNotificationChannelAsync: jest.Mock;
};

jest.mock('@/localization/device-locale', () => ({ getDeviceLocale: () => 'tr-TR' }));

jest.mock('expo-notifications', () => ({
  AndroidImportance: { DEFAULT: 5 },
  SchedulableTriggerInputTypes: { DATE: 'date' },
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  addNotificationResponseReceivedListener: jest.fn(),
  getAllScheduledNotificationsAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
}));

const originalPlatform = Platform.OS;

afterEach(() => {
  jest.clearAllMocks();
  Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatform });
});

test('cancellation removes only prefixed kuyara weather alerts and continues after a failure', async () => {
  notifications.getAllScheduledNotificationsAsync.mockResolvedValue([
    { identifier: 'foreign-alert' },
    { identifier: 'weather-alert:first' },
    { identifier: 'weather-alert:second' },
  ]);
  notifications.cancelScheduledNotificationAsync
    .mockRejectedValueOnce(new Error('cancel failed'))
    .mockResolvedValueOnce(undefined);

  await expect(new ExpoNotificationGateway().cancelScheduledWeatherAlerts())
    .resolves.toBeUndefined();

  expect(notifications.cancelScheduledNotificationAsync.mock.calls).toEqual([
    ['weather-alert:first'],
    ['weather-alert:second'],
  ]);
});

test('Android scheduling creates one silent default channel and uses prefixed identifiers', async () => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
  notifications.setNotificationChannelAsync.mockResolvedValue({});
  notifications.scheduleNotificationAsync.mockResolvedValue('scheduled');
  const gateway = new ExpoNotificationGateway();
  const request = {
    identifier: 'precipitation_onset:location:2026-09-09',
    fireAt: '2026-09-09T12:00:00.000Z',
    title: 'Yağmur geliyor',
    body: 'Saat 15:00 civarında yağmur bekleniyor.',
  };

  await gateway.scheduleWeatherAlert(request);
  await gateway.scheduleWeatherAlert({ ...request, identifier: 'second' });

  expect(notifications.setNotificationChannelAsync).toHaveBeenCalledTimes(1);
  expect(notifications.setNotificationChannelAsync).toHaveBeenCalledWith(
    'weather-alerts',
    { name: 'Bildirimler', importance: 5, sound: null },
  );
  expect(notifications.scheduleNotificationAsync).toHaveBeenNthCalledWith(1, {
    identifier: `weather-alert:${request.identifier}`,
    content: { title: request.title, body: request.body },
    trigger: {
      type: 'date',
      date: new Date(request.fireAt),
      channelId: 'weather-alerts',
    },
  });
});

test('native scheduling failures stay inside the adapter', async () => {
  notifications.scheduleNotificationAsync.mockRejectedValue(new Error('schedule failed'));

  await expect(new ExpoNotificationGateway().scheduleWeatherAlert({
    identifier: 'weather-id',
    fireAt: '2026-09-09T12:00:00.000Z',
    title: 'Rain is on the way',
    body: 'Rain is expected around 12:00.',
  })).resolves.toBeUndefined();
});
