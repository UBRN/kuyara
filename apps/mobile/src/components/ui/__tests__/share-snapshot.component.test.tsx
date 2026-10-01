import { Share, type View } from 'react-native';

const viewRef = { current: null as View | null };

afterEach(() => {
  jest.restoreAllMocks();
  jest.resetModules();
  jest.dontMock('react-native-view-shot');
});

test('importing the module does not load the capture library, so a missing native module cannot fail the launch', () => {
  const loaded = jest.fn();
  jest.doMock('react-native-view-shot', () => {
    loaded();
    return { captureRef: jest.fn(), releaseCapture: jest.fn() };
  });
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('@/components/ui/share-snapshot');
  });
  expect(loaded).not.toHaveBeenCalled();
});

test('a capture library that throws on load fails only the share', async () => {
  jest.doMock('react-native-view-shot', () => {
    throw new Error('TurboModule RNViewShot is not found');
  });
  const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: Share.sharedAction });
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { shareSnapshot } = require('@/components/ui/share-snapshot') as typeof import('@/components/ui/share-snapshot');
  await expect(shareSnapshot(viewRef)).resolves.toBeUndefined();
  expect(share).not.toHaveBeenCalled();
});
