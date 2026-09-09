import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';

import { runBackgroundWeatherAlertTask } from '@/features/notifications/data/background-weather-alert-task';
import {
  backgroundWeatherAlertMinimumIntervalMinutes,
  backgroundWeatherAlertTaskName,
  registerBackgroundWeatherAlertTask,
} from '@/features/notifications/data/expo-background-weather-alert-task';

jest.mock('expo-background-task', () => ({
  BackgroundTaskStatus: { Restricted: 1, Available: 2 },
  BackgroundTaskResult: { Success: 1, Failed: 2 },
  getStatusAsync: jest.fn(),
  registerTaskAsync: jest.fn(),
}));

jest.mock('expo-task-manager', () => ({
  defineTask: jest.fn(),
  isAvailableAsync: jest.fn(),
  isTaskRegisteredAsync: jest.fn(),
}));

jest.mock('@/features/notifications/data/background-weather-alert-task', () => ({
  runBackgroundWeatherAlertTask: jest.fn(),
}));

jest.mock('@/features/notifications/data/expo-notification-gateway', () => ({
  ExpoNotificationGateway: class {
    getPermissionState = async () => ({ kind: 'granted' as const });
  },
}));

jest.mock('@/features/weather/application/weather-application-provider', () => ({
  createWeatherProvider: () => ({ fetchSnapshot: jest.fn() }),
}));

const backgroundTask = BackgroundTask as jest.Mocked<typeof BackgroundTask>;
const taskManager = TaskManager as jest.Mocked<typeof TaskManager>;
const runTask = runBackgroundWeatherAlertTask as jest.MockedFunction<
  typeof runBackgroundWeatherAlertTask
>;
const definition = taskManager.defineTask.mock.calls[0];
const executor = definition?.[1];

beforeEach(() => {
  backgroundTask.getStatusAsync.mockReset().mockResolvedValue(
    BackgroundTask.BackgroundTaskStatus.Available,
  );
  backgroundTask.registerTaskAsync.mockReset().mockResolvedValue(undefined);
  taskManager.isAvailableAsync.mockReset().mockResolvedValue(true);
  taskManager.isTaskRegisteredAsync.mockReset().mockResolvedValue(false);
  runTask.mockReset().mockResolvedValue('success');
});

test('defines the task once at module scope', () => {
  expect(taskManager.defineTask).toHaveBeenCalledTimes(1);
  expect(definition?.[0]).toBe(backgroundWeatherAlertTaskName);
});

test('registers once with the documented minimum interval and then observes persistence', async () => {
  taskManager.isTaskRegisteredAsync
    .mockResolvedValueOnce(false)
    .mockResolvedValueOnce(true);

  await registerBackgroundWeatherAlertTask();
  await registerBackgroundWeatherAlertTask();

  expect(backgroundWeatherAlertMinimumIntervalMinutes).toBe(15);
  expect(backgroundTask.registerTaskAsync).toHaveBeenCalledTimes(1);
  expect(backgroundTask.registerTaskAsync).toHaveBeenCalledWith(
    backgroundWeatherAlertTaskName,
    { minimumInterval: 15 },
  );
});

test.each([
  ['task manager unavailable', false, BackgroundTask.BackgroundTaskStatus.Available],
  ['background tasks restricted', true, BackgroundTask.BackgroundTaskStatus.Restricted],
])('%s skips registration', async (_name, taskManagerAvailable, status) => {
  taskManager.isAvailableAsync.mockResolvedValue(taskManagerAvailable);
  backgroundTask.getStatusAsync.mockResolvedValue(status);

  await expect(registerBackgroundWeatherAlertTask()).resolves.toBeUndefined();

  expect(taskManager.isTaskRegisteredAsync).not.toHaveBeenCalled();
  expect(backgroundTask.registerTaskAsync).not.toHaveBeenCalled();
});

test('registration SDK failures stay inside the adapter', async () => {
  backgroundTask.getStatusAsync.mockRejectedValue(new Error('status failed'));

  await expect(registerBackgroundWeatherAlertTask()).resolves.toBeUndefined();
});

test.each([
  ['success', BackgroundTask.BackgroundTaskResult.Success],
  ['failed', BackgroundTask.BackgroundTaskResult.Failed],
] as const)('maps the pure %s outcome to the SDK result', async (outcome, expected) => {
  runTask.mockResolvedValue(outcome);

  await expect(executor?.({
    data: undefined,
    error: null,
    executionInfo: { eventId: 'event-id', taskName: backgroundWeatherAlertTaskName },
  })).resolves.toBe(expected);
});

test('an SDK-reported task error fails without running the pure task', async () => {
  await expect(executor?.({
    data: undefined,
    error: { code: 'failed', message: 'native failure' },
    executionInfo: { eventId: 'event-id', taskName: backgroundWeatherAlertTaskName },
  })).resolves.toBe(BackgroundTask.BackgroundTaskResult.Failed);
  expect(runTask).not.toHaveBeenCalled();
});
