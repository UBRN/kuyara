import { act, render } from '@testing-library/react-native';
import { useState } from 'react';
import { AppState, type AppStateStatus, Platform } from 'react-native';
import * as Reanimated from 'react-native-reanimated';

import { LaunchCurtain, LaunchOpenContext } from '@/components/ui/launch-curtain';
import { usePresentationHold } from '@/components/ui/presentation-hold';
import {
  resetReviewRequestProcess,
  REVIEW_REQUEST_SETTLE_MS,
  ReviewRequestObserver,
} from '@/features/feedback/application/review-request-observer';
import { standardMotion } from '@/theme/theme';

const mockRequest = jest.fn(async () => undefined);
let mockOnboardingCompleted = true;

jest.mock('@/features/feedback/data/store-review', () => ({ requestStoreReview: () => mockRequest() }));
jest.mock('@/features/profile/application/profile-context', () => ({
  useProfileApplication: () => ({
    state: { status: 'ready', profile: { onboardingCompleted: mockOnboardingCompleted } },
  }),
}));

// Anything presented over the screen holds it, as a sheet, a prompt, the tour or a curtain does.
function Presented({ held }: Readonly<{ held: boolean }>) {
  usePresentationHold(held);
  return null;
}

// `open` is the launch's count of opens: the cold launch is 0, each return that plays the
// launch adds one.
const app = (open = 0, held = false) => (
  <LaunchOpenContext value={open}>
    <Presented held={held} />
    <ReviewRequestObserver />
  </LaunchOpenContext>
);

let appStateListeners: ((state: AppStateStatus) => void)[] = [];
async function moveApp(state: AppStateStatus) {
  AppState.currentState = state;
  await act(() => appStateListeners.forEach((listener) => listener(state)));
}

async function settle() {
  await act(() => jest.advanceTimersByTime(REVIEW_REQUEST_SETTLE_MS));
}

