import { Platform } from 'react-native';

import { ExpoNotificationGateway } from '@/features/notifications/data/expo-notification-gateway';

const notifications = jest.requireMock('expo-notifications') as {
  getAllScheduledNotificationsAsync: jest.Mock;
  cancelScheduledNotificationAsync: jest.Mock;
  scheduleNotificationAsync: jest.Mock;
  setNotificationChannelAsync: jest.Mock;
  addNotificationResponseReceivedListener: jest.Mock;
  getLastNotificationResponse: jest.Mock;
  clearLastNotificationResponse: jest.Mock;
};

jest.mock('@/localization/device-locale', () => ({ getDeviceLocale: () => 'tr-TR' }));

jest.mock('expo-notifications', () => ({
  AndroidImportance: { DEFAULT: 5 },
  SchedulableTriggerInputTypes: { DATE: 'date' },
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  addNotificationResponseReceivedListener: jest.fn(),
  getLastNotificationResponse: jest.fn(),
  clearLastNotificationResponse: jest.fn(),
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

test('cancellation tries every prefixed kuyara weather alert and reports the failure', async () => {
  notifications.getAllScheduledNotificationsAsync.mockResolvedValue([
    { identifier: 'foreign-alert' },
    { identifier: 'weather-alert:first' },
    { identifier: 'weather-alert:second' },
  ]);
  notifications.cancelScheduledNotificationAsync
    .mockRejectedValueOnce(new Error('cancel failed'))
    .mockResolvedValueOnce(undefined);

  await expect(new ExpoNotificationGateway().cancelScheduledWeatherAlerts())
    .resolves.toBe(false);

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

test('native scheduling failures stay inside the adapter and are reported', async () => {
  notifications.scheduleNotificationAsync.mockRejectedValue(new Error('schedule failed'));

  await expect(new ExpoNotificationGateway().scheduleWeatherAlert({
    identifier: 'weather-id',
    fireAt: '2026-09-09T12:00:00.000Z',
    title: 'Rain is on the way',
    body: 'Rain is expected around 12:00.',
  })).resolves.toBe(false);
});

test('a listing failure reports the cancellation as unsuccessful', async () => {
  notifications.getAllScheduledNotificationsAsync
    .mockRejectedValue(new Error('listing failed'));

  await expect(new ExpoNotificationGateway().cancelScheduledWeatherAlerts())
    .resolves.toBe(false);
});

test('a tap that launched the app is delivered once and then cleared', () => {
  // The launch response is emitted before any JS listener exists, so subscribing has to
  // pick it up, deliver it while it is still readable, and clear it afterwards.
  notifications.addNotificationResponseReceivedListener.mockReturnValue({ remove: () => {} });
  notifications.getLastNotificationResponse
    .mockReturnValueOnce({ notification: { request: { identifier: 'weather-alert:rain' } } })
    .mockReturnValueOnce(null);
  const gateway = new ExpoNotificationGateway();
  const order: string[] = [];
  notifications.clearLastNotificationResponse.mockImplementationOnce(() => order.push('clear'));
  const listener = jest.fn(() => order.push('listener'));

  gateway.subscribeToResponses(listener);
  gateway.subscribeToResponses(listener);

  expect(listener).toHaveBeenCalledTimes(1);
  expect(order).toEqual(['listener', 'clear']);
});

test('a tap taken while the app runs is cleared, so a later subscription cannot replay it', () => {
  notifications.addNotificationResponseReceivedListener.mockReturnValue({ remove: () => {} });
  notifications.getLastNotificationResponse.mockReturnValue(null);
  const listener = jest.fn();

  new ExpoNotificationGateway().subscribeToResponses(listener);
  const [delivered] = notifications.addNotificationResponseReceivedListener.mock.calls[0];
  delivered();

  expect(listener).toHaveBeenCalledTimes(1);
  expect(notifications.clearLastNotificationResponse).toHaveBeenCalledTimes(1);
});

test('a native module without the stored response keeps the warm path working', () => {
  notifications.addNotificationResponseReceivedListener.mockReturnValue({ remove: () => {} });
  notifications.getLastNotificationResponse.mockImplementationOnce(() => {
    throw new Error('unavailable');
  });
  const listener = jest.fn();

  const unsubscribe = new ExpoNotificationGateway().subscribeToResponses(listener);

  expect(notifications.addNotificationResponseReceivedListener).toHaveBeenCalledTimes(1);
  expect(listener).not.toHaveBeenCalled();
  expect(() => unsubscribe()).not.toThrow();
});
