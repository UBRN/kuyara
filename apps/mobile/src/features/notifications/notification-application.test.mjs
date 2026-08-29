import assert from 'node:assert/strict';
import test from 'node:test';

import { NotificationApplicationController } from './application/notification-application-controller.ts';

function createGateway(permission, requestedPermission = permission) {
  let requestCount = 0;
  return {
    gateway: {
      getPermissionState: async () => permission,
      requestPermission: async () => {
        requestCount += 1;
        return requestedPermission;
      },
      openApplicationSettings: async () => undefined,
      scheduleTestNotification: async () => true,
      subscribeToResponses: () => () => undefined,
    },
    getRequestCount: () => requestCount,
  };
}

test('granted permission after requesting persists opt-in', async () => {
  const { gateway } = createGateway(
    { kind: 'undetermined' },
    { kind: 'granted' },
  );
  const persisted = [];
  const controller = new NotificationApplicationController(
    gateway,
    async (optIn) => persisted.push(optIn),
  );

  assert.equal(await controller.setOptIn(true), 'enabled');
  assert.deepEqual(persisted, [true]);
  assert.deepEqual(controller.getSnapshot(), {
    permission: { kind: 'granted' },
    isBusy: false,
  });
});

test('denied permission after requesting does not persist opt-in', async () => {
  const { gateway } = createGateway(
    { kind: 'undetermined' },
    { kind: 'denied', canRequestAgain: false },
  );
  const persisted = [];
  const controller = new NotificationApplicationController(
    gateway,
    async (optIn) => persisted.push(optIn),
  );

  assert.equal(await controller.setOptIn(true), 'blocked');
  assert.deepEqual(persisted, []);
});

test('permission already denied does not request or persist opt-in', async () => {
  const { gateway, getRequestCount } = createGateway({
    kind: 'denied',
    canRequestAgain: false,
  });
  const persisted = [];
  const controller = new NotificationApplicationController(
    gateway,
    async (optIn) => persisted.push(optIn),
  );

  assert.equal(await controller.setOptIn(true), 'blocked');
  assert.equal(getRequestCount(), 0);
  assert.deepEqual(persisted, []);
});

test('opting out persists false and refreshes permission', async () => {
  const { gateway } = createGateway({ kind: 'granted' });
  const persisted = [];
  const controller = new NotificationApplicationController(
    gateway,
    async (optIn) => persisted.push(optIn),
  );

  assert.equal(await controller.setOptIn(false), 'disabled');
  assert.deepEqual(persisted, [false]);
  assert.deepEqual(controller.getSnapshot(), {
    permission: { kind: 'granted' },
    isBusy: false,
  });
});

test('a rejected persistence operation does not leave the controller busy', async () => {
  const failure = new Error('write failed');
  const { gateway } = createGateway({ kind: 'granted' });
  const controller = new NotificationApplicationController(
    gateway,
    async () => {
      throw failure;
    },
  );

  await assert.rejects(() => controller.setOptIn(true), (error) => error === failure);
  assert.equal(controller.getSnapshot().isBusy, false);
});