beforeEach(() => {
  jest.useFakeTimers();
  resetReviewRequestProcess();
  mockRequest.mockClear();
  mockOnboardingCompleted = true;
  AppState.currentState = 'active';
  appStateListeners = [];
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((
    _type: string,
    listener: (state: AppStateStatus) => void,
  ) => {
    appStateListeners.push(listener);
    return { remove: () => { appStateListeners = appStateListeners.filter((item) => item !== listener); } };
  }) as unknown as typeof AppState.addEventListener);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

test('finishing onboarding asks on the first Today once nothing is presented over it', async () => {
  mockOnboardingCompleted = false;
  const view = await render(app());
  await settle();
  expect(mockRequest).not.toHaveBeenCalled();

  mockOnboardingCompleted = true;
  await view.rerender(app());
  await act(() => jest.advanceTimersByTime(REVIEW_REQUEST_SETTLE_MS - 1));
  expect(mockRequest).not.toHaveBeenCalled();
  await act(() => jest.advanceTimersByTime(1));
  expect(mockRequest).toHaveBeenCalledTimes(1);
});

test('a later cold launch asks again', async () => {
  const first = await render(app());
  await settle();
  await first.unmount();

  // A new process: nothing asked in it yet.
  resetReviewRequestProcess();
  await render(app());
  await settle();
  expect(mockRequest).toHaveBeenCalledTimes(2);
});

test('a return that plays the return launch asks again; a shorter one, the same open, does not', async () => {
  const view = await render(app(0));
  await settle();
  expect(mockRequest).toHaveBeenCalledTimes(1);

  // A 20 s return plays no launch, so it is still the cold launch's open.
  await moveApp('background');
  await act(() => jest.advanceTimersByTime(20_000));
  await moveApp('active');
  await settle();
  expect(mockRequest).toHaveBeenCalledTimes(1);

  await view.rerender(app(1));
  await settle();
  expect(mockRequest).toHaveBeenCalledTimes(2);
});

test('a sheet holds the request; once it closes the open asks once, and no more', async () => {
  const view = await render(app(0, true));
  await act(() => jest.advanceTimersByTime(60_000));
  expect(mockRequest).not.toHaveBeenCalled();

  await view.rerender(app(0, false));
  await settle();
  expect(mockRequest).toHaveBeenCalledTimes(1);

  await view.rerender(app(0, true));
  await view.rerender(app(0, false));
  await settle();
  expect(mockRequest).toHaveBeenCalledTimes(1);
});

test('something presented within the settling time holds the request back until it closes', async () => {
  const view = await render(app());
  await act(() => jest.advanceTimersByTime(REVIEW_REQUEST_SETTLE_MS - 1));
  await view.rerender(app(0, true));
  await settle();
  expect(mockRequest).not.toHaveBeenCalled();

  await view.rerender(app(0, false));
  await settle();
  expect(mockRequest).toHaveBeenCalledTimes(1);
});

test('an app that is not active asks nothing, and asks once it is active again', async () => {
  await render(app());
  await moveApp('inactive');
  await settle();
  expect(mockRequest).not.toHaveBeenCalled();

  await moveApp('active');
  await settle();
  expect(mockRequest).toHaveBeenCalledTimes(1);
});

// iOS can suspend the process before this thread hears the change, so the request reads the
// app's state when it fires.
test('an app found not active when the request fires asks nothing then, and asks once it is active', async () => {
  await render(app());
  AppState.currentState = 'background';
  await settle();
  expect(mockRequest).not.toHaveBeenCalled();

  await moveApp('active');
  await settle();
  expect(mockRequest).toHaveBeenCalledTimes(1);
});

test('Android asks nothing', async () => {
  jest.replaceProperty(Platform, 'OS', 'android');
  const view = await render(app(0));
  await settle();
  await view.rerender(app(1));
  await settle();
  expect(mockRequest).not.toHaveBeenCalled();
});

// The launch's motion runs on the UI thread; every timing that reports its end is held here
// until the test ends it, as the UI thread would.
function holdLaunchMotion() {
  const running: { duration: number; end: (finished: boolean) => void }[] = [];
  const shared = Reanimated.useSharedValue;
  jest.spyOn(Reanimated, 'withTiming').mockImplementation(((
    toValue: number,
    config?: { duration?: number },
    callback?: (finished?: boolean) => void,
  ) => {
    if (callback) running.push({ duration: config?.duration ?? 0, end: (finished) => callback(finished) });
    return toValue;
  }) as unknown as typeof Reanimated.withTiming);
  jest.spyOn(Reanimated, 'useSharedValue').mockImplementation(((initial: number) => {
    const [value] = useState(() => shared(initial));
    return value;
  }) as unknown as typeof Reanimated.useSharedValue);
  Object.assign(globalThis, {
    requestAnimationFrame: (callback: (now: number) => void) => setTimeout(() => callback(performance.now()), 0),
    cancelAnimationFrame: (handle: ReturnType<typeof setTimeout>) => clearTimeout(handle),
  });
  return async (duration: number) => {
    const index = running.findIndex((timing) => timing.duration === duration);
    expect(index).toBeGreaterThanOrEqual(0);
    const [timing] = running.splice(index, 1);
    await act(() => timing!.end(true));
    await act(() => jest.advanceTimersByTime(0));
  };
}

test('a return that plays the launch asks once its layer has gone, never while it plays', async () => {
  const end = holdLaunchMotion();
  const { launch, normal } = standardMotion;
  await render(
    <LaunchCurtain cold={false} onFirstFrame={jest.fn()} readiness="ready" seen>
      <ReviewRequestObserver />
    </LaunchCurtain>,
  );
  await settle();
  expect(mockRequest).toHaveBeenCalledTimes(1);

  // Leaving prepares the return layer, unseen; 65 s later the app is active and it plays.
  await moveApp('inactive');
  await moveApp('background');
  await act(() => jest.advanceTimersByTime(65_000));
  await moveApp('active');
  await act(() => jest.advanceTimersByTime(32));
  // The dive and the fade take as long as the UI thread takes; the request waits for them all.
  await act(() => jest.advanceTimersByTime(10 * REVIEW_REQUEST_SETTLE_MS));
  expect(mockRequest).toHaveBeenCalledTimes(1);
  await end(launch);
  await settle();
  expect(mockRequest).toHaveBeenCalledTimes(1);
  await end(normal);
  await act(() => jest.advanceTimersByTime(REVIEW_REQUEST_SETTLE_MS - 1));
  expect(mockRequest).toHaveBeenCalledTimes(1);
  await act(() => jest.advanceTimersByTime(1));
  expect(mockRequest).toHaveBeenCalledTimes(2);
  await settle();
  expect(mockRequest).toHaveBeenCalledTimes(2);
});
